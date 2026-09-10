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

export interface ProviderMeta {
  id: ApiKeyProvider;
  name: string;
  nameFa: string;
  candidateModels: string[];
  placeholder: string;
  descriptionFa: string;
  baseUrl?: string;
  keyPrefix?: string;
}

export const PROVIDER_LIST: ProviderMeta[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    nameFa: "گوگل جمینای (Google Gemini)",
    candidateModels: ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-1.5-flash"],
    placeholder: "AIzaSy...",
    descriptionFa: "سریع با سهمیه روزانه عالی و امکان تعیین هر مدل از خانواده Gemini",
    keyPrefix: "AIza",
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    nameFa: "اوپن‌ای‌آی (OpenAI / ChatGPT)",
    candidateModels: ["gpt-4o-mini", "gpt-4o", "chatgpt-4o-latest", "gpt-3.5-turbo", "o3-mini"],
    placeholder: "sk-proj-... یا sk-...",
    descriptionFa: "استاندارد جهانی هوش مصنوعی با امکان ارسال دقیق نام هر مدل اوپن‌ای‌آی",
    keyPrefix: "sk-",
  },
  {
    id: "groq",
    name: "Groq Cloud",
    nameFa: "گروک (Groq Cloud - بسیار پرسرعت و رایگان)",
    candidateModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama3-70b-8192", "mixtral-8x7b-32768"],
    placeholder: "gsk_...",
    descriptionFa: "پردازش فوق‌العاده سریع با مدل‌های متن‌باز لاما ۳.۳ و میکسترال",
    keyPrefix: "gsk_",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    nameFa: "دیپ‌سیک (DeepSeek)",
    candidateModels: ["deepseek-chat", "deepseek-reasoner"],
    placeholder: "sk-...",
    descriptionFa: "استدلال عمیق و مقرون‌به‌صرفه با مدل‌های V3 و Reasoner",
    baseUrl: "https://api.deepseek.com",
    keyPrefix: "sk-",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    nameFa: "آنت Consistent کلود (Anthropic Claude)",
    candidateModels: ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "claude-3-5-sonnet-latest"],
    placeholder: "sk-ant-...",
    descriptionFa: "درک زبانی فوق‌العاده با مدل‌های Haiku و Sonnet",
    keyPrefix: "sk-ant-",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    nameFa: "اوپن‌روتر (OpenRouter - درگاه به تمام مدل‌ها)",
    candidateModels: ["google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct", "openai/gpt-4o-mini", "deepseek/deepseek-chat"],
    placeholder: "sk-or-...",
    descriptionFa: "دسترسی با یک کلید به صدها مدل متنوع از تمام شرکت‌های جهان",
    baseUrl: "https://openrouter.ai/api/v1",
    keyPrefix: "sk-or-",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    nameFa: "میسترال (Mistral AI)",
    candidateModels: ["mistral-small-latest", "mistral-medium-latest", "open-mixtral-8x7b", "mistral-large-latest"],
    placeholder: "sk-...",
    descriptionFa: "مدل‌های بهینه‌سازی‌شده اروپایی برای گرامر و ساختار زبان آلمانی",
    baseUrl: "https://api.mistral.ai/v1",
  },
  {
    id: "together",
    name: "Together AI",
    nameFa: "توگدر ای‌آی (Together AI)",
    candidateModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "mistralai/Mixtral-8x7B-Instruct-v0.1", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
    placeholder: "توکن Together AI...",
    descriptionFa: "سرویس‌دهنده ابری مدل‌های قدرتمند متن‌باز Llama، Qwen و Mistral",
    baseUrl: "https://api.together.xyz/v1",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    nameFa: "ایکس ای‌آی (xAI Grok)",
    candidateModels: ["grok-2-latest", "grok-beta"],
    placeholder: "xai-...",
    descriptionFa: "مدل‌های زبانی هوشمند گراک از شرکت xAI",
    baseUrl: "https://api.x.ai/v1",
  },
  {
    id: "perplexity",
    name: "Perplexity AI",
    nameFa: "پرپلکسیتی (Perplexity AI)",
    candidateModels: ["sonar-pro", "sonar"],
    placeholder: "pplx-...",
    descriptionFa: "مدل‌های جستجو و استدلال زبانی سریع سونار",
    baseUrl: "https://api.perplexity.ai",
  },
  {
    id: "cerebras",
    name: "Cerebras Cloud",
    nameFa: "سربراس (Cerebras - پرسرعت‌ترین چیپ دنیا)",
    candidateModels: ["llama-3.3-70b", "llama3.1-8b"],
    placeholder: "csk-...",
    descriptionFa: "سرعت نجومی تولید توکن با چیپ‌های سخت‌افزاری اختصاصی",
    baseUrl: "https://api.cerebras.ai/v1",
  },
  {
    id: "custom",
    name: "Any Custom Provider / Endpoint",
    nameFa: "⭐ هر شرکت یا ارائه‌دهنده دیگر (سرور دلخواه، محلی یا ابری)",
    candidateModels: ["gpt-4o-mini", "llama3.3", "qwen2.5", "mistral"],
    placeholder: "کلید API، توکن اختصاصی یا توکن محلی...",
    descriptionFa: "اتصال به هر شرکت یا پلتفرم دیگر در جهان (SambaNova, Fireworks, Lepton, Ollama, vLLM و...)",
    baseUrl: "https://api.together.xyz/v1",
  },
];

export function detectProvider(key: string): ApiKeyProvider {
  const trimmed = (key || "").trim();
  if (trimmed.startsWith("AIza")) return "gemini";
  if (trimmed.startsWith("gsk_")) return "groq";
  if (trimmed.startsWith("sk-ant-")) return "anthropic";
  if (trimmed.startsWith("sk-or-")) return "openrouter";
  if (trimmed.startsWith("pplx-")) return "perplexity";
  if (trimmed.startsWith("xai-")) return "xai";
  if (trimmed.startsWith("csk-")) return "cerebras";
  if (trimmed.startsWith("sk-proj-") || trimmed.startsWith("sk-")) return "openai";
  return "custom";
}

export interface CustomApiKey {
  id: string;
  name: string;
  key: string;
  provider: ApiKeyProvider;
  providerName?: string;
  model?: string;
  baseUrl?: string;
  enabled: boolean;
  tokenUsage: number;
  status: "idle" | "valid" | "invalid" | "checking";
  errorMessage?: string;
  lastChecked?: number;
  lastUsed?: number;
  createdAt: number;
}

const STORAGE_KEY = "german_app_custom_api_keys";

export const apiKeyService = {
  getKeys(): CustomApiKey[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map((k) => ({
          ...k,
          provider: k.provider || detectProvider(k.key),
        }));
      }
    } catch (e) {
      console.error("Failed to read custom api keys from storage:", e);
    }
    return [];
  },

  saveKeys(keys: CustomApiKey[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
      window.dispatchEvent(new CustomEvent("custom-api-keys-updated", { detail: keys }));
    } catch (e) {
      console.error("Failed to save custom api keys to storage:", e);
    }
  },

  addKey(
    name: string,
    key: string,
    provider?: ApiKeyProvider,
    model?: string,
    baseUrl?: string,
    providerName?: string
  ): CustomApiKey {
    const cleanKey = key.trim();
    const resolvedProvider = provider || detectProvider(cleanKey);
    const providerMeta = PROVIDER_LIST.find((p) => p.id === resolvedProvider);
    const cleanName =
      name.trim() ||
      `${providerName?.trim() || providerMeta?.name || "API"} ${Date.now().toString().slice(-4)}`;

    const newEntry: CustomApiKey = {
      id: "key_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      name: cleanName,
      key: cleanKey,
      provider: resolvedProvider,
      providerName: providerName?.trim() || undefined,
      model: model?.trim() || undefined,
      baseUrl: baseUrl?.trim() || undefined,
      enabled: true,
      tokenUsage: 0,
      status: "idle",
      createdAt: Date.now(),
    };

    const keys = this.getKeys();
    keys.unshift(newEntry);
    this.saveKeys(keys);
    return newEntry;
  },

  updateKeyModel(id: string, newModel: string): void {
    const keys = this.getKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx !== -1) {
      keys[idx].model = newModel.trim() || undefined;
      keys[idx].status = "idle";
      this.saveKeys(keys);
    }
  },

  updateKey(id: string, updates: Partial<CustomApiKey>): void {
    const keys = this.getKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx !== -1) {
      keys[idx] = { ...keys[idx], ...updates };
      this.saveKeys(keys);
    }
  },

  deleteKey(id: string): void {
    const keys = this.getKeys().filter((k) => k.id !== id);
    this.saveKeys(keys);
  },

  toggleKey(id: string): void {
    const keys = this.getKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx !== -1) {
      keys[idx].enabled = !keys[idx].enabled;
      this.saveKeys(keys);
    }
  },

  resetTokenUsage(id: string): void {
    const keys = this.getKeys();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx !== -1) {
      keys[idx].tokenUsage = 0;
      this.saveKeys(keys);
    }
  },

  recordUsage(keyId: string, tokens: number): void {
    if (!keyId || tokens <= 0) return;
    const keys = this.getKeys();
    const idx = keys.findIndex((k) => k.id === keyId);
    if (idx !== -1) {
      keys[idx].tokenUsage = (keys[idx].tokenUsage || 0) + tokens;
      keys[idx].lastUsed = Date.now();
      this.saveKeys(keys);
    }
  },

  getEnabledKeys(): {
    id: string;
    key: string;
    name: string;
    provider: ApiKeyProvider;
    providerName?: string;
    model?: string;
    baseUrl?: string;
  }[] {
    return this.getKeys()
      .filter((k) => k.enabled && k.key && k.key.trim().length > 5)
      .map((k) => ({
        id: k.id,
        key: k.key.trim(),
        name: k.name,
        provider: k.provider || detectProvider(k.key),
        providerName: k.providerName,
        model: k.model,
        baseUrl: k.baseUrl,
      }));
  },

  async validateKey(
    apiKey: string,
    provider?: ApiKeyProvider,
    baseUrl?: string,
    model?: string
  ): Promise<{ valid: boolean; model?: string; provider?: string; error?: string }> {
    try {
      const res = await fetch("/api/gemini/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          provider,
          baseUrl,
          model,
        }),
      });
      const data = await res.json();
      return {
        valid: res.ok && data.valid === true,
        model: data.model,
        provider: data.provider,
        error: data.error,
      };
    } catch (e: any) {
      return {
        valid: false,
        error: e.message || "خطا در اتصال به سرور جهت تست کلید",
      };
    }
  },

  async testKey(id: string): Promise<boolean> {
    const keys = this.getKeys();
    const keyItem = keys.find((k) => k.id === id);
    if (!keyItem) return false;

    this.updateKey(id, { status: "checking" });
    const result = await this.validateKey(
      keyItem.key,
      keyItem.provider,
      keyItem.baseUrl,
      keyItem.model
    );

    this.updateKey(id, {
      status: result.valid ? "valid" : "invalid",
      errorMessage: result.error,
      lastChecked: Date.now(),
    });

    return result.valid;
  },

  async testAllKeys(): Promise<void> {
    const keys = this.getKeys();
    for (const k of keys) {
      await this.testKey(k.id);
    }
  }
};

// Global geminiFetch wrapper that attaches custom API keys and records usage safely
export async function geminiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const enabledKeys = apiKeyService.getEnabledKeys();
  const modifiedInit: RequestInit = { ...(init || {}) };
  const headers = new Headers(modifiedInit.headers || {});

  if (enabledKeys.length > 0) {
    headers.set("x-custom-api-keys", JSON.stringify(enabledKeys));
  }
  modifiedInit.headers = headers;

  const response = await fetch(input, modifiedInit);

  // Check if a custom key was used from headers
  const usedKeyId = response.headers.get("x-used-custom-key-id");
  const tokenCountStr = response.headers.get("x-used-token-count");

  if (usedKeyId && tokenCountStr) {
    const tokens = parseInt(tokenCountStr, 10) || 0;
    apiKeyService.recordUsage(usedKeyId, tokens);
  }

  return response;
}

