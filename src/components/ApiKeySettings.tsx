import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Zap,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Server,
  Sparkles,
  Settings2,
  Edit3,
  X
} from "lucide-react";
import {
  apiKeyService,
  CustomApiKey,
  ApiKeyProvider,
  PROVIDER_LIST,
  detectProvider,
} from "../services/apiKeyService";
import { Locale } from "../translations";

interface ApiKeySettingsProps {
  locale: Locale;
  isRtl: boolean;
}

export default function ApiKeySettings({ locale, isRtl }: ApiKeySettingsProps) {
  const [keys, setKeys] = useState<CustomApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<ApiKeyProvider>("gemini");
  const [customProviderName, setCustomProviderName] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNewKey, setShowNewKey] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isTestingAll, setIsTestingAll] = useState(false);

  // State for inline model editing
  const [editingModelKeyId, setEditingModelKeyId] = useState<string | null>(null);
  const [editingModelValue, setEditingModelValue] = useState("");

  // Load keys on mount and listen to updates
  useEffect(() => {
    const refreshKeys = () => {
      setKeys(apiKeyService.getKeys());
    };
    refreshKeys();

    const handleUpdate = () => {
      refreshKeys();
    };

    window.addEventListener("custom-api-keys-updated", handleUpdate);
    return () => {
      window.removeEventListener("custom-api-keys-updated", handleUpdate);
    };
  }, []);

  const handleKeyChange = (val: string) => {
    setNewKeyValue(val);
    const clean = val.trim();
    if (clean.length >= 4) {
      const detected = detectProvider(clean);
      if (detected !== "custom") {
        setSelectedProvider(detected);
      }
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const cleanKey = newKeyValue.trim();
    if (!cleanKey) {
      setAddError(locale === "fa" ? "لطفاً مقدار کلید API را وارد کنید." : "Please enter the API key.");
      return;
    }

    if (cleanKey.length < 5) {
      setAddError(locale === "fa" ? "طول کلید وارد شده بسیار کوتاه است." : "The API key entered is too short.");
      return;
    }

    // Check duplicate
    if (keys.some((k) => k.key === cleanKey)) {
      setAddError(locale === "fa" ? "این کلید قبلاً به لیست اضافه شده است." : "This API key is already in the list.");
      return;
    }

    setIsAdding(true);
    try {
      const added = apiKeyService.addKey(
        newKeyName,
        cleanKey,
        selectedProvider,
        customModel.trim() || undefined,
        customBaseUrl.trim() || undefined,
        selectedProvider === "custom" && customProviderName.trim() ? customProviderName.trim() : undefined
      );
      setNewKeyName("");
      setNewKeyValue("");
      setCustomModel("");
      setCustomBaseUrl("");
      setCustomProviderName("");
      setShowNewKey(false);
      setShowAdvanced(false);

      // Automatically test connection for the newly added key
      await apiKeyService.testKey(added.id);
    } catch (err: any) {
      setAddError(err.message || "خطا در افزودن کلید");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = (id: string) => {
    apiKeyService.toggleKey(id);
  };

  const handleDelete = (id: string) => {
    apiKeyService.deleteKey(id);
    setDeleteConfirmId(null);
  };

  const handleTestKey = async (id: string) => {
    await apiKeyService.testKey(id);
  };

  const handleTestAll = async () => {
    setIsTestingAll(true);
    try {
      await apiKeyService.testAllKeys();
    } finally {
      setIsTestingAll(false);
    }
  };

  const handleResetUsage = (id: string) => {
    apiKeyService.resetTokenUsage(id);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startEditModel = (keyItem: CustomApiKey) => {
    setEditingModelKeyId(keyItem.id);
    setEditingModelValue(keyItem.model || "");
  };

  const saveEditModel = (id: string) => {
    apiKeyService.updateKeyModel(id, editingModelValue.trim());
    setEditingModelKeyId(null);
  };

  const cancelEditModel = () => {
    setEditingModelKeyId(null);
    setEditingModelValue("");
  };

  // Stats calculations
  const totalKeys = keys.length;
  const enabledKeysCount = keys.filter((k) => k.enabled).length;
  const totalTokensConsumed = keys.reduce((acc, k) => acc + (k.tokenUsage || 0), 0);
  const currentProviderMeta = PROVIDER_LIST.find((p) => p.id === selectedProvider) || PROVIDER_LIST[0];

  const getProviderColor = (provider: ApiKeyProvider) => {
    switch (provider) {
      case "gemini":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "openai":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "groq":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "deepseek":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "anthropic":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "openrouter":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "mistral":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "together":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "xai":
        return "bg-zinc-100 text-zinc-900 border-zinc-300";
      case "perplexity":
        return "bg-teal-50 text-teal-700 border-teal-200";
      case "cerebras":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className={`space-y-6 max-w-5xl mx-auto ${isRtl ? "text-right font-vazir" : "text-left"}`}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-7 rounded-3xl shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-indigo-500/25 border border-indigo-400/30 px-3 py-1 rounded-xl text-xs text-indigo-200 font-semibold">
              <Cpu className="w-3.5 h-3.5" />
              <span>{locale === "fa" ? "آزادی کامل انتخاب ارائه‌دهنده و نام دقیق مدل" : "Universal Provider & Exact Model Freedom"}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              {locale === "fa" ? "تنظیمات کلیدهای API (پشتیبانی از تمام شرکت‌های هوش مصنوعی)" : "Universal AI API Keys & Custom Models"}
            </h2>
            <p className="text-xs sm:text-sm text-indigo-200/90 max-w-2xl leading-relaxed">
              {locale === "fa"
                ? "هیچ اجباری به استفاده از گوگل یا شرکت خاصی نیست! شما می‌توانید از کلید هر شرکت یا پلتفرمی در دنیا استفاده کنید و نام دقیق مدل دلخواهتان را تایپ کنید تا درخواست مستقیماً با همان ارسال شود."
                : "No provider lock-in. Use API keys from any company worldwide, specify exact model names, or let the app automatically select working models."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start md:self-auto">
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm"
            >
              <span>Groq Cloud (Free)</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm"
            >
              <span>Google Gemini</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm"
            >
              <span>OpenAI API</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Keys */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 block">
              {locale === "fa" ? "تعداد کل کلیدها" : "Total Keys"}
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono">{totalKeys}</span>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl">
            <KeyRound className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Active / Enabled Keys */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 block">
              {locale === "fa" ? "کلیدهای فعال" : "Active Keys"}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600 font-mono">{enabledKeysCount}</span>
              <span className="text-[11px] text-slate-400">
                {locale === "fa" ? `از ${totalKeys} کلید` : `of ${totalKeys}`}
              </span>
            </div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Total Tokens Handled */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 block">
              {locale === "fa" ? "مجموع توکن‌های پردازش‌شده" : "Tokens Processed"}
            </span>
            <span className="text-2xl font-black text-indigo-600 font-mono">
              {totalTokensConsumed.toLocaleString()}
            </span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Add New Key Form */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Plus className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              {locale === "fa" ? "افزودن کلید جدید (از هر شرکت با مدل دلخواه)" : "Add API Key (Any Company & Model)"}
            </h3>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>{locale === "fa" ? "ذخیره‌سازی کاملاً محلی و امن در مرورگر" : "Stored locally & privately"}</span>
          </div>
        </div>

        {addError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{addError}</span>
          </div>
        )}

        <form onSubmit={handleAddKey} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Provider Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {locale === "fa" ? "ارائه‌دهنده یا شرکت API:" : "AI Provider / Company:"}
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as ApiKeyProvider)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/70 font-sans cursor-pointer"
              >
                {PROVIDER_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {locale === "fa" ? p.nameFa : p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* If Custom Provider, enter company name */}
            {selectedProvider === "custom" ? (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {locale === "fa" ? "نام شرکت یا پلتفرم شما:" : "Company / Platform Name:"}
                </label>
                <input
                  type="text"
                  value={customProviderName}
                  onChange={(e) => setCustomProviderName(e.target.value)}
                  placeholder={locale === "fa" ? "مثلاً: SambaNova، Fireworks یا سرور من" : "e.g. SambaNova, Fireworks, My Server"}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/70"
                />
              </div>
            ) : (
              /* Key Name / Label */
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {locale === "fa" ? "عنوان دلخواه برای این کلید (اختیاری):" : "Label (Optional):"}
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={locale === "fa" ? "مثلاً: اکانت Groq من، سرور اختصاصی..." : "e.g. My Primary Key"}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/70"
                />
              </div>
            )}

            {/* Key Value */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {locale === "fa" ? "مقدار کلید API (Key):" : "API Key:"}
              </label>
              <div className="relative">
                <input
                  type={showNewKey ? "text" : "password"}
                  value={newKeyValue}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder={currentProviderMeta.placeholder}
                  className={`w-full py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/70 font-mono ${
                    isRtl ? "pl-10 pr-3.5" : "pr-10 pl-3.5"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewKey(!showNewKey)}
                  className={`absolute top-2.5 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer ${
                    isRtl ? "left-2" : "right-2"
                  }`}
                  title={showNewKey ? "مخفی کردن" : "نمایش کلید"}
                >
                  {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Exact Model Input - Prominent and User-Controlled */}
          <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-3.5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                <span>{locale === "fa" ? "نام دقیق مدل مورد نظر شما (Exact Model Name):" : "Exact Model Name:"}</span>
              </label>
              <span className="text-[11px] text-indigo-600 font-medium">
                {customModel.trim()
                  ? (locale === "fa" ? `درخواست مستقیماً با مدل «${customModel.trim()}» ارسال خواهد شد` : `Directly using "${customModel.trim()}"`)
                  : (locale === "fa" ? "خالی = انتخاب خودکار از مدل‌های فعال (بدون اجبار)" : "Empty = Auto-detect working model")}
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder={
                  locale === "fa"
                    ? "نام دقیق مدل را تایپ کنید (مثلاً llama-3.3-70b-versatile یا gpt-4o یا claude-3-5-sonnet-20241022 یا هر مدل دیگر)..."
                    : "Type exact model name (e.g. gpt-4o, llama-3.3-70b-versatile, deepseek-chat, or your custom model)..."
                }
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-mono placeholder:text-slate-400"
              />
              {customModel && (
                <button
                  type="button"
                  onClick={() => setCustomModel("")}
                  className={`absolute top-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer ${
                    isRtl ? "left-2" : "right-2"
                  }`}
                  title="پاک کردن مدل (حالت خودکار)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Pick Chips for candidate models */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">
                {locale === "fa" ? "پیشنهادهای سریع (یا نام مدل خود را بالا تایپ کنید):" : "Quick suggestions:"}
              </span>
              {currentProviderMeta.candidateModels.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setCustomModel(m)}
                  className={`px-2 py-0.5 rounded-lg font-mono text-[10px] transition-all cursor-pointer border ${
                    customModel === m
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold"
                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL (Optional / for Custom or local servers) */}
          {(selectedProvider === "custom" || showAdvanced) && (
            <div className="p-3.5 bg-indigo-50/40 border border-indigo-100 rounded-2xl space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                {locale === "fa" ? "آدرس پایه سرور (Base URL - اختصاصی یا محلی):" : "Base URL (Custom / Local / Proxy):"}
              </label>
              <input
                type="text"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder={
                  selectedProvider === "custom"
                    ? "https://api.together.xyz/v1 یا http://localhost:11434/v1 یا آدرس سرور دلخواه شما..."
                    : (currentProviderMeta.baseUrl || "https://...")
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-mono"
              />
              <p className="text-[10px] text-slate-500">
                {locale === "fa"
                  ? "اگر از سرور اختصاصی، نرم‌افزار محلی (Ollama/vLLM/LM Studio) یا سایر سرویس‌های ابری استفاده می‌کنید آدرس آن را اینجا قرار دهید."
                  : "Specify endpoint URL if connecting to local Ollama, vLLM, LM Studio, or third-party proxies."}
              </p>
            </div>
          )}

          {/* Form Footer Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {selectedProvider !== "custom" && (
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 cursor-pointer font-bold"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>{showAdvanced ? (locale === "fa" ? "بستن آدرس سرور" : "Hide Base URL") : (locale === "fa" ? "تنظیم آدرس سرور اختصاصی (Base URL)" : "Custom Base URL")}</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isAdding}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{locale === "fa" ? "در حال اعتبارسنجی اتصال..." : "Validating connection..."}</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{locale === "fa" ? "افزودن و تست اتصال کلید" : "Add & Test Key"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Keys List Section */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              {locale === "fa" ? "فهرست کلیدهای متصل شده" : "Connected AI Keys"}
            </h3>
            <p className="text-xs text-slate-500">
              {locale === "fa"
                ? "مشاهده شرکت ارائه‌دهنده، نام دقیق مدل فعال، قابلیت ویرایش مدل و وضعیت اتصال"
                : "Manage provider, exact model overrides, connection status, and token usage"}
            </p>
          </div>

          {keys.length > 0 && (
            <button
              onClick={handleTestAll}
              disabled={isTestingAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? "animate-spin text-indigo-600" : ""}`} />
              <span>{locale === "fa" ? "بررسی اتصال همه کلیدها" : "Test All Connections"}</span>
            </button>
          )}
        </div>

        {keys.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl space-y-2">
            <KeyRound className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-600">
              {locale === "fa" ? "هنوز کلیدی ثبت نشده است." : "No custom API keys registered yet."}
            </p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
              {locale === "fa"
                ? "می‌توانید کلیدهای رایگان یا اشتراکی خود از هر شرکتی در جهان (Google، Groq، OpenAI، Claude، DeepSeek، سرورهای شخصی و...) را ثبت کنید."
                : "Add keys from any AI provider worldwide to ensure seamless, unlimited generation."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => {
              const isRevealed = revealedKeys[k.id] || false;
              const maskedKey = isRevealed
                ? k.key
                : `${k.key.substring(0, 6)}••••••••••••••••${k.key.substring(k.key.length - 4)}`;
              const providerMeta = PROVIDER_LIST.find((p) => p.id === k.provider);
              const displayName = k.providerName || (providerMeta ? (locale === "fa" ? providerMeta.nameFa : providerMeta.name) : k.provider);

              const isEditingThisModel = editingModelKeyId === k.id;

              return (
                <div
                  key={k.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    k.enabled
                      ? "bg-white border-slate-200/90 shadow-2xs hover:border-indigo-300"
                      : "bg-slate-50/70 border-slate-200 text-slate-400 opacity-75"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Left: Key Info */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-extrabold ${k.enabled ? "text-slate-900" : "text-slate-500"}`}>
                          {k.name}
                        </span>

                        {/* Provider Badge */}
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getProviderColor(k.provider)}`}>
                          <Server className="w-3 h-3" />
                          <span>{displayName}</span>
                        </span>

                        {/* Model Badge & Inline Edit */}
                        {isEditingThisModel ? (
                          <div className="inline-flex items-center gap-1 bg-white border border-indigo-300 rounded-lg p-0.5 shadow-xs">
                            <input
                              type="text"
                              value={editingModelValue}
                              onChange={(e) => setEditingModelValue(e.target.value)}
                              placeholder={locale === "fa" ? "نام مدل (خالی = خودکار)..." : "Model name..."}
                              className="px-2 py-0.5 text-xs font-mono border-none outline-none w-36 bg-transparent"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => saveEditModel(k.id)}
                              className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer"
                              title="ذخیره نام مدل"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditModel}
                              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                              title="انصراف"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            {k.model ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <Cpu className="w-2.5 h-2.5 text-indigo-500" />
                                <span>{k.model}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-sans bg-slate-100 text-slate-600 border border-slate-200">
                                <Sparkles className="w-2.5 h-2.5 text-slate-400" />
                                <span>{locale === "fa" ? "مدل: خودکار (آبشاری)" : "Model: Auto-detect"}</span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditModel(k)}
                              className="p-1 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                              title={locale === "fa" ? "تغییر یا تعیین نام دقیق مدل" : "Edit exact model name"}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* Status Badge */}
                        {k.status === "checking" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>{locale === "fa" ? "در حال تست..." : "Testing..."}</span>
                          </span>
                        ) : k.status === "valid" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{locale === "fa" ? "متصل و آماده" : "Connected & Ready"}</span>
                          </span>
                        ) : k.status === "invalid" ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                            title={k.errorMessage}
                          >
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>{locale === "fa" ? "خطای اتصال / مدل" : "Connection Error"}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span>{locale === "fa" ? "تست نشده" : "Untested"}</span>
                          </span>
                        )}

                        {/* Usage Counter Badge */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Zap className="w-3 h-3 text-indigo-500" />
                          <span>
                            {locale === "fa"
                              ? `${(k.tokenUsage || 0).toLocaleString()} توکن`
                              : `${(k.tokenUsage || 0).toLocaleString()} tokens`}
                          </span>
                        </span>
                      </div>

                      {/* Key string & action buttons */}
                      <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 flex-wrap">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-lg select-all break-all">
                          {maskedKey}
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleReveal(k.id)}
                          className="p-1 hover:text-slate-900 transition-colors cursor-pointer text-slate-400"
                          title={isRevealed ? "مخفی کردن" : "نمایش کامل"}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(k.id, k.key)}
                          className="p-1 hover:text-slate-900 transition-colors cursor-pointer text-slate-400"
                          title="کپی در حافظه"
                        >
                          {copiedId === k.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {k.baseUrl && (
                          <span className="text-[10px] text-slate-400 font-sans" title={k.baseUrl}>
                            URL: {k.baseUrl}
                          </span>
                        )}

                        {k.tokenUsage > 0 && (
                          <button
                            type="button"
                            onClick={() => handleResetUsage(k.id)}
                            className="text-[10px] text-slate-400 hover:text-indigo-600 font-sans transition-colors cursor-pointer mr-1"
                            title="صفر کردن شمارنده مصرف"
                          >
                            ({locale === "fa" ? "صفر کردن مصرف" : "reset"})
                          </button>
                        )}
                      </div>

                      {k.errorMessage && k.status === "invalid" && (
                        <p className="text-[10px] text-rose-600 font-sans mt-1">
                          {k.errorMessage}
                        </p>
                      )}
                    </div>

                    {/* Right: Controls (Toggle Switch, Test, Delete) */}
                    <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center pt-2 lg:pt-0">
                      {/* Toggle On/Off Switch */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-[11px] font-bold text-slate-600">
                          {k.enabled
                            ? (locale === "fa" ? "فعال" : "Active")
                            : (locale === "fa" ? "غیرفعال" : "Disabled")}
                        </span>
                        <div
                          onClick={() => handleToggle(k.id)}
                          className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                            k.enabled ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                              k.enabled
                                ? (isRtl ? "-translate-x-5" : "translate-x-5")
                                : "translate-x-0"
                            }`}
                          />
                        </div>
                      </label>

                      {/* Test Single Button */}
                      <button
                        onClick={() => handleTestKey(k.id)}
                        disabled={k.status === "checking"}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 disabled:opacity-50 text-slate-700 rounded-xl text-[11px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${k.status === "checking" ? "animate-spin" : ""}`} />
                        <span>{locale === "fa" ? "تست" : "Test"}</span>
                      </button>

                      {/* Delete Button */}
                      {deleteConfirmId !== k.id ? (
                        <button
                          onClick={() => setDeleteConfirmId(k.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="حذف کلید"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 p-1 rounded-xl">
                          <span className="text-[10px] text-rose-700 font-bold px-1">
                            {locale === "fa" ? "حذف؟" : "Delete?"}
                          </span>
                          <button
                            onClick={() => handleDelete(k.id)}
                            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer"
                          >
                            {locale === "fa" ? "بله" : "Yes"}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-1.5 py-0.5 text-slate-500 hover:text-slate-800 text-[10px] cursor-pointer"
                          >
                            {locale === "fa" ? "خیر" : "No"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
