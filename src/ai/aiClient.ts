import { GoogleGenAI } from "@google/genai";
import {
  GeminiAccount,
  GeminiErrorReason,
  StructuredGeminiError,
  buildBatchVerbPrompt,
  buildBatchVocabPrompt,
  buildSynonymsPrompt,
  buildVerbFillPrompt,
  buildVocabFillPrompt,
  cleanConjugationPronouns,
  createGeminiError,
  generateWithFallback,
  parseCleanJson,
  VOCAB_FILL_SCHEMA,
} from "./geminiCore";

// ---------------------------------------------------------------------------
// Client-side AI layer.
//
// Why this exists: when the app is packaged as a desktop executable (Tauri),
// there is no Express server running, so relative fetch("/api/gemini/...")
// calls used to receive index.html back and crashed with:
//   "Unexpected token '<', "<!doctype "... is not valid JSON"
//
// Strategy (keeps the exact same JSON response shapes the UI already handles):
//   1. If VITE_API_BASE_URL is configured, try the remote backend first.
//   2. If that is unavailable or returns non-JSON (e.g. an HTML page),
//      fall back to calling the Gemini API directly from the client using
//      VITE_GEMINI_API_KEY (+ optional VITE_GEMINI_API_KEY_2, _3, ...).
//   3. Otherwise return a structured { success: false, userMessage } object
//      with a clear Persian error instead of a cryptic JSON parse error.
// ---------------------------------------------------------------------------

const API_BASE = String(
  import.meta.env.VITE_API_BASE_URL || ""
).trim().replace(/\/+$/, "");

// Process-lifetime (page-lifetime) cache of models confirmed retired/unavailable per account
const retiredModels = new Set<string>();

let cachedAccounts: GeminiAccount[] | null = null;

function getClientAccounts(): GeminiAccount[] {
  if (cachedAccounts) return cachedAccounts;

  const env = import.meta.env;
  const accounts: GeminiAccount[] = [];

  const primaryKey = env.VITE_GEMINI_API_KEY;
  if (primaryKey && primaryKey.trim()) {
    accounts.push({
      client: new GoogleGenAI({ apiKey: primaryKey.trim() }),
      label: "primary",
    });
  }

  // Optional extra accounts (mirrors the server's Nth_account_of_gais discovery):
  // VITE_GEMINI_API_KEY_2, VITE_GEMINI_API_KEY_3, ...
  const extraPattern = /^VITE_GEMINI_API_KEY_(\d+)$/;
  const extras: { key: string; label: string; num: number }[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || !value || !value.trim()) continue;
    const match = name.match(extraPattern);
    if (match) {
      extras.push({ key: value.trim(), label: `account-${match[1]}`, num: parseInt(match[1], 10) });
    }
  }
  extras.sort((a, b) => a.num - b.num);
  for (const extra of extras) {
    accounts.push({
      client: new GoogleGenAI({ apiKey: extra.key }),
      label: extra.label,
    });
  }

  cachedAccounts = accounts;
  return accounts;
}

function clientLogger(level: "log" | "warn" | "error", msg: string) {
  if (level === "error") console.error(msg);
  else if (level === "warn") console.warn(msg);
  else console.log(msg);
}

/**
 * POSTs to the remote backend (if configured) and returns parsed JSON.
 * Returns null when: no backend configured, network failure, or the response
 * is not JSON (e.g. an HTML "<!doctype html>" page).
 */
async function fetchFromBackend(path: string, body: any): Promise<any | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    // Guard against HTML responses (SPA fallback / login pages / proxies)
    if (rawText.trim().startsWith("<")) return null;
    if (!contentType.includes("application/json")) {
      // Still try to parse — some servers omit the header for valid JSON
      try {
        return JSON.parse(rawText);
      } catch {
        return null;
      }
    }
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

async function runDirectGemini(params: {
  contents: string;
  responseSchema?: any;
}): Promise<string> {
  const accounts = getClientAccounts();
  if (accounts.length === 0) {
    const err = createGeminiError(
      "auth_error",
      "No Gemini API key available in the packaged app (VITE_GEMINI_API_KEY is not set)."
    );
    throw err;
  }
  return generateWithFallback({ accounts, params, retiredModels, logger: clientLogger });
}

function toErrorResponse(err: any): any {
  const structured = err as StructuredGeminiError;
  const userMessage = structured?.userMessage || err?.message || "AI request failed.";
  const reason: GeminiErrorReason = structured?.reason || "unknown";
  return { success: false, error: userMessage, userMessage, reason };
}

/**
 * Executes one Gemini endpoint locally (in-app) with the exact same logic the
 * server uses, and returns the exact same JSON response shape.
 * Returns null if this path is unknown or no API key is available.
 */
async function tryDirectGemini(path: string, body: any): Promise<any | null> {
  const accounts = getClientAccounts();
  if (accounts.length === 0) return null;

  try {
    switch (path) {
      case "/api/gemini/vocab-fill": {
        const { word, currentData } = body;
        if (!word || typeof word !== "string" || !word.trim()) {
          return { success: false, error: "German word is required." };
        }
        const jsonText = await runDirectGemini({
          contents: buildVocabFillPrompt(word, currentData),
          responseSchema: VOCAB_FILL_SCHEMA,
        });
        const data = parseCleanJson(jsonText);
        return { success: true, data };
      }

      case "/api/gemini/verb-fill": {
        const { infinitive, currentData } = body;
        if (!infinitive || typeof infinitive !== "string" || !infinitive.trim()) {
          return { success: false, error: "Infinitive verb is required." };
        }
        const jsonText = await runDirectGemini({
          contents: buildVerbFillPrompt(infinitive, currentData),
        });
        let data = parseCleanJson(jsonText);
        data = cleanConjugationPronouns(data);
        return { success: true, data };
      }

      case "/api/gemini/batch-vocab-fill": {
        const { items } = body;
        if (!Array.isArray(items) || items.length === 0) {
          return { success: false, error: "Array of items is required." };
        }
        const jsonText = await runDirectGemini({
          contents: buildBatchVocabPrompt(items),
        });
        const parsed = parseCleanJson(jsonText);
        return { success: true, items: parsed.items || [] };
      }

      case "/api/gemini/batch-verb-fill": {
        const { items } = body;
        if (!Array.isArray(items) || items.length === 0) {
          return { success: false, error: "Array of items is required." };
        }
        const jsonText = await runDirectGemini({
          contents: buildBatchVerbPrompt(items),
        });
        const parsed = parseCleanJson(jsonText);
        if (Array.isArray(parsed.items)) {
          parsed.items = parsed.items.map((vItem: any) => cleanConjugationPronouns(vItem));
        }
        return { success: true, items: parsed.items || [] };
      }

      case "/api/gemini/synonyms-generate": {
        const jsonText = await runDirectGemini({
          contents: buildSynonymsPrompt(body),
        });
        const data = parseCleanJson(jsonText);
        return { success: true, data };
      }

      default:
        return null;
    }
  } catch (err: any) {
    return toErrorResponse(err);
  }
}

/**
 * Drop-in replacement for the old fetch("/api/gemini/...") + res.json() pattern.
 * Never throws — always resolves to the same JSON shape the UI expects:
 *   { success: true, data?/items? }  or  { success: false, error, userMessage, reason }
 */
export async function aiPost(path: string, body: any): Promise<any> {
  // 1) Try the configured remote backend first (multi-account fallback lives there)
  const backendResult = await fetchFromBackend(path, body);
  if (backendResult && backendResult.success) return backendResult;

  // 2) Fall back to calling Gemini directly from the app
  const directResult = await tryDirectGemini(path, body);
  if (directResult && directResult.success) return directResult;

  // 3) Surface the most informative failure we have
  if (directResult) return directResult;
  if (backendResult) return backendResult;

  const err = createGeminiError(
    "unknown",
    "AI backend is unreachable and no in-app Gemini API key (VITE_GEMINI_API_KEY) is configured."
  );
  return toErrorResponse(err);
}

// Typed endpoint helpers (same paths/behaviour as the Express API)
export const geminiApi = {
  vocabFill: (body: { word: string; currentData?: any }) =>
    aiPost("/api/gemini/vocab-fill", body),
  verbFill: (body: { infinitive: string; currentData?: any }) =>
    aiPost("/api/gemini/verb-fill", body),
  batchVocabFill: (body: { items: any[] }) =>
    aiPost("/api/gemini/batch-vocab-fill", body),
  batchVerbFill: (body: { items: any[] }) =>
    aiPost("/api/gemini/batch-verb-fill", body),
  synonymsGenerate: (body: {
    mode?: string;
    topic?: string;
    currentGroup?: any;
    existingWords?: any[];
    type?: string;
  }) => aiPost("/api/gemini/synonyms-generate", body),
};
