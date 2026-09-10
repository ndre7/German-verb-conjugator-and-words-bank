import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Initialize and cache ordered Gemini Clients for multi-account fallback
interface GeminiClientEntry {
  client: GoogleGenAI;
  label: string;
}

// Models scheduled for shutdown on Oct 16, 2026; 2.5 family may show intermittent 404s.
// gemini-3.6-flash is currently recommended & stable.
export const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-1.5-flash",
];

export type ApiKeyProvider =
  | "gemini"
  | "openai"
  | "groq"
  | "deepseek"
  | "anthropic"
  | "openrouter"
  | "mistral"
  | "together"
  | "xai"
  | "perplexity"
  | "cerebras"
  | "custom"
  | string;

export const PROVIDER_FALLBACK_MODELS: Record<string, string[]> = {
  gemini: [
    "gemini-2.5-flash",
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "gemini-1.5-flash",
  ],
  openai: [
    "gpt-4o-mini",
    "gpt-4o",
    "chatgpt-4o-latest",
    "gpt-3.5-turbo",
    "o3-mini",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
  deepseek: [
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  anthropic: [
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
    "claude-3-5-sonnet-latest",
    "claude-3-opus-20240229",
  ],
  mistral: [
    "mistral-small-latest",
    "mistral-medium-latest",
    "open-mixtral-8x7b",
    "mistral-large-latest",
  ],
  openrouter: [
    "google/gemini-2.5-flash",
    "meta-llama/llama-3.3-70b-instruct",
    "openai/gpt-4o-mini",
    "deepseek/deepseek-chat",
    "mistralai/mistral-small-latest",
  ],
  together: [
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
  ],
  xai: [
    "grok-2-latest",
    "grok-beta",
  ],
  perplexity: [
    "sonar-pro",
    "sonar",
  ],
  cerebras: [
    "llama-3.3-70b",
    "llama3.1-8b",
  ],
  custom: [
    "gpt-3.5-turbo",
    "gpt-4o-mini",
    "llama3",
    "mistral",
  ],
};

export function getCandidateModelsForProvider(provider: string, customModel?: string): string[] {
  const trimmed = (customModel || "").trim();
  // اگر کاربر نام دقیق مدلی را وارد کرده، دقیقاً و منحصراً با همان مدل ارسال می‌شود
  if (trimmed) {
    return [trimmed];
  }
  const fallbackList = PROVIDER_FALLBACK_MODELS[provider] || [
    "gpt-4o-mini",
    "llama-3.3-70b-versatile",
    "gpt-3.5-turbo",
  ];
  return fallbackList;
}

export interface CustomApiKeyInput {
  id: string;
  key: string;
  name?: string;
  enabled?: boolean;
  provider?: string;
  providerName?: string;
  model?: string;
  baseUrl?: string;
}

export interface GeminiCallResult {
  text: string;
  usedCustomKeyId?: string;
  tokensUsed: number;
}

export function detectProvider(key: string): ApiKeyProvider {
  const trimmed = (key || "").trim();
  if (trimmed.startsWith("AIza")) return "gemini";
  if (trimmed.startsWith("gsk_")) return "groq";
  if (trimmed.startsWith("sk-ant-")) return "anthropic";
  if (trimmed.startsWith("sk-or-")) return "openrouter";
  if (trimmed.startsWith("sk-proj-") || trimmed.startsWith("sk-")) return "openai";
  return "gemini";
}

// In-memory process-lifetime cache of models confirmed retired/unavailable per account (404 / no longer available)
// Key format: `${accountLabel}:${modelName}`
const retiredModels = new Set<string>();

interface StructuredGeminiError extends Error {
  reason: "quota_exhausted" | "model_unavailable" | "auth_error" | "unknown";
  userMessage: string;
}

function createGeminiError(
  reason: "quota_exhausted" | "model_unavailable" | "auth_error" | "unknown",
  message: string
): StructuredGeminiError {
  let userMessage = "خطایی در برقراری ارتباط با سرویس هوش مصنوعی رخ داد. لطفاً دوباره تلاش کنید.";
  if (reason === "quota_exhausted") {
    userMessage = "سقف استفاده از تمامی حساب‌های هوش مصنوعی موقتاً به پایان رسیده است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.";
  } else if (reason === "model_unavailable") {
    userMessage = "مدل‌های هوش مصنوعی در حال حاضر با تقاضای بالا یا عدم دسترسی موقت مواجه هستند. لطفاً لحظاتی بعد دوباره تلاش فرمایید.";
  } else if (reason === "auth_error") {
    userMessage = "خطا در احراز هویت کلیدهای هوش مصنوعی. لطفاً تنظیمات حساب‌ها را بررسی کنید.";
  }

  const err = new Error(message) as StructuredGeminiError;
  err.reason = reason;
  err.userMessage = userMessage;
  return err;
}

let cachedGeminiClients: GeminiClientEntry[] | null = null;

function discoverGeminiApiKeys(): { key: string; label: string }[] {
  const primaryKey = process.env.GEMINI_API_KEY;
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

  const result: { key: string; label: string }[] = [];
  if (primaryKey && primaryKey.trim()) {
    result.push({ key: primaryKey.trim(), label: "primary" });
  }
  result.push(...entries.map((e) => ({ key: e.key, label: e.label })));

  return result;
}

function getOrderedGeminiClients(): GeminiClientEntry[] {
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

// Robust execution helper with multi-model and multi-provider failover
function parseCleanJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch (initialErr) {
    // Robust extraction: locate first '{' and matching last '}' OR first '[' and last ']'
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");

    if (firstBrace !== -1 && lastBrace > firstBrace && (firstBracket === -1 || firstBrace < firstBracket)) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    } else if (firstBracket !== -1 && lastBracket > firstBracket) {
      const extracted = cleaned.substring(firstBracket, lastBracket + 1);
      return JSON.parse(extracted);
    }
    throw initialErr;
  }
}

// Unified call executor for any custom key (Google, OpenAI, Anthropic, Groq, DeepSeek, Mistral, OpenRouter, Custom)
async function executeCustomKeyCall(
  customKey: CustomApiKeyInput,
  params: {
    contents: string;
    responseSchema?: any;
    responseMimeType?: string;
  }
): Promise<{ text: string; tokensUsed: number }> {
  const provider = customKey.provider || detectProvider(customKey.key);
  const cleanKey = customKey.key.trim();

  if (provider === "gemini") {
    const customClient = new GoogleGenAI({
      apiKey: cleanKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build-custom" } },
    });
    const modelsToTry = customKey.model?.trim() ? [customKey.model.trim()] : GEMINI_FALLBACK_MODELS;
    let lastGeminiErr: any = null;

    for (const model of modelsToTry) {
      try {
        const config: any = {
          responseMimeType: params.responseMimeType || "application/json",
        };
        if (params.responseSchema) {
          config.responseSchema = params.responseSchema;
        }
        const response = await customClient.models.generateContent({
          model,
          contents: params.contents,
          config,
        });
        if (response && response.text) {
          const tokenCount =
            (response as any).usageMetadata?.totalTokenCount ||
            Math.ceil((params.contents.length + response.text.length) / 4);
          return { text: response.text, tokensUsed: tokenCount };
        }
      } catch (err: any) {
        lastGeminiErr = err;
        const errStr = (err.message || err.toString() || "").toLowerCase();
        const errStatus = err.status || err.code || 0;
        const isAuth =
          errStatus === 401 ||
          errStatus === 403 ||
          errStr.includes("401") ||
          errStr.includes("403") ||
          errStr.includes("unauthenticated") ||
          errStr.includes("invalid api key");
        if (isAuth) {
          const authErr = new Error(`Authentication failed for Gemini key: ${err.message}`);
          (authErr as any).isAuth = true;
          throw authErr;
        }
        // اگر کاربر خود نام مدل را صریحاً تعیین کرده است، بدون تغییر مدل خطا را گزارش کنیم
        if (customKey.model?.trim()) {
          throw err;
        }
        const isQuota =
          errStatus === 429 ||
          errStr.includes("429") ||
          errStr.includes("quota") ||
          errStr.includes("resource_exhausted");
        if (isQuota) {
          let delaySeconds = 0;
          const retryMatch = errStr.match(/retry in\s+([\d.]+)\s*s/i) || errStr.match(/retrydelay['":\s]+([\d.]+)/i);
          if (retryMatch) delaySeconds = parseFloat(retryMatch[1]);
          if (delaySeconds > 0 && delaySeconds <= 10) {
            await new Promise((r) => setTimeout(r, Math.ceil(delaySeconds * 1000)));
            const retryRes = await customClient.models.generateContent({
              model,
              contents: params.contents,
              config: { responseMimeType: params.responseMimeType || "application/json" },
            });
            if (retryRes && retryRes.text) {
              const count = (retryRes as any).usageMetadata?.totalTokenCount || Math.ceil((params.contents.length + retryRes.text.length) / 4);
              return { text: retryRes.text, tokensUsed: count };
            }
          }
          const quotaErr = new Error(`Quota exhausted for Gemini key: ${err.message}`);
          (quotaErr as any).isQuota = true;
          throw quotaErr;
        }
      }
    }
    throw lastGeminiErr || new Error("Gemini models failed to generate content.");
  } else if (provider === "anthropic") {
    const modelsToTry = getCandidateModelsForProvider("anthropic", customKey.model);
    const endpoint = "https://api.anthropic.com/v1/messages";
    let lastAnthropicErr: any = null;

    for (const targetModel of modelsToTry) {
      try {
        const body = {
          model: targetModel,
          max_tokens: 4096,
          system: "You are a professional linguistic assistant for German language learning. You must return your response strictly as valid, raw JSON without any markdown code fence wrappers and without conversational preamble.",
          messages: [{ role: "user", content: params.contents }],
        };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "x-api-key": cleanKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
          const errText = await res.text();
          const isAuth = res.status === 401 || res.status === 403;
          if (isAuth) {
            const authErr = new Error(`Anthropic authentication failed (${res.status}): ${errText}`);
            (authErr as any).isAuth = true;
            throw authErr;
          }
          if (customKey.model?.trim()) {
            throw new Error(`Anthropic error (${res.status}) on model "${targetModel}": ${errText}`);
          }
          console.warn(`[Anthropic Fallback] Model "${targetModel}" failed with HTTP ${res.status}: ${errText.slice(0, 100)}. Trying next candidate model...`);
          lastAnthropicErr = new Error(`Anthropic error (${res.status}): ${errText}`);
          continue;
        }

        const data: any = await res.json();
        const text = data.content?.[0]?.text || "";
        const tokens =
          (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) ||
          Math.ceil((params.contents.length + text.length) / 4);
        return { text, tokensUsed: tokens };
      } catch (err: any) {
        if (err.isAuth) throw err;
        lastAnthropicErr = err;
      }
    }
    throw lastAnthropicErr || new Error("All candidate Anthropic models failed.");
  } else {
    // OpenAI-compatible providers: openai, groq, deepseek, mistral, openrouter, together, xai, perplexity, cerebras, or ANY custom provider
    let endpoint = "";
    const customBase = (customKey.baseUrl || "").trim().replace(/\/+$/, "");

    if (customBase) {
      if (customBase.endsWith("/chat/completions")) {
        endpoint = customBase;
      } else if (customBase.endsWith("/v1") || customBase.endsWith("/v2")) {
        endpoint = `${customBase}/chat/completions`;
      } else {
        endpoint = `${customBase}/v1/chat/completions`;
      }
    } else if (provider === "openai") {
      endpoint = "https://api.openai.com/v1/chat/completions";
    } else if (provider === "groq") {
      endpoint = "https://api.groq.com/openai/v1/chat/completions";
    } else if (provider === "deepseek") {
      endpoint = "https://api.deepseek.com/chat/completions";
    } else if (provider === "mistral") {
      endpoint = "https://api.mistral.ai/v1/chat/completions";
    } else if (provider === "openrouter") {
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
    } else if (provider === "together") {
      endpoint = "https://api.together.xyz/v1/chat/completions";
    } else if (provider === "xai") {
      endpoint = "https://api.x.ai/v1/chat/completions";
    } else if (provider === "perplexity") {
      endpoint = "https://api.perplexity.ai/chat/completions";
    } else if (provider === "cerebras") {
      endpoint = "https://api.cerebras.ai/v1/chat/completions";
    } else {
      endpoint = "http://localhost:11434/v1/chat/completions";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cleanKey}`,
    };
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "http://localhost:3000";
      headers["X-Title"] = "German Verb Conjugation Manager";
    }

    const modelsToTry = getCandidateModelsForProvider(provider, customKey.model);
    let lastProviderErr: any = null;

    for (const targetModel of modelsToTry) {
      try {
        const body: any = {
          model: targetModel,
          messages: [
            {
              role: "system",
              content: "You are a professional linguistic assistant for German language learning. You must return your response strictly as valid, raw JSON without any markdown code fence wrappers (such as ```json) and without conversational preamble.",
            },
            {
              role: "user",
              content: params.contents,
            },
          ],
          temperature: 0.2,
        };

        if (provider === "openai" || provider === "deepseek" || provider === "groq" || provider === "mistral" || provider === "together") {
          body.response_format = { type: "json_object" };
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
          const errText = await res.text();
          const isAuth = res.status === 401 || res.status === 403;
          if (isAuth) {
            const authErr = new Error(`${provider} authentication failed (${res.status}): ${errText}`);
            (authErr as any).isAuth = true;
            throw authErr;
          }
          // اگر کاربر خودش نام مدلی را تایپ کرده باشد، خطا را بلافاصله برمی‌گردانیم تا کاربر دقیقاً خطای مدل انتخابی خود را ببیند
          if (customKey.model?.trim()) {
            throw new Error(`خطا در درخواست به مدل "${targetModel}" از سرویس ${provider} (${res.status}): ${errText}`);
          }
          console.warn(`[${provider} Model Fallback] Model "${targetModel}" returned HTTP ${res.status}: ${errText.slice(0, 100)}. Trying next candidate model...`);
          lastProviderErr = new Error(`${provider} error (${res.status}): ${errText}`);
          continue;
        }

        const data: any = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        const tokens = data.usage?.total_tokens || Math.ceil((params.contents.length + text.length) / 4);
        return { text, tokensUsed: tokens };
      } catch (err: any) {
        if (err.isAuth) throw err;
        if (customKey.model?.trim()) throw err;
        lastProviderErr = err;
      }
    }

    throw lastProviderErr || new Error(`All candidate models for ${provider} failed.`);
  }
}

async function callGeminiWithFallback(params: {
  contents: string;
  responseSchema?: any;
  responseMimeType?: string;
  customKeys?: CustomApiKeyInput[];
}): Promise<GeminiCallResult> {
  const clients = getOrderedGeminiClients();
  let lastError: any = null;

  let encounteredQuota = false;
  let encounteredModelUnavailable = false;
  let encounteredAuth = false;

  // Outer loop: Iterate over accounts (Primary -> account-2 -> account-3 -> ...)
  for (const { client, label } of clients) {
    let skipAccount = false;

    // Inner loop: Iterate over models for current account
    for (const model of GEMINI_FALLBACK_MODELS) {
      if (skipAccount) break;

      // Check if model is already known to be retired/unavailable for this specific account in process cache
      const accountModelKey = `${label}:${model}`;
      if (retiredModels.has(accountModelKey)) {
        console.log(`[Gemini Cache Skip] Model "${model}" is retired/unavailable for account "${label}", skipping.`);
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
          const totalTokens =
            (response as any).usageMetadata?.totalTokenCount ||
            Math.ceil((params.contents.length + response.text.length) / 4);
          console.log(`[Gemini Success] Account: ${label}, Model: ${model}, Tokens: ${totalTokens}`);
          return {
            text: response.text,
            tokensUsed: totalTokens,
          };
        }
      } catch (err: any) {
        lastError = err;
        const errStr = (err.message || err.toString() || "").toLowerCase();
        const errStatus = err.status || err.code || 0;

        // 1. Auth/Key error (401, 403, invalid key) -> skip entire account immediately
        const isAuthError =
          errStatus === 401 ||
          errStatus === 403 ||
          errStr.includes("401") ||
          errStr.includes("403") ||
          errStr.includes("unauthenticated") ||
          errStr.includes("permission_denied") ||
          errStr.includes("invalid api key") ||
          errStr.includes("api_key_invalid");

        if (isAuthError) {
          encounteredAuth = true;
          console.warn(
            `[Gemini Auth Failure] Account "${label}" returned 401/403 unauthorized. Skipping remaining models for this account.`
          );
          skipAccount = true;
          break;
        }

        // 2. Model Unavailable / Retired / Not Found (HTTP 404, "no longer available", "not found", "deprecated", "retired")
        const isModelUnavailable =
          errStatus === 404 ||
          errStr.includes("404") ||
          errStr.includes("not_found") ||
          errStr.includes("not found") ||
          errStr.includes("no longer available") ||
          errStr.includes("deprecated") ||
          errStr.includes("retired");

        if (isModelUnavailable) {
          encounteredModelUnavailable = true;
          retiredModels.add(accountModelKey);
          console.warn(
            `[Gemini Model Unavailable] Model "${model}" retired/unreachable for account "${label}", added to retired cache and skipping.`
          );
          continue; // Try next model for same account
        }

        // 3. Quota / Rate-limit error (429, RESOURCE_EXHAUSTED, rate limit) -> try next model for same account
        const isQuotaError =
          errStatus === 429 ||
          errStr.includes("429") ||
          errStr.includes("resource_exhausted") ||
          errStr.includes("rate limit") ||
          errStr.includes("quota");

        if (isQuotaError) {
          encounteredQuota = true;
          console.warn(
            `[Gemini Quota Limit] Account "${label}", Model "${model}" hit quota/rate limit: ${err.message || err}`
          );

          // Check if retryDelay is specified in error details (e.g. "retry in 58.6s" or "retrydelay": "58s")
          let delaySeconds = 0;
          const retryMatch =
            errStr.match(/retry in\s+([\d.]+)\s*s/i) ||
            errStr.match(/retrydelay['":\s]+([\d.]+)/i);
          if (retryMatch) {
            delaySeconds = parseFloat(retryMatch[1]);
          }

          // If retry delay is short (<= 10 seconds), wait and retry ONCE for the same model/account
          if (delaySeconds > 0 && delaySeconds <= 10) {
            console.log(
              `[Gemini Retry Delay] Short retry delay detected (${delaySeconds}s). Waiting and retrying model "${model}" on account "${label}"...`
            );
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
                const totalTokens =
                  (retryResponse as any).usageMetadata?.totalTokenCount ||
                  Math.ceil((params.contents.length + retryResponse.text.length) / 4);
                console.log(`[Gemini Retry Success] Account: ${label}, Model: ${model}`);
                return {
                  text: retryResponse.text,
                  tokensUsed: totalTokens,
                };
              }
            } catch (retryErr: any) {
              console.warn(
                `[Gemini Retry Failed] Model "${model}" on account "${label}" still failed after retry delay: ${retryErr.message || retryErr}`
              );
            }
          }

          continue; // Try next model for same account
        }

        // 4. Temporary high demand / 503 Service Unavailable / 500 Internal / 502/504 Gateway errors -> try next model
        const isTemporaryServiceError =
          errStatus === 503 ||
          errStatus === 500 ||
          errStatus === 502 ||
          errStatus === 504 ||
          errStr.includes("503") ||
          errStr.includes("unavailable") ||
          errStr.includes("high demand") ||
          errStr.includes("overloaded") ||
          errStr.includes("spikes in demand");

        if (isTemporaryServiceError) {
          encounteredModelUnavailable = true;
          console.warn(
            `[Gemini High Demand / 503] Account "${label}", Model "${model}" temporarily experiencing high demand/503: ${err.message || err}. Falling back to next model...`
          );
          continue; // Try next model for same account
        }

        // 5. Non-recoverable client error (e.g. 400 Bad Request, invalid argument) -> do not burn other accounts
        const isBadRequest =
          errStatus === 400 ||
          errStr.includes("400") ||
          errStr.includes("invalid_argument") ||
          errStr.includes("invalid argument");

        if (isBadRequest) {
          console.error(
            `[Gemini Bad Request] Account "${label}", Model "${model}" failed: ${err.message || err}`
          );
          throw err;
        }

        // Other unexpected errors: log and try next model
        console.warn(
          `[Gemini Unexpected Error] Account "${label}", Model "${model}" failed: ${err.message || err}. Trying next fallback...`
        );
        continue;
      }
    }
  }

  // Outer loop 2: Secondary failover to User-provided custom API keys from settings
  const validCustomKeys = (params.customKeys || []).filter(
    (k) => k && k.enabled !== false && typeof k.key === "string" && k.key.trim().length > 5
  );

  if (validCustomKeys.length > 0) {
    console.log(
      `[AI Custom Key Loop] Processing ${validCustomKeys.length} user-provided custom key(s)...`
    );

    for (const customKey of validCustomKeys) {
      const provider = customKey.provider || detectProvider(customKey.key);
      try {
        console.log(
          `[AI Custom Key Try] Key "${customKey.name || customKey.id}" (Provider: ${provider})`
        );
        const result = await executeCustomKeyCall(customKey, params);
        if (result && result.text) {
          console.log(
            `[AI Custom Key Success] Key: "${customKey.name || customKey.id}", Provider: ${provider}, Tokens: ${result.tokensUsed}`
          );
          return {
            text: result.text,
            usedCustomKeyId: customKey.id,
            tokensUsed: result.tokensUsed,
          };
        }
      } catch (err: any) {
        lastError = err;
        const isAuth = !!err.isAuth;
        const isQuota = !!err.isQuota;

        if (isAuth) {
          encounteredAuth = true;
          console.warn(
            `[AI Custom Key Auth Error] Key "${customKey.name || customKey.id}" (${provider}) unauthorized. Skipping to next key.`
          );
          continue;
        }

        if (isQuota) {
          encounteredQuota = true;
          console.warn(
            `[AI Custom Key Quota Error] Key "${customKey.name || customKey.id}" (${provider}) quota exhausted. Skipping to next key.`
          );
          continue;
        }

        console.warn(
          `[AI Custom Key Error] Key "${customKey.name || customKey.id}" (${provider}) failed: ${err.message}. Trying next key...`
        );
      }
    }
  }

  // Determine primary failure reason across all attempts
  let primaryReason: "quota_exhausted" | "model_unavailable" | "auth_error" | "unknown" = "unknown";
  if (encounteredQuota) {
    primaryReason = "quota_exhausted";
  } else if (encounteredModelUnavailable) {
    primaryReason = "model_unavailable";
  } else if (encounteredAuth) {
    primaryReason = "auth_error";
  }

  const finalMsg = lastError?.message || "All AI accounts, models, and custom keys failed to generate content.";
  throw createGeminiError(primaryReason, finalMsg);
}

// Helper to parse custom API keys passed by client in header
function parseCustomKeysHeader(req: express.Request): CustomApiKeyInput[] {
  try {
    const raw = req.headers["x-custom-api-keys"];
    if (typeof raw === "string" && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((k) => k && typeof k.key === "string" && k.key.trim().length > 5);
      }
    }
  } catch (e) {
    console.warn("Failed to parse x-custom-api-keys header:", e);
  }
  return [];
}

// Helper to attach custom key metadata to response headers
function attachCustomKeyMeta(res: express.Response, result: GeminiCallResult) {
  if (result.usedCustomKeyId) {
    res.setHeader("x-used-custom-key-id", result.usedCustomKeyId);
    res.setHeader("x-used-token-count", result.tokensUsed.toString());
  }
  res.setHeader("Access-Control-Expose-Headers", "x-used-custom-key-id, x-used-token-count");
}

// Helper function to strip German pronouns from conjugation output strings
function cleanConjugationPronouns(obj: any): any {
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

// API: Validate Any AI Provider Key (Gemini, OpenAI, Groq, DeepSeek, Anthropic, OpenRouter, Mistral, Custom)
app.post(["/api/gemini/validate-key", "/api/keys/validate"], async (req, res) => {
  try {
    const { apiKey, provider, baseUrl, model } = req.body;
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return res.status(400).json({ valid: false, error: "کلید API وارد نشده است." });
    }
    const cleanKey = apiKey.trim();
    const resolvedProvider: ApiKeyProvider = provider || detectProvider(cleanKey);

    if (resolvedProvider === "gemini") {
      const testClient = new GoogleGenAI({
        apiKey: cleanKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build-validate" } },
      });

      let lastErr = "";
      const modelsToTest = getCandidateModelsForProvider("gemini", model);
      for (const m of modelsToTest) {
        try {
          const testRes = await testClient.models.generateContent({
            model: m,
            contents: "ping",
            config: { maxOutputTokens: 2 },
          });
          if (testRes && testRes.text) {
            return res.json({
              valid: true,
              model: m,
              provider: "gemini",
              message: "اتصال به گوگل جمینای با موفقیت برقرار شد.",
            });
          }
        } catch (err: any) {
          lastErr = err.message || "خطا در تست کلید";
          const errStr = lastErr.toLowerCase();
          if (
            errStr.includes("401") ||
            errStr.includes("invalid") ||
            errStr.includes("api key not valid")
          ) {
            return res.status(401).json({
              valid: false,
              provider: "gemini",
              error: "کلید API نامعتبر است (خطای احراز هویت 401).",
            });
          }
        }
      }
      return res.status(400).json({
        valid: false,
        provider: "gemini",
        error: lastErr || "امکان اتصال با این کلید جمینای وجود ندارد.",
      });
    } else if (resolvedProvider === "anthropic") {
      const modelsToTry = getCandidateModelsForProvider("anthropic", model);
      let lastAnthropicErr = "";

      for (const targetModel of modelsToTry) {
        const testRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": cleanKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: targetModel,
            max_tokens: 2,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (testRes.ok) {
          return res.json({
            valid: true,
            model: targetModel,
            provider: "anthropic",
            message: `اتصال به Anthropic Claude برقرار شد (مدل فعال: ${targetModel})`,
          });
        }

        const errData = await testRes.text();
        if (testRes.status === 401 || testRes.status === 403) {
          return res.status(testRes.status).json({
            valid: false,
            provider: "anthropic",
            error: `خطای احراز هویت کلود (${testRes.status}): کلید نامعتبر است.`,
          });
        }
        lastAnthropicErr = `(${testRes.status}): ${errData.slice(0, 150)}`;
      }

      return res.status(400).json({
        valid: false,
        provider: "anthropic",
        error: `هیچ‌یک از مدل‌های کلود پاسخگو نبودند: ${lastAnthropicErr}`,
      });
    } else {
      // OpenAI, Groq, DeepSeek, Mistral, OpenRouter, Together, xAI, Perplexity, Cerebras, Custom / Any Provider
      let endpoint = "";
      const customBase = (baseUrl || "").trim().replace(/\/+$/, "");

      if (customBase) {
        if (customBase.endsWith("/chat/completions")) {
          endpoint = customBase;
        } else if (customBase.endsWith("/v1") || customBase.endsWith("/v2")) {
          endpoint = `${customBase}/chat/completions`;
        } else {
          endpoint = `${customBase}/v1/chat/completions`;
        }
      } else if (resolvedProvider === "openai") {
        endpoint = "https://api.openai.com/v1/chat/completions";
      } else if (resolvedProvider === "groq") {
        endpoint = "https://api.groq.com/openai/v1/chat/completions";
      } else if (resolvedProvider === "deepseek") {
        endpoint = "https://api.deepseek.com/chat/completions";
      } else if (resolvedProvider === "mistral") {
        endpoint = "https://api.mistral.ai/v1/chat/completions";
      } else if (resolvedProvider === "openrouter") {
        endpoint = "https://openrouter.ai/api/v1/chat/completions";
      } else if (resolvedProvider === "together") {
        endpoint = "https://api.together.xyz/v1/chat/completions";
      } else if (resolvedProvider === "xai") {
        endpoint = "https://api.x.ai/v1/chat/completions";
      } else if (resolvedProvider === "perplexity") {
        endpoint = "https://api.perplexity.ai/chat/completions";
      } else if (resolvedProvider === "cerebras") {
        endpoint = "https://api.cerebras.ai/v1/chat/completions";
      } else {
        endpoint = "http://localhost:11434/v1/chat/completions";
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanKey}`,
      };
      if (resolvedProvider === "openrouter") {
        headers["HTTP-Referer"] = "http://localhost:3000";
        headers["X-Title"] = "German Verb Conjugation Manager";
      }

      const modelsToTry = getCandidateModelsForProvider(resolvedProvider, model);
      let lastErrText = "";

      for (const targetModel of modelsToTry) {
        const testRes = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: targetModel,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 2,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (testRes.ok) {
          return res.json({
            valid: true,
            model: targetModel,
            provider: resolvedProvider,
            message: `اتصال به ${resolvedProvider} برقرار شد (مدل فعال: ${targetModel})`,
          });
        }

        const errText = await testRes.text();
        if (testRes.status === 401 || testRes.status === 403) {
          return res.status(testRes.status).json({
            valid: false,
            provider: resolvedProvider,
            error: `خطای احراز هویت در ${resolvedProvider} (${testRes.status}): کلید نامعتبر است.`,
          });
        }

        lastErrText = `(${testRes.status}): ${errText.slice(0, 150)}`;
      }

      return res.status(400).json({
        valid: false,
        provider: resolvedProvider,
        error: `مدل‌های ${resolvedProvider} در دسترس نبودند: ${lastErrText}`,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ valid: false, error: err.message || "خطای سرور در بررسی کلید" });
  }
});

// API: Auto-fill Vocabulary Details
app.post("/api/gemini/vocab-fill", async (req, res) => {
  try {
    const { word, meaning, currentData } = req.body;
    const cleanWord = typeof word === "string" ? word.trim() : "";
    const cleanMeaning = typeof meaning === "string" ? meaning.trim() : "";

    if (!cleanWord && !cleanMeaning) {
      return res.status(400).json({ error: "German word or Persian meaning is required." });
    }

    let inputDesc = "";
    if (cleanWord && cleanMeaning) {
      inputDesc = `German word/phrase: "${cleanWord}", Persian meaning provided: "${cleanMeaning}".`;
    } else if (cleanWord) {
      inputDesc = `German vocabulary word or phrase: "${cleanWord}".`;
    } else {
      inputDesc = `The user has ONLY provided the Persian meaning: "${cleanMeaning}".
CRITICAL: Identify the most accurate, standard, and common German vocabulary word/noun/phrase that corresponds to this Persian meaning. Set the "word" field in the output to this German word!`;
    }

    const prompt = `You are a German lexicographer and Persian translation specialist.
${inputDesc}
Existing user data if any: ${JSON.stringify(currentData || {})}

CRITICAL RULES:
1. SPELL CORRECTION & CANONICAL MATCH:
- If a German word was provided with typos or spelling errors, correct it.
- If only a Persian meaning was provided, select the best canonical German word.
- The "word" field must contain ONLY the clean German word without its article (e.g. "Buch", "Tisch", "schnell").
2. Provide complete lexicographical data in JSON:
- article: "der", "die", "das", or "none" (for verbs/adjectives/phrases/nouns without gender)
- word: The clean, correct German base word without the article (e.g. "Haus" or "schnell")
- meaning: Provide ALL distinct Persian meanings/translations of this word. If it has multiple meanings or nuances, list them clearly (e.g. "۱. خانه، مسکن | ۲. بستر، آشیانه").
- plural: Plural form with article or suffix (e.g. "die Häuser" or "-¨er"). If not a noun or no plural, return empty string "".
- partOfSpeech: One of ["noun", "verb_phrase", "adjective", "adverb", "preposition", "pronoun", "conjunction", "expression"]
- example: ONLY the German example sentence showing usage in context. DO NOT include any Persian translation inside this example field!
- notes: Usage notes in Persian explaining grammatical nuances, collocations, or prepositions.
`;

    const customKeys = parseCustomKeysHeader(req);
    const geminiResult = await callGeminiWithFallback({
      contents: prompt,
      customKeys,
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

    attachCustomKeyMeta(res, geminiResult);
    const data = parseCleanJson(geminiResult.text);
    res.json({ success: true, data });
  } catch (err: any) {
    const reason = err.reason || "unknown";
    if (reason === "unknown") {
      console.error("[Unknown Gemini Error]", err);
    }
    res.status(500).json({
      success: false,
      error: err.userMessage || err.message || "Failed to analyze vocabulary word.",
      userMessage: err.userMessage,
      reason: reason,
      ...(reason === "unknown" ? { debugRaw: { message: err.message || String(err), stack: err.stack, full: String(err) } } : {})
    });
  }
});

// API: Auto-fill Verb Details & Conjugations
app.post("/api/gemini/verb-fill", async (req, res) => {
  try {
    const { infinitive, bedeutung, currentData } = req.body;
    const cleanInfinitive = typeof infinitive === "string" ? infinitive.trim() : "";
    const cleanBedeutung = typeof bedeutung === "string" ? bedeutung.trim() : "";

    if (!cleanInfinitive && !cleanBedeutung) {
      return res.status(400).json({ error: "German verb infinitive or Persian meaning is required." });
    }

    let inputDesc = "";
    if (cleanInfinitive && cleanBedeutung) {
      inputDesc = `German verb: "${cleanInfinitive}", Persian meaning provided: "${cleanBedeutung}".`;
    } else if (cleanInfinitive) {
      inputDesc = `German verb infinitive: "${cleanInfinitive}".`;
    } else {
      inputDesc = `The user has ONLY provided the Persian meaning of the verb: "${cleanBedeutung}".
CRITICAL: Identify the canonical German infinitive verb (e.g. for "صحبت کردن" -> "sprechen", for "رفتن" -> "gehen", for "خریدن" -> "kaufen", for "دیدن" -> "sehen") that matches this Persian meaning! Set the "infinitive" field to this German infinitive!`;
    }

    const prompt = `You are a German grammar and verb conjugation expert for Persian speakers.
Provide complete conjugations and grammatical analysis for the German verb.
${inputDesc}
Existing user data: ${JSON.stringify(currentData || {})}

CRITICAL RULES:
1. SPELL CORRECTION & CANONICAL VERB: If the user's input verb contains a spelling mistake or typo (e.g. 'sprechne' instead of 'sprechen', 'gehn' instead of 'gehen', 'kaufn' instead of 'kaufen'), identify the closest correct German infinitive verb and set the 'infinitive' field in JSON to that CORRECT German infinitive verb! If only Persian meaning was given, set the 'infinitive' field to the correct German infinitive verb!
2. NO PRONOUNS IN CONJUGATIONS: DO NOT INCLUDE ANY SUBJECT PRONOUNS (ich, du, er, sie, es, wir, ihr, Sie) IN THE CONJUGATIONS OUTPUT. Return ONLY the conjugated verb form string (e.g. S1: ["spreche"], NOT ["ich spreche"]; S2: ["hast geaalt"], NOT ["du hast geaalt"]).
3. CATEGORIES & CASE GOVERNANCE TAGS: Automatically assign ALL matching category IDs from:
   - 'regular' (با‌قاعده)
   - 'irregular' (بی‌قاعده)
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

    const customKeys = parseCustomKeysHeader(req);
    const geminiResult = await callGeminiWithFallback({ contents: prompt, customKeys });
    attachCustomKeyMeta(res, geminiResult);
    let data = parseCleanJson(geminiResult.text);
    data = cleanConjugationPronouns(data);
    res.json({ success: true, data });
  } catch (err: any) {
    const reason = err.reason || "unknown";
    if (reason === "unknown") {
      console.error("[Unknown Gemini Error]", err);
    }
    res.status(500).json({
      success: false,
      error: err.userMessage || err.message || "Failed to analyze verb.",
      userMessage: err.userMessage,
      reason: reason,
      ...(reason === "unknown" ? { debugRaw: { message: err.message || String(err), stack: err.stack, full: String(err) } } : {})
    });
  }
});

// API: Batch Auto-fill Vocabulary Items (JSON Import or Batch Enrich)
app.post("/api/gemini/batch-vocab-fill", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array of items is required." });
    }

    const prompt = `You are a German lexicographer.
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

    const customKeys = parseCustomKeysHeader(req);
    const geminiResult = await callGeminiWithFallback({ contents: prompt, customKeys });
    attachCustomKeyMeta(res, geminiResult);
    const parsed = parseCleanJson(geminiResult.text);
    res.json({ success: true, items: parsed.items || [] });
  } catch (err: any) {
    const reason = err.reason || "unknown";
    if (reason === "unknown") {
      console.error("[Unknown Gemini Error]", err);
    }
    res.status(500).json({
      success: false,
      error: err.userMessage || err.message || "Failed to process batch vocabulary.",
      userMessage: err.userMessage,
      reason: reason,
      ...(reason === "unknown" ? { debugRaw: { message: err.message || String(err), stack: err.stack, full: String(err) } } : {})
    });
  }
});

// API: Batch Auto-fill Verbs (JSON Import or Batch Enrich)
app.post("/api/gemini/batch-verb-fill", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array of verb items is required." });
    }

    const prompt = `You are a German verb conjugation expert.
Fill in any missing fields (bedeutung in Persian, hilfsverb, prepositions, categories array from ['regular', 'irregular', 'separable', 'reflexive', 'akkusativ', 'dativ'], complete conjugations for ALL persons across PRASENS, PRATERITUM, PERFEKT, KONJUNKTIV2_PRATERITUM, FUTUR1, PLUSQUAMPERFEKT, KONJUNKTIV1_PRASENS, FUTUR2, IMPERATIV) for the following German verbs.
CRITICAL: DO NOT INCLUDE SUBJECT PRONOUNS (ich, du, er, sie, es, wir, ihr, Sie) IN THE CONJUGATION VALUES! Return ONLY the conjugated verb forms.
${JSON.stringify(items, null, 2)}

Return a JSON object with key "items" containing the completed list of verb items.
`;

    const customKeys = parseCustomKeysHeader(req);
    const geminiResult = await callGeminiWithFallback({ contents: prompt, customKeys });
    attachCustomKeyMeta(res, geminiResult);
    let parsed = parseCleanJson(geminiResult.text);
    if (Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map((vItem: any) => cleanConjugationPronouns(vItem));
    }
    res.json({ success: true, items: parsed.items || [] });
  } catch (err: any) {
    const reason = err.reason || "unknown";
    if (reason === "unknown") {
      console.error("[Unknown Gemini Error]", err);
    }
    res.status(500).json({
      success: false,
      error: err.userMessage || err.message || "Failed to process batch verbs.",
      userMessage: err.userMessage,
      reason: reason,
      ...(reason === "unknown" ? { debugRaw: { message: err.message || String(err), stack: err.stack, full: String(err) } } : {})
    });
  }
});

// API: Generate or Complete Synonym / Antonym / Word Family / Semantic Field / Comparative Adjective Groups
app.post("/api/gemini/synonyms-generate", async (req, res) => {
  try {
    const { mode, topic, currentGroup, existingWords, type } = req.body;

    const groupType = type || (currentGroup ? currentGroup.type : "synonym");

    let groupDescription = "";
    if (groupType === "synonym") {
      groupDescription = "German synonyms (مترادف‌ها - words with similar meanings)";
    } else if (groupType === "antonym") {
      groupDescription = "German antonyms (متضادها - words with opposite meanings)";
    } else if (groupType === "word_family") {
      groupDescription = "German Word Family (هم‌خانواده / Wortfamilie - words derived from a common root word using prefixes/suffixes like fahren -> abfahren, Erfahung, Fahrt)";
    } else if (groupType === "semantic_field") {
      groupDescription = "German Semantic Field / Word Field (میدان معنایی / Wortfeld - words sharing a common conceptual area e.g. time domain: Uhr, Tag, Monat, Jahr, Minute)";
    } else if (groupType === "idiom") {
      groupDescription = "German Idioms / Expressions (اصطلاحات و تعابیر کاربردی / Redewendungen - real-life expressions used in specific contexts e.g. greetings, shopping, express agreement/disagreement)";
    } else if (groupType === "comparative_adjective") {
      groupDescription = "German Comparative Adjectives (صفات مقایسه‌ای - Adjectives with Base form (Positiv), Persian Meaning, Comparative form (Komparativ), and Superlative form (Superlativ) e.g. schön -> schöner, am schönsten; gut -> besser, am besten)";
    }

    let prompt = "";
    if (mode === "complete_group" && currentGroup) {
      if (groupType === "comparative_adjective") {
        prompt = `You are a German grammar and vocabulary expert.
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
      } else {
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
      }
    } else {
      if (groupType === "comparative_adjective") {
        prompt = `You are a German grammar and vocabulary expert.
Create a high-quality Comparative Adjectives group (صفات مقایسه‌ای) for German language learners.
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
  "title": "Clear descriptive title in Persian & German (e.g. صفات مقایسه‌ای - Komparation der Adjektive)",
  "type": "comparative_adjective",
  "items": [
    { "word": "base adjective", "meaning": "Persian translation", "comparative": "Komparativ form", "superlative": "Superlativ form" }
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
    }

    const customKeys = parseCustomKeysHeader(req);
    const geminiResult = await callGeminiWithFallback({ contents: prompt, customKeys });
    attachCustomKeyMeta(res, geminiResult);
    const data = parseCleanJson(geminiResult.text);
    res.json({ success: true, data });
  } catch (err: any) {
    const reason = err.reason || "unknown";
    if (reason === "unknown") {
      console.error("[Unknown Gemini Error]", err);
    }
    res.status(500).json({
      success: false,
      error: err.userMessage || err.message || "Failed to generate synonym group.",
      userMessage: err.userMessage,
      reason: reason,
      ...(reason === "unknown" ? { debugRaw: { message: err.message || String(err), stack: err.stack, full: String(err) } } : {})
    });
  }
});

// API: Generate German Story with Target Vocabulary & Verbs
app.post("/api/gemini/story-generate", async (req, res) => {
  try {
    const { targetItems, cefrLevel } = req.body;
    if (!Array.isArray(targetItems) || targetItems.length === 0) {
      return res.status(400).json({ error: "At least one target item is required." });
    }

    const count = targetItems.length;
    // Scale length proportionally: strictly between 300 and 600 words
    // fewer items (~20) -> ~360 words; more items (~80) -> ~600 words
    const targetWordCount = Math.min(
      600,
      Math.max(300, Math.round(300 + ((count - 1) / Math.max(1, 79)) * 300))
    );
    const minWords = Math.max(300, targetWordCount - 25);
    const maxWords = Math.min(650, targetWordCount + 40);

    const levelStr =
      cefrLevel && cefrLevel !== "none"
        ? `STRICT CEFR LEVEL: The story must strictly match the linguistic complexity, syntax, and vocabulary of CEFR level "${cefrLevel}".`
        : "CEFR LEVEL: Natural, engaging intermediate German (evaluate whether the text fits A2, B1, or B2 and return the accurate level).";

    const formattedTargetList = targetItems
      .map((item: string, idx: number) => `${idx + 1}. ${item}`)
      .join("\n");

    const prompt = `You are a celebrated German author and literary educator writing in the tradition of L.A. Hill's world-famous story anthology "Steps to Understanding" (Geschichten zur Unterhaltung und zum Sprachverständnis).

YOUR MISSION:
Write a captivating, deeply natural, and beautifully layered German short story (eine vielschichtige, lebendige und humorvolle Kurzgeschichte) that seamlessly incorporates 100% OF THE TARGET ITEMS provided below.

NARRATIVE ARCHITECTURE & HIERARCHY (ساختار لایه‌بندی شده و سلسله‌مراتبی روایت):
The story MUST NOT be a random sequence of sentences or artificial word-dumping. It must strictly follow this 5-layer narrative hierarchy:
1. EBENE 1 — EXPOSITION & KULISSE (فضاسازی محیطی و روانی):
   Begin with rich, atmospheric German setting details (time of day, weather, sensory impressions, place like Freiburg, Hamburg, or a cozy Altstadt café). Introduce the protagonist with a believable personality, small habit, or mild human eccentricity.
2. EBENE 2 — MOTIVATION & BEZIEHUNGSDYNAMIK (روابط و انگیزه‌های شخصیتی):
   Establish real human desires, expectations, or contrasting character traits between two or three named characters (e.g. Herr Meier, die neugierige Nachbarin Frau Lindner, der kluge Lehrling Jan).
3. EBENE 3 — VERWICKLUNG & ESKALATION (گره‌افکنی و اوج‌گیری گام‌به‌گام ماجرا):
   A realistic predicament, comical misunderstanding, curious discovery, or awkward encounter develops logically through cause and effect across 4 to 6 substantial paragraphs.
4. EBENE 4 — LEBENDIGE DIALOGE & DEUTSCHE REDEMITTEL (دیالوگ‌های زنده با لحن گفتاری طبیعی آلمانی):
   Include realistic spoken German dialogues featuring natural conversational particles and idioms (e.g. "doch", "mal", "ja", "ausgerechnet heute", "na sowas!", "ach was", "sag bloß!"). The conversations must sound authentic and spontaneous, never stiff or robotic.
5. EBENE 5 — DIE HUMORVOLLE POINTE & AUFLÖSUNG (پیچش طنز پایانی به سبک Steps to Understanding):
   Build toward a clever, humorous, or ironic twist at the very climax where the situation is unexpectedly flipped or resolved with witty punchline dialogue.

NATURAL VOCABULARY INTEGRATION (تعبیه کاملاً طبیعی و غیرتحمیلی واژگان):
Here is the exact list of all ${count} target items:
${formattedTargetList}

- ABSOLUTE ZERO-OMISSION RULE: Every single one of these ${count} items MUST appear in your story! You are STRICTLY FORBIDDEN from omitting even one item.
- SEAMLESS EMBEDDING: Do NOT bunch target words into dense, unnatural lists. Spread them evenly throughout the 4 to 6 paragraphs in natural, idiomatic German syntax (Hauptsätze, Nebensätze mit 'weil/obwohl/als/dass', Relativsätze).
- NATURAL INFLECTIONS: Conjugate verbs into appropriate past tenses (Präteritum for narration, Perfekt/Präsens for dialogues) and inflect nouns and adjectives as natural German grammar requires.
- MANDATORY BOLDING: In "storyGerman", wrap every target item (or its conjugated/inflected form) in double asterisks, e.g. **Wort**, **ging**, **überrascht**, **schöne**. There must be at least ${count} bolded terms.
- In "usedTargetItems", return the list of all ${count} target items woven into the story.

LENGTH REQUIREMENT:
- The German story ("storyGerman") MUST contain between ${minWords} and ${maxWords} words (Target: ~${targetWordCount} words, strictly in the 300 to 600 words range).
- Under NO circumstance should the story have fewer than 300 words. Develop 4 to 6 rich, flowing paragraphs.

${levelStr}

EVALUATED CEFR LEVEL ("cefrLevel"):
Return the assessed CEFR proficiency level of the generated story ("A1", "A2", "B1", "B2", or "C1"). If a specific level was requested (${cefrLevel}), adhere to it and return it; if "none" was chosen, evaluate the vocabulary and grammatical sophistication of the story and return the matching level (e.g. "B1" or "B2").

PERSIAN TRANSLATION ("storyPersian"):
Provide a fluent, delightful, and natural Persian translation of the entire story that captures the narrative layers, character dialogue, and final humorous twist.

TITLE ("title"):
An evocative, witty German title with Persian translation (e.g. "Der schlaue Nachbar - همسایه باهوش").

Return valid JSON:
{
  "title": "German Title - عنوان فارسی",
  "storyGerman": "Full 4-6 paragraph layered story in German with **bold** target items...",
  "storyPersian": "ترجمه روان، لایه‌بندی شده و شیوای داستان به زبان فارسی با حفظ لحن شوخ‌طبعانه و دیالوگ‌ها...",
  "totalWordCount": ${targetWordCount},
  "cefrLevel": "B1",
  "usedTargetItems": ["item1", "item2"]
}`;

    const customKeys = parseCustomKeysHeader(req);
    const geminiResult = await callGeminiWithFallback({
      contents: prompt,
      customKeys,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          storyGerman: { type: Type.STRING },
          storyPersian: { type: Type.STRING },
          totalWordCount: { type: Type.INTEGER },
          cefrLevel: { type: Type.STRING },
          usedTargetItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["title", "storyGerman", "storyPersian", "totalWordCount", "cefrLevel", "usedTargetItems"]
      }
    });

    attachCustomKeyMeta(res, geminiResult);
    const data = parseCleanJson(geminiResult.text);

    // Server-side post-processing: Ensure accurate word count, CEFR level, and complete target word bolding
    if (data && typeof data.storyGerman === "string") {
      let text = data.storyGerman;

      // Set fallback CEFR level if missing or "none"
      if (!data.cefrLevel || data.cefrLevel === "none" || data.cefrLevel.trim() === "") {
        data.cefrLevel = cefrLevel && cefrLevel !== "none" ? cefrLevel : "B1";
      }

      // Ensure any target item that appears in the story unbolded gets bolded
      for (const item of targetItems) {
        if (typeof item !== "string") continue;
        const cleanItem = item.replace(/^(der|die|das|ein|eine)\s+/i, "").trim();
        if (cleanItem.length < 3) continue;

        const regex = new RegExp(`(?<!\\*\\*)(?<![a-zA-ZäöüßÄÖÜ])(${cleanItem})(?![a-zA-ZäöüßÄÖÜ])(?!\\*\\*)`, "gi");
        if (regex.test(text)) {
          text = text.replace(regex, "**$1**");
        }
      }

      data.storyGerman = text;

      // Accurately compute real word count from the German text
      const actualWords = text
        .replace(/\*\*/g, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      data.totalWordCount = actualWords.length;

      // Ensure usedTargetItems includes all target items present in text or reported
      const usedSet = new Set<string>(
        Array.isArray(data.usedTargetItems) ? data.usedTargetItems : []
      );
      for (const item of targetItems) {
        const cleanItem = item.replace(/^(der|die|das|ein|eine)\s+/i, "").trim().toLowerCase();
        if (text.toLowerCase().includes(cleanItem)) {
          usedSet.add(item);
        }
      }
      data.usedTargetItems = Array.from(usedSet);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    const reason = err.reason || "unknown";
    if (reason === "unknown") {
      console.error("[Unknown Gemini Error]", err);
    }
    res.status(500).json({
      success: false,
      error: err.userMessage || err.message || "Failed to generate story.",
      userMessage: err.userMessage,
      reason: reason,
      ...(reason === "unknown" ? { debugRaw: { message: err.message || String(err), stack: err.stack, full: String(err) } } : {})
    });
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
