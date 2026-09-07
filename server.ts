import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import {
  GeminiAccount,
  GeminiGenerateParams,
  StructuredGeminiError,
  buildBatchVerbPrompt,
  buildBatchVocabPrompt,
  buildSynonymsPrompt,
  buildVerbFillPrompt,
  buildVocabFillPrompt,
  cleanConjugationPronouns,
  GEMINI_FALLBACK_MODELS,
  generateWithFallback,
  parseCleanJson,
  VOCAB_FILL_SCHEMA,
} from "./src/ai/geminiCore";

export { GEMINI_FALLBACK_MODELS };

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// CORS: allow the packaged desktop app (Tauri WebView) and other origins to
// call this backend cross-origin. Without this, the exe build that points at
// a deployed backend gets blocked by the browser instead of receiving JSON.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Initialize and cache ordered Gemini Clients for multi-account fallback
interface GeminiClientEntry {
  client: GoogleGenAI;
  label: string;
}

// In-memory process-lifetime cache of models confirmed retired/unavailable per account (404 / no longer available)
// Key format: `${accountLabel}:${modelName}`
const retiredModels = new Set<string>();

function discoverGeminiApiKeys(): { key: string; label: string }[] {
  const primaryKey = process.env.GEMINI_API_KEY;
  if (!primaryKey || !primaryKey.trim()) {
    throw new Error("GEMINI_API_KEY is missing from environment variables.");
  }

  const entries: { key: string; label: string; num: number }[] = [];

  // Dynamic regex scan for all fallback accounts (e.g. 2th_account_of_gais, 3th_account_of_gais, 5th_account_of_gais)
  const accountPattern = /^(\d+)th_account_of_gais$/i;

  for (const [envVarName, envVarVal] of Object.entries(process.env)) {
    if (!envVarVal || !envVarVal.trim()) continue;
    const match = envVarName.match(accountPattern);
    if (match) {
      const num = parseInt(match[1], 10);
      entries.push({
        key: envVarVal.trim(),
        label: `account-${num}`,
        num,
      });
    }
  }

  // Sort matched fallback accounts ascending by numeric prefix
  entries.sort((a, b) => a.num - b.num);

  const result: { key: string; label: string }[] = [
    { key: primaryKey.trim(), label: "primary" },
    ...entries.map((e) => ({ key: e.key, label: e.label })),
  ];

  return result;
}

let cachedGeminiClients: GeminiClientEntry[] | null = null;

function getOrderedGeminiClients(): GeminiAccount[] {
  if (cachedGeminiClients) {
    return cachedGeminiClients;
  }

  const keyEntries = discoverGeminiApiKeys();
  cachedGeminiClients = keyEntries.map((entry) => ({
    client: new GoogleGenAI({
      apiKey: entry.key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    }),
    label: entry.label,
  }));

  return cachedGeminiClients;
}

// Robust Gemini execution helper with multi-account failover and automatic model fallback
async function callGeminiWithFallback(params: GeminiGenerateParams): Promise<string> {
  const clients = getOrderedGeminiClients();
  return generateWithFallback({
    accounts: clients,
    params,
    retiredModels,
    logger: (level, msg) => {
      if (level === "error") console.error(msg);
      else if (level === "warn") console.warn(msg);
      else console.log(msg);
    },
  });
}

function respondGeminiError(res: express.Response, err: any, fallbackMessage: string) {
  const reason = (err as StructuredGeminiError)?.reason || "unknown";
  if (reason === "unknown") {
    console.error("[Unknown Gemini Error]", err);
  }
  res.status(500).json({
    success: false,
    error: (err as StructuredGeminiError)?.userMessage || err?.message || fallbackMessage,
    userMessage: (err as StructuredGeminiError)?.userMessage,
    reason: reason,
    ...(reason === "unknown"
      ? { debugRaw: { message: err?.message || String(err), stack: err?.stack, full: String(err) } }
      : {}),
  });
}

// API: Auto-fill Vocabulary Details
app.post("/api/gemini/vocab-fill", async (req, res) => {
  try {
    const { word, currentData } = req.body;
    if (!word || typeof word !== "string" || !word.trim()) {
      return res.status(400).json({ error: "German word is required." });
    }

    const jsonText = await callGeminiWithFallback({
      contents: buildVocabFillPrompt(word, currentData),
      responseSchema: VOCAB_FILL_SCHEMA,
    });

    const data = parseCleanJson(jsonText);
    res.json({ success: true, data });
  } catch (err: any) {
    respondGeminiError(res, err, "Failed to analyze vocabulary word.");
  }
});

// API: Auto-fill Verb Details & Conjugations
app.post("/api/gemini/verb-fill", async (req, res) => {
  try {
    const { infinitive, currentData } = req.body;
    if (!infinitive || typeof infinitive !== "string" || !infinitive.trim()) {
      return res.status(400).json({ error: "Infinitive verb is required." });
    }

    const jsonText = await callGeminiWithFallback({
      contents: buildVerbFillPrompt(infinitive, currentData),
    });
    let data = parseCleanJson(jsonText);
    data = cleanConjugationPronouns(data);
    res.json({ success: true, data });
  } catch (err: any) {
    respondGeminiError(res, err, "Failed to analyze verb.");
  }
});

// API: Batch Auto-fill Vocabulary Items (JSON Import or Batch Enrich)
app.post("/api/gemini/batch-vocab-fill", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array of items is required." });
    }

    const jsonText = await callGeminiWithFallback({
      contents: buildBatchVocabPrompt(items),
    });
    const parsed = parseCleanJson(jsonText);
    res.json({ success: true, items: parsed.items || [] });
  } catch (err: any) {
    respondGeminiError(res, err, "Failed to process batch vocabulary.");
  }
});

// API: Batch Auto-fill Verbs (JSON Import or Batch Enrich)
app.post("/api/gemini/batch-verb-fill", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array of items is required." });
    }

    const jsonText = await callGeminiWithFallback({
      contents: buildBatchVerbPrompt(items),
    });
    let parsed = parseCleanJson(jsonText);
    if (Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map((vItem: any) => cleanConjugationPronouns(vItem));
    }
    res.json({ success: true, items: parsed.items || [] });
  } catch (err: any) {
    respondGeminiError(res, err, "Failed to process batch verbs.");
  }
});

// API: Generate or Complete Synonym / Antonym / Word Family / Semantic Field / Comparative Adjective Groups
app.post("/api/gemini/synonyms-generate", async (req, res) => {
  try {
    const jsonText = await callGeminiWithFallback({
      contents: buildSynonymsPrompt(req.body),
    });
    const data = parseCleanJson(jsonText);
    res.json({ success: true, data });
  } catch (err: any) {
    respondGeminiError(res, err, "Failed to generate synonym group.");
  }
});

// JSON 404 for any unknown /api route: never leak HTML ("Cannot POST /api/..."),
// which used to surface in clients as: Unexpected token '<' ... is not valid JSON
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Start Express + Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
