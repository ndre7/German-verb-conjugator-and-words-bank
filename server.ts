import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Initialize Gemini Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from environment variables.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Robust Gemini execution helper with automatic model fallback on rate limit / 429 quota errors
async function callGeminiWithFallback(
  ai: GoogleGenAI,
  params: { contents: string; responseSchema?: any; responseMimeType?: string }
): Promise<string> {
  const models = [
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash",
  ];
  let lastError: any = null;

  for (const model of models) {
    try {
      const config: any = {
        responseMimeType: params.responseMimeType || "application/json",
      };
      if (params.responseSchema) {
        config.responseSchema = params.responseSchema;
      }

      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config,
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`[Gemini Fallback] Model ${model} failed:`, err.message || err);
      lastError = err;
      // Continue loop to try next fallback model (e.g. gemini-2.5-flash, then gemini-2.5-flash-lite)
    }
  }

  throw lastError || new Error("All Gemini models failed to generate content.");
}

// API: Auto-fill Vocabulary Details
app.post("/api/gemini/vocab-fill", async (req, res) => {
  try {
    const { word, currentData } = req.body;
    if (!word || typeof word !== "string" || !word.trim()) {
      return res.status(400).json({ error: "German word is required." });
    }

    const ai = getGeminiClient();
    const prompt = `You are a German lexicographer and Persian translation specialist.
Analyze the following German vocabulary word or phrase: "${word.trim()}".
Existing user data if any: ${JSON.stringify(currentData || {})}

CRITICAL RULES:
1. SPELL CORRECTION & CANONICAL MATCH: If the input word typed by the user has a spelling mistake or typo (e.g. "Hous" instead of "Haus", "schnel" instead of "schnell"), identify the closest correct German word and return the CORRECT German word in the "word" field!
2. Provide complete lexicographical data in JSON:
- article: "der", "die", "das", or "none" (for verbs/adjectives/phrases/nouns without gender)
- word: The clean, correct German base word without the article (e.g. "Haus" or "schnell")
- meaning: Provide ALL distinct Persian meanings/translations of this word. If it has multiple meanings or nuances, list them clearly (e.g. "۱. خانه، مسکن | ۲. بستر، آشیانه").
- plural: Plural form with article or suffix (e.g. "die Häuser" or "-¨er"). If not a noun or no plural, return empty string "".
- partOfSpeech: One of ["noun", "verb_phrase", "adjective", "adverb", "preposition", "pronoun", "conjunction", "expression"]
- example: ONLY the German example sentence showing usage in context. DO NOT include any Persian translation inside this example field!
- notes: Usage notes in Persian explaining grammatical nuances, collocations, or prepositions.
`;

    const jsonText = await callGeminiWithFallback(ai, {
      contents: prompt,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          article: { type: Type.STRING, description: "der, die, das, or none" },
          word: { type: Type.STRING },
          meaning: { type: Type.STRING },
          plural: { type: Type.STRING },
          partOfSpeech: { type: Type.STRING },
          example: { type: Type.STRING },
          notes: { type: Type.STRING },
        },
        required: ["article", "word", "meaning", "partOfSpeech", "example", "notes"],
      },
    });

    const data = JSON.parse(jsonText);
    res.json({ success: true, data });
  } catch (err: any) {
    console.error("Error in /api/gemini/vocab-fill:", err);
    res.status(500).json({ error: err.message || "Failed to analyze vocabulary word." });
  }
});

// API: Auto-fill Verb Details & Conjugations
app.post("/api/gemini/verb-fill", async (req, res) => {
  try {
    const { infinitive, currentData } = req.body;
    if (!infinitive || typeof infinitive !== "string" || !infinitive.trim()) {
      return res.status(400).json({ error: "Infinitive verb is required." });
    }

    const ai = getGeminiClient();
    const prompt = `You are a German grammar and verb conjugation expert for Persian speakers.
Provide complete conjugations and grammatical analysis for the German verb: "${infinitive.trim()}".
Existing user data: ${JSON.stringify(currentData || {})}

CRITICAL RULES:
1. SPELL CORRECTION & CANONICAL VERB: If the user's input verb contains a spelling mistake or typo (e.g. 'sprechne' instead of 'sprechen', 'gehn' instead of 'gehen', 'kaufn' instead of 'kaufen'), identify the closest correct German infinitive verb and set the 'infinitive' field in JSON to that CORRECT German infinitive verb!
2. CATEGORIES & CASE GOVERNANCE TAGS: Automatically assign ALL matching category IDs from:
   - 'regular' (با‌قاعده)
   - 'irregular' (بی‌قاعده)
   - 'separable' (جداشدنی)
   - 'reflexive' (انعکاسی)
   - 'akkusativ' (فعل آکوزاتیو ساز / نیازمند مفعول مستقیم Akkusativ)
   - 'dativ' (فعل داتیو ساز / نیازمند مفعول غیرمستقیم Dativ)
   Determine whether this verb takes Akkusativ, Dativ, or both (e.g. 'helfen' -> ['dativ'], 'kaufen' -> ['akkusativ', 'dativ'], 'sehen' -> ['akkusativ']) and include 'akkusativ' and/or 'dativ' in the 'categories' array!
3. Provide full, non-truncated conjugations for ALL 6 persons (S1=ich, S2=du, S3=er/sie/es, P1=wir, P2=ihr, P3=sie/Sie) for ALL 9 TENSES:
   - PRASENS (زمان حال)
   - PERFEKT (گذشته نقلی / ماضی نقلی)
   - PRATERITUM (گذشته ساده / ماضی استمراری)
   - KONJUNKTIV2_PRATERITUM (التزامی / شرطی نوع ۲ - e.g., ich spräche, du sprächest...)
   - FUTUR1 (آینده ۱)
   - PLUSQUAMPERFEKT (ماضی بعید)
   - KONJUNKTIV1_PRASENS (التزامی ۱ / نقل قول - e.g., ich spreche, du sprechest...)
   - FUTUR2 (آینده کامل)
   - IMPERATIV (امر - S2: du, P1: wir, P2: ihr, P3: Sie)

Return JSON matching this exact structure:
- infinitive: Clean, correct German infinitive verb (e.g. "sprechen")
- bedeutung: Clear Persian translations of the verb (all major meanings)
- hilfsverb: "haben" or "sein" or "haben / sein"
- prepositions: Common prepositions used with this verb (e.g., "mit + Dat, über + Akk")
- example: German example sentence using the verb.
- notes: Usage tips or grammatical nuances in Persian.
- categories: Array of matching category IDs from ["regular", "irregular", "separable", "reflexive", "akkusativ", "dativ", "favorites"]
- conjugations: Object containing ALL 9 tenses keys: PRASENS, PERFEKT, PRATERITUM, KONJUNKTIV2_PRATERITUM, FUTUR1, PLUSQUAMPERFEKT, KONJUNKTIV1_PRASENS, FUTUR2, IMPERATIV.
  Each tense MUST have keys S1, S2, S3, P1, P2, P3 with string arrays containing the conjugated form (e.g. S1: ["ich spreche"]).
`;

    const jsonText = await callGeminiWithFallback(ai, { contents: prompt });
    const data = JSON.parse(jsonText);
    res.json({ success: true, data });
  } catch (err: any) {
    console.error("Error in /api/gemini/verb-fill:", err);
    res.status(500).json({ error: err.message || "Failed to analyze verb." });
  }
});

// API: Batch Auto-fill Vocabulary Items (JSON Import or Batch Enrich)
app.post("/api/gemini/batch-vocab-fill", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array of items is required." });
    }

    const ai = getGeminiClient();
    const prompt = `You are a German lexicographer.
Fill in any missing or incomplete fields (article, meaning in Persian listing all major meanings, plural, partOfSpeech, example sentence with Persian translation, usage notes in Persian) for each of the following vocabulary items:
${JSON.stringify(items, null, 2)}

Return a JSON object with key "items" containing the completed list of objects.
Each object must have:
- article: "der" | "die" | "das" | "none"
- word: Clean German word (without article inside the word string)
- meaning: Persian translations (all major meanings)
- plural: Plural form
- partOfSpeech: "noun" | "verb_phrase" | "adjective" | "adverb" | "preposition" | "pronoun" | "conjunction" | "expression"
- example: German example sentence + Persian translation
- notes: Concise usage notes in Persian
`;

    const jsonText = await callGeminiWithFallback(ai, { contents: prompt });
    const parsed = JSON.parse(jsonText);
    res.json({ success: true, items: parsed.items || [] });
  } catch (err: any) {
    console.error("Error in /api/gemini/batch-vocab-fill:", err);
    res.status(500).json({ error: err.message || "Failed to process batch vocabulary." });
  }
});

// API: Batch Auto-fill Verbs (JSON Import or Batch Enrich)
app.post("/api/gemini/batch-verb-fill", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array of verb items is required." });
    }

    const ai = getGeminiClient();
    const prompt = `You are a German verb conjugation expert.
Fill in any missing fields (bedeutung in Persian, hilfsverb, prepositions, categories array from ['regular', 'irregular', 'separable', 'reflexive', 'akkusativ', 'dativ'], complete conjugations for ALL persons across PRASENS, PRATERITUM, PERFEKT, KONJUNKTIV2_PRATERITUM, FUTUR1, PLUSQUAMPERFEKT, KONJUNKTIV1_PRASENS, FUTUR2, IMPERATIV) for the following German verbs:
${JSON.stringify(items, null, 2)}

Return a JSON object with key "items" containing the completed list of verb items.
`;

    const jsonText = await callGeminiWithFallback(ai, { contents: prompt });
    const parsed = JSON.parse(jsonText);
    res.json({ success: true, items: parsed.items || [] });
  } catch (err: any) {
    console.error("Error in /api/gemini/batch-verb-fill:", err);
    res.status(500).json({ error: err.message || "Failed to process batch verbs." });
  }
});

// API: Generate or Complete Synonym / Antonym / Word Family / Semantic Field Groups
app.post("/api/gemini/synonyms-generate", async (req, res) => {
  try {
    const { mode, topic, currentGroup, existingWords, type } = req.body;
    const ai = getGeminiClient();

    const groupType = type || (currentGroup ? currentGroup.type : "synonym");

    let groupDescription = "";
    if (groupType === "synonym") {
      groupDescription = "German synonyms (مترادف‌ها - words with similar meanings)";
    } else if (groupType === "antonym") {
      groupDescription = "German antonyms (متضادها - words with opposite meanings)";
    } else if (groupType === "word_family") {
      groupDescription = "German Word Family (هم‌خانواده / Wortfamilie - words derived from a common root word using prefixes/suffixes like fahren -> abfahren, Erfahung, Fahrt)";
    } else if (groupType === "semantic_field") {
      groupDescription = "German Semantic Field / Word Field (جهان معانی مشترک / Wortfeld - words sharing a common conceptual area e.g. time domain: Uhr, Tag, Monat, Jahr, Minute)";
    } else if (groupType === "idiom") {
      groupDescription = "German Idioms / Expressions (اصطلاحات و تعابیر کاربردی / Redewendungen - real-life expressions used in specific contexts e.g. greetings, shopping, express agreement/disagreement)";
    }

    let prompt = "";
    if (mode === "complete_group" && currentGroup) {
      prompt = `You are a German vocabulary expert.
Complete and expand this existing ${groupType} group (${groupDescription}) titled "${currentGroup.title}":
Current items: ${JSON.stringify(currentGroup.items || [])}
Current notes: "${currentGroup.notes || ""}"

CRITICAL INSTRUCTIONS:
1. ARTICLES & PART OF SPEECH: For every German word/item, strictly place 'der', 'die', or 'das' into the 'article' field if it is a noun. Set article: 'none' for non-nouns or verbs. Specify 'partOfSpeech' from ["noun", "verb_phrase", "adjective", "adverb", "preposition", "pronoun", "conjunction", "expression"].
2. NOTES: The 'notes' field MUST be concise, bullet-point-focused usage notes in Persian explaining WHERE and WHEN to use these expressions/words (نکته‌محور، خلاصه و کاربردی). Keep it to 2-3 short bullet points max. DO NOT WRITE LONG PARAGRAPHS.

Return JSON:
{
  "title": "${currentGroup.title}",
  "type": "${groupType}",
  "items": [
    { "word": "clean German word/phrase", "article": "der/die/das/none", "partOfSpeech": "noun/expression/verb_phrase/adjective", "meaning": "Persian translation" }
  ],
  "notes": "• نکته اول\\n• نکته دوم"
}`;
    } else {
      prompt = `You are a German vocabulary expert.
Create a high-quality ${groupType} group (${groupDescription}) for German language learners.
Topic/Keyword: "${topic || "General Vocabulary"}"
Existing vocabulary in user's bank (if relevant): ${JSON.stringify((existingWords || []).slice(0, 30))}

CRITICAL INSTRUCTIONS:
1. ARTICLES & PART OF SPEECH: For every German word/item, strictly place 'der', 'die', or 'das' into the 'article' field if it is a noun. Set article: 'none' for non-nouns or verbs. Specify 'partOfSpeech' from ["noun", "verb_phrase", "adjective", "adverb", "preposition", "pronoun", "conjunction", "expression"].
2. NOTES: The 'notes' field MUST be concise, bullet-point-focused usage notes in Persian explaining WHERE and WHEN to use these expressions/words (نکته‌محور، خلاصه و کاربردی با توجه به موقعیت). Keep it to 2-3 short bullet points max. DO NOT WRITE LONG PARAGRAPHS.

Return JSON:
{
  "title": "Clear descriptive title in Persian & German",
  "type": "${groupType}",
  "items": [
    { "word": "clean German word/phrase", "article": "der/die/das/none", "partOfSpeech": "noun/expression/verb_phrase/adjective", "meaning": "Persian translation" }
  ],
  "notes": "• نکته اول\\n• نکته دوم"
}`;
    }

    const jsonText = await callGeminiWithFallback(ai, { contents: prompt });
    const data = JSON.parse(jsonText);
    res.json({ success: true, data });
  } catch (err: any) {
    console.error("Error in /api/gemini/synonyms-generate:", err);
    res.status(500).json({ error: err.message || "Failed to generate synonym group." });
  }
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
