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
