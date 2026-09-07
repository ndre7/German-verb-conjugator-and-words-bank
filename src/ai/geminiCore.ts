import { GoogleGenAI, Type } from "@google/genai";

// ---------------------------------------------------------------------------
// Shared Gemini infrastructure used by BOTH the Express server (server.ts)
// and the in-app client fallback (src/ai/aiClient.ts).
// ---------------------------------------------------------------------------

// Models scheduled for shutdown on Oct 16, 2026; 2.5 family may show intermittent 404s.
// gemini-3.6-flash is currently recommended & stable.
export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
];

export type GeminiErrorReason =
  | "quota_exhausted"
  | "model_unavailable"
  | "auth_error"
  | "unknown";

export interface StructuredGeminiError extends Error {
  reason: GeminiErrorReason;
  userMessage: string;
}

export function createGeminiError(
  reason: GeminiErrorReason,
  message: string
): StructuredGeminiError {
  let userMessage = "خطایی در برقراری ارتباط با سرویس هوش مصنوعی رخ داد. لطفاً دوباره تلاش کنید.";
  if (reason === "quota_exhausted") {
    userMessage = "سقف استفاده از تمامی حسابهای هوش مصنوعی موقتاً به پایان رسیده است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.";
  } else if (reason === "model_unavailable") {
    userMessage = "مدلهای هوش مصنوعی مورد نظر در حال حاضر در دسترس نیستند. لطفاً بعداً تلاش کنید.";
  } else if (reason === "auth_error") {
    userMessage = "خطا در احراز هویت کلیدهای هوش مصنوعی. لطفاً تنظیمات حسابها را بررسی کنید.";
  }

  const err = new Error(message) as StructuredGeminiError;
  err.reason = reason;
  err.userMessage = userMessage;
  return err;
}

export function parseCleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned);
}

// Helper function to strip German pronouns from conjugation output strings
export function cleanConjugationPronouns(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const PRONOUN_REGEX = /^(ich|du|er\/sie\/es|er\/es\/sie|er|sie|es|wir|ihr|sie\/Sie|Sie)\s+/i;

  if (obj.conjugations && typeof obj.conjugations === "object") {
    for (const tenseKey of Object.keys(obj.conjugations)) {
      const tense = obj.conjugations[tenseKey];
      if (tense && typeof tense === "object") {
        for (const pKey of Object.keys(tense)) {
          if (Array.isArray(tense[pKey])) {
            tense[pKey] = tense[pKey].map((val: any) =>
              typeof val === "string" ? val.replace(PRONOUN_REGEX, "").trim() : val
            );
          } else if (typeof tense[pKey] === "string") {
            tense[pKey] = tense[pKey].replace(PRONOUN_REGEX, "").trim();
          }
        }
      }
    }
  }
  return obj;
}

export interface GeminiGenerateParams {
  contents: string;
  responseSchema?: any;
  responseMimeType?: string;
}

export interface GeminiAccount {
  client: GoogleGenAI;
  label: string;
}

function classifyGeminiError(err: any): {
  isAuthError: boolean;
  isModelUnavailable: boolean;
  isQuotaError: boolean;
} {
  const errStr = (err?.message || err?.toString() || "").toLowerCase();
  const errStatus = err?.status || err?.code || 0;

  const isAuthError =
    errStatus === 401 ||
    errStatus === 403 ||
    errStr.includes("401") ||
    errStr.includes("403") ||
    errStr.includes("unauthenticated") ||
    errStr.includes("permission_denied") ||
    errStr.includes("invalid api key") ||
    errStr.includes("api_key_invalid");

  const isModelUnavailable =
    errStatus === 404 ||
    errStr.includes("404") ||
    errStr.includes("not_found") ||
    errStr.includes("not found") ||
    errStr.includes("no longer available") ||
    errStr.includes("deprecated") ||
    errStr.includes("retired");

  const isQuotaError =
    errStatus === 429 ||
    errStr.includes("429") ||
    errStr.includes("resource_exhausted") ||
    errStr.includes("rate limit") ||
    errStr.includes("quota");

  return { isAuthError, isModelUnavailable, isQuotaError };
}

// Robust Gemini execution helper with multi-account failover and automatic model fallback.
// Runs identically on the server (Node) and inside the app (browser WebView).
export async function generateWithFallback(options: {
  accounts: GeminiAccount[];
  params: GeminiGenerateParams;
  retiredModels?: Set<string>;
  logger?: (level: "log" | "warn" | "error", msg: string) => void;
}): Promise<string> {
  const { accounts, params, retiredModels, logger } = options;
  const log = (level: "log" | "warn" | "error", msg: string) => {
    if (logger) logger(level, msg);
  };

  let lastError: any = null;
  let encounteredQuota = false;
  let encounteredModelUnavailable = false;
  let encounteredAuth = false;

  // Outer loop: Iterate over accounts (Primary -> account-2 -> account-3 -> ...)
  for (const { client, label } of accounts) {
    let skipAccount = false;

    // Inner loop: Iterate over models for current account
    for (const model of GEMINI_FALLBACK_MODELS) {
      if (skipAccount) break;

      // Check if model is already known to be retired/unavailable for this specific account
      const accountModelKey = `${label}:${model}`;
      if (retiredModels && retiredModels.has(accountModelKey)) {
        log("log", `[Gemini Cache Skip] Model "${model}" is retired/unavailable for account "${label}", skipping.`);
        continue;
      }

      try {
        const config: any = {
          responseMimeType: params.responseMimeType || "application/json",
        };
        if (params.responseSchema) {
          config.responseSchema = params.responseSchema;
        }

        const response = await client.models.generateContent({
          model,
          contents: params.contents,
          config,
        });

        if (response && response.text) {
          log("log", `[Gemini Success] Account: ${label}, Model: ${model}`);
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        const { isAuthError, isModelUnavailable, isQuotaError } = classifyGeminiError(err);

        // 1. Auth/Key error (401, 403, invalid key) -> skip entire account immediately
        if (isAuthError) {
          encounteredAuth = true;
          log("warn", `[Gemini Auth Failure] Account "${label}" returned 401/403 unauthorized. Skipping remaining models for this account.`);
          skipAccount = true;
          break;
        }

        // 2. Model Unavailable / Retired / Not Found
        if (isModelUnavailable) {
          encounteredModelUnavailable = true;
          if (retiredModels) retiredModels.add(accountModelKey);
          log("warn", `[Gemini Model Unavailable] Model "${model}" retired/unreachable for account "${label}", added to retired cache and skipping.`);
          continue; // Try next model for same account
        }

        // 3. Quota / Rate-limit error -> try next model for same account
        if (isQuotaError) {
          encounteredQuota = true;
          log("warn", `[Gemini Quota Limit] Account "${label}", Model "${model}" hit quota/rate limit: ${err?.message || err}`);

          // Check if retryDelay is specified in error details (e.g. "retry in 58.6s" or "retrydelay": "58s")
          const errStr = (err?.message || err?.toString() || "").toLowerCase();
          let delaySeconds = 0;
          const retryMatch =
            errStr.match(/retry in\s+([\d.]+)\s*s/i) ||
            errStr.match(/retrydelay['":\s]+([\d.]+)/i);
          if (retryMatch) {
            delaySeconds = parseFloat(retryMatch[1]);
          }

          // If retry delay is short (<= 10 seconds), wait and retry ONCE for the same model/account
          if (delaySeconds > 0 && delaySeconds <= 10) {
            log("log", `[Gemini Retry Delay] Short retry delay detected (${delaySeconds}s). Waiting and retrying model "${model}" on account "${label}"...`);
            await new Promise((r) => setTimeout(r, Math.ceil(delaySeconds * 1000)));

            try {
              const config: any = {
                responseMimeType: params.responseMimeType || "application/json",
              };
              if (params.responseSchema) {
                config.responseSchema = params.responseSchema;
              }

              const retryResponse = await client.models.generateContent({
                model,
                contents: params.contents,
                config,
              });

              if (retryResponse && retryResponse.text) {
                log("log", `[Gemini Retry Success] Account: ${label}, Model: ${model}`);
                return retryResponse.text;
              }
            } catch (retryErr: any) {
              log("warn", `[Gemini Retry Failed] Model "${model}" on account "${label}" still failed after retry delay: ${retryErr?.message || retryErr}`);
            }
          }

          continue; // Try next model for same account
        }

        // 4. Non-quota / unknown error (e.g. 400 Bad Request, schema validation bug) -> do not burn other accounts
        log("error", `[Gemini Non-Quota Error] Account "${label}", Model "${model}" failed: ${err?.message || err}`);
        throw err;
      }
    }
  }

  // Determine primary failure reason across all attempts
  let primaryReason: GeminiErrorReason = "unknown";
  if (encounteredQuota) {
    primaryReason = "quota_exhausted";
  } else if (encounteredModelUnavailable) {
    primaryReason = "model_unavailable";
  } else if (encounteredAuth) {
    primaryReason = "auth_error";
  }

  const finalMsg = lastError?.message || "All Gemini accounts and models failed to generate content.";
  throw createGeminiError(primaryReason, finalMsg);
}

// ---------------------------------------------------------------------------
// Prompt builders + schemas (single source of truth for server AND client)
// ---------------------------------------------------------------------------

export const VOCAB_FILL_SCHEMA = {
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
};

export function buildVocabFillPrompt(word: string, currentData: any): string {
  return `You are a German lexicographer and Persian translation specialist.
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
}

export function buildVerbFillPrompt(infinitive: string, currentData: any): string {
  return `You are a German grammar and verb conjugation expert for Persian speakers.
Provide complete conjugations and grammatical analysis for the German verb: "${infinitive.trim()}".
Existing user data: ${JSON.stringify(currentData || {})}

CRITICAL RULES:
1. SPELL CORRECTION & CANONICAL VERB: If the user's input verb contains a spelling mistake or typo (e.g. 'sprechne' instead of 'sprechen', 'gehn' instead of 'gehen', 'kaufn' instead of 'kaufen'), identify the closest correct German infinitive verb and set the 'infinitive' field in JSON to that CORRECT German infinitive verb!
2. NO PRONOUNS IN CONJUGATIONS: DO NOT INCLUDE ANY SUBJECT PRONOUNS (ich, du, er, sie, es, wir, ihr, Sie) IN THE CONJUGATIONS OUTPUT. Return ONLY the conjugated verb form string (e.g. S1: ["spreche"], NOT ["ich spreche"]; S2: ["hast geaalt"], NOT ["du hast geaalt"]).
3. CATEGORIES & CASE GOVERNANCE TAGS: Automatically assign ALL matching category IDs from:
   - 'regular' (باقاعده)
   - 'irregular' (بیقاعده)
   - 'separable' (جداشدنی)
   - 'reflexive' (انعکاسی)
   - 'akkusativ' (فعل آکوزاتیو ساز / نیازمند مفعول مستقیم Akkusativ)
   - 'dativ' (فعل داتیو ساز / نیازمند مفعول غیرمستقیم Dativ)
   Determine whether this verb takes Akkusativ, Dativ, or both (e.g. 'helfen' -> ['dativ'], 'kaufen' -> ['akkusativ', 'dativ'], 'sehen' -> ['akkusativ']) and include 'akkusativ' and/or 'dativ' in the 'categories' array!
4. Provide full, non-truncated conjugations for ALL 6 persons (S1, S2, S3, P1, P2, P3) for ALL 9 TENSES:
   - PRASENS (زمان حال)
   - PERFEKT (گذشته نقلی / ماضی نقلی)
   - PRATERITUM (گذشته ساده / ماضی استمراری)
   - KONJUNKTIV2_PRATERITUM (التزامی / شرطی نوع ۲ - e.g., spräche, sprächest...)
   - FUTUR1 (آینده ۱)
   - PLUSQUAMPERFEKT (ماضی بعید)
   - KONJUNKTIV1_PRASENS (التزامی ۱ / نقل قول)
   - FUTUR2 (آینده کامل)
   - IMPERATIV (امر)

Return JSON matching this exact structure:
- infinitive: Clean, correct German infinitive verb (e.g. "sprechen")
- bedeutung: Clear Persian translations of the verb (all major meanings)
- hilfsverb: "haben" or "sein" or "haben / sein"
- prepositions: Common prepositions used with this verb (e.g., "mit + Dat, über + Akk")
- example: German example sentence using the verb.
- notes: Usage tips or grammatical nuances in Persian.
- categories: Array of matching category IDs from ["regular", "irregular", "separable", "reflexive", "akkusativ", "dativ", "favorites"]
- conjugations: Object containing ALL 9 tenses keys: PRASENS, PERFEKT, PRATERITUM, KONJUNKTIV2_PRATERITUM, FUTUR1, PLUSQUAMPERFEKT, KONJUNKTIV1_PRASENS, FUTUR2, IMPERATIV.
  Each tense MUST have keys S1, S2, S3, P1, P2, P3 with string arrays containing ONLY the conjugated verb form WITHOUT PRONOUN (e.g. S1: ["spreche"]).
`;
}

export function buildBatchVocabPrompt(items: any[]): string {
  return `You are a German lexicographer.
Fill in any missing or incomplete fields (article, meaning in Persian listing all major meanings, plural, partOfSpeech, German-only example sentence without Persian translation, usage notes in Persian) for each of the following vocabulary items:
${JSON.stringify(items, null, 2)}

Return a JSON object with key "items" containing the completed list of objects.
Each object must have:
- article: "der" | "die" | "das" | "none"
- word: Clean German word (without article inside the word string)
- meaning: Persian translations (all major meanings)
- plural: Plural form
- partOfSpeech: "noun" | "verb_phrase" | "adjective" | "adverb" | "preposition" | "pronoun" | "conjunction" | "expression"
- example: German example sentence ONLY (GERMAN ONLY - DO NOT include any Persian translation in the example string!)
- notes: Concise usage notes in Persian
`;
}

export function buildBatchVerbPrompt(items: any[]): string {
  return `You are a German verb conjugation expert.
Fill in any missing fields (bedeutung in Persian, hilfsverb, prepositions, categories array from ['regular', 'irregular', 'separable', 'reflexive', 'akkusativ', 'dativ'], complete conjugations for ALL persons across PRASENS, PRATERITUM, PERFEKT, KONJUNKTIV2_PRATERITUM, FUTUR1, PLUSQUAMPERFEKT, KONJUNKTIV1_PRASENS, FUTUR2, IMPERATIV) for the following German verbs.
CRITICAL: DO NOT INCLUDE SUBJECT PRONOUNS (ich, du, er, sie, es, wir, ihr, Sie) IN THE CONJUGATION VALUES! Return ONLY the conjugated verb forms.
${JSON.stringify(items, null, 2)}

Return a JSON object with key "items" containing the completed list of verb items.
`;
}

export function buildSynonymsPrompt(body: {
  mode?: string;
  topic?: string;
  currentGroup?: any;
  existingWords?: any[];
  type?: string;
}): string {
  const { mode, topic, currentGroup, existingWords, type } = body;

  const groupType = type || (currentGroup ? currentGroup.type : "synonym");

  let groupDescription = "";
  if (groupType === "synonym") {
    groupDescription = "German synonyms (مترادفها - words with similar meanings)";
  } else if (groupType === "antonym") {
    groupDescription = "German antonyms (متضادها - words with opposite meanings)";
  } else if (groupType === "word_family") {
    groupDescription = "German Word Family (همخانواده / Wortfamilie - words derived from a common root word using prefixes/suffixes like fahren -> abfahren, Erfahung, Fahrt)";
  } else if (groupType === "semantic_field") {
    groupDescription = "German Semantic Field / Word Field (میدان معنایی / Wortfeld - words sharing a common conceptual area e.g. time domain: Uhr, Tag, Monat, Jahr, Minute)";
  } else if (groupType === "idiom") {
    groupDescription = "German Idioms / Expressions (اصطلاحات و تعابیر کاربردی / Redewendungen - real-life expressions used in specific contexts e.g. greetings, shopping, express agreement/disagreement)";
  } else if (groupType === "comparative_adjective") {
    groupDescription = "German Comparative Adjectives (صفات مقایسهای - Adjectives with Base form (Positiv), Persian Meaning, Comparative form (Komparativ), and Superlative form (Superlativ) e.g. schön -> schöner, am schönsten; gut -> besser, am besten)";
  }

  if (mode === "complete_group" && currentGroup) {
    if (groupType === "comparative_adjective") {
      return `You are a German grammar and vocabulary expert.
Complete and expand this Comparative Adjectives group titled "${currentGroup.title}":
Current items: ${JSON.stringify(currentGroup.items || [])}
Current notes: "${currentGroup.notes || ""}"

CRITICAL INSTRUCTIONS FOR COMPARATIVE ADJECTIVES:
1. For every item/adjective:
   - "word": Base form of adjective (صفت در حالت پایه - Positiv e.g. "schön", "gut", "groß", "schnell")
   - "meaning": Persian translation (e.g. "زیبا", "خوب", "بزرگ", "سریع")
   - "comparative": Comparative form (حالت برتر - Komparativ e.g. "schöner", "besser", "größer", "schneller")
   - "superlative": Superlative form (حالت برترین - Superlativ e.g. "am schönsten", "am besten", "am größten", "am schnellsten")
2. If the user provided items with only base words ("word"), fill in the "meaning", "comparative", and "superlative" for EACH item!
3. Add any missing common adjectives if appropriate to complete the group.
4. "notes": 2-3 concise bullet points in Persian about irregular comparative rules or usage.

Return JSON:
{
  "title": "${currentGroup.title}",
  "type": "comparative_adjective",
  "items": [
    { "word": "base adjective", "meaning": "Persian translation", "comparative": "Komparativ form", "superlative": "Superlativ form" }
  ],
  "notes": "• نکته اول\\n• نکته دوم"
}`;
    }

    return `You are a German vocabulary expert.
Complete and expand this existing ${groupType} group (${groupDescription}) titled "${currentGroup.title}":
Current items: ${JSON.stringify(currentGroup.items || [])}
Current notes: "${currentGroup.notes || ""}"

CRITICAL INSTRUCTIONS:
1. ARTICLES & PART OF SPEECH: For every German word/item, strictly place 'der', 'die', or 'das' into the 'article' field if it is a noun. Set article: 'none' for non-nouns or verbs. Specify 'partOfSpeech' from ["noun", "verb_phrase", "adjective", "adverb", "preposition", "pronoun", "conjunction", "expression"].
2. NOTES: The 'notes' field MUST be concise, bullet-point-focused usage notes in Persian explaining WHERE and WHEN to use these expressions/words (نکتهمحور، خلاصه و کاربردی). Keep it to 2-3 short bullet points max. DO NOT WRITE LONG PARAGRAPHS.

Return JSON:
{
  "title": "${currentGroup.title}",
  "type": "${groupType}",
  "items": [
    { "word": "clean German word/phrase", "article": "der/die/das/none", "partOfSpeech": "noun/expression/verb_phrase/adjective", "meaning": "Persian translation" }
  ],
  "notes": "• نکته اول\\n• نکته دوم"
}`;
  }

  if (groupType === "comparative_adjective") {
    return `You are a German grammar and vocabulary expert.
Create a high-quality Comparative Adjectives group (صفات مقایسهای) for German language learners.
Topic/Keywords/Adjectives given by user: "${topic || "صفات پرکاربرد آلمانی"}"
Existing vocabulary in user's bank (if relevant): ${JSON.stringify((existingWords || []).slice(0, 30))}

CRITICAL INSTRUCTIONS FOR COMPARATIVE ADJECTIVES:
1. If the user provided a list of base adjectives in the topic field (e.g. "schön, gut, alt, groß, schnell"), create an entry for EVERY ONE of those base adjectives and complete its meaning, comparative, and superlative forms!
2. Each item MUST have:
   - "word": Base form of adjective (صفت در حالت پایه - Positiv e.g. "schön")
   - "meaning": Persian translation (e.g. "زیبا")
   - "comparative": Comparative form (حالت برتر - Komparativ e.g. "schöner")
   - "superlative": Superlative form (حالت برترین - Superlativ e.g. "am schönsten")
3. "notes": 2-3 concise bullet points in Persian on comparative adjective rules in German.

Return JSON:
{
  "title": "Clear descriptive title in Persian & German (e.g. صفات مقایسهای - Komparation der Adjektive)",
  "type": "comparative_adjective",
  "items": [
    { "word": "base adjective", "meaning": "Persian translation", "comparative": "Komparativ form", "superlative": "Superlativ form" }
  ],
  "notes": "• نکته اول\\n• نکته دوم"
}`;
  }

  return `You are a German vocabulary expert.
Create a high-quality ${groupType} group (${groupDescription}) for German language learners.
Topic/Keyword: "${topic || "General Vocabulary"}"
Existing vocabulary in user's bank (if relevant): ${JSON.stringify((existingWords || []).slice(0, 30))}

CRITICAL INSTRUCTIONS:
1. ARTICLES & PART OF SPEECH: For every German word/item, strictly place 'der', 'die', or 'das' into the 'article' field if it is a noun. Set article: 'none' for non-nouns or verbs. Specify 'partOfSpeech' from ["noun", "verb_phrase", "adjective", "adverb", "preposition", "pronoun", "conjunction", "expression"].
2. NOTES: The 'notes' field MUST be concise, bullet-point-focused usage notes in Persian explaining WHERE and WHEN to use these expressions/words (نکتهمحور، خلاصه و کاربردی با توجه به موقعیت). Keep it to 2-3 short bullet points max. DO NOT WRITE LONG PARAGRAPHS.

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
