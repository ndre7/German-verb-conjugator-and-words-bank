import React, { useState, useEffect } from "react";
import {
  BookOpen,
  BookMarked,
  Settings,
  Cpu,
  Smartphone,
  Chrome,
  Globe,
  Database,
  Upload,
  FolderOpen,
  Info,
  CheckCircle,
  Download,
  Languages,
  Loader2,
  XCircle,
  Check,
  Trash2,
  ArrowUp,
  History,
  RotateCcw,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
  Tag,
  Layers,
  Sparkles,
  Bookmark,
  KeyRound,
  Sliders
} from "lucide-react";
import { dbService, db } from "./DatabaseService";
import { unzipSync } from "fflate";
import VerbTable from "./components/VerbTable";
import VocabularyManager from "./components/VocabularyManager";
import VerbDbSettings from "./components/VerbDbSettings";
import ApiKeySettings from "./components/ApiKeySettings";
import LanguageSettings from "./components/LanguageSettings";
import { StoryPractice } from "./components/StoryPractice";
import { translations, Locale } from "./translations";
import { type AppChangeLog, type VocabChangeLog } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"conjugator" | "vocabulary" | "practice" | "settings" | "history">("conjugator");
  const [vocabSubTab, setVocabSubTab] = useState<"bank" | "synonym_antonym" | "categories">("bank");
  const [practiceSubTab, setPracticeSubTab] = useState<"story" | "saved_stories">("story");
  const [settingsSubTab, setSettingsSubTab] = useState<"verb_db" | "api_key" | "language">("verb_db");
  const [historySection, setHistorySection] = useState<"verbs" | "vocab">("verbs");

  // Hamburger Drawer & Accordion States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [verbGroupOpen, setVerbGroupOpen] = useState(true);
  const [vocabGroupOpen, setVocabGroupOpen] = useState(true);
  const [practiceGroupOpen, setPracticeGroupOpen] = useState(true);
  const [settingsGroupOpen, setSettingsGroupOpen] = useState(true);

  const [changeLogs, setChangeLogs] = useState<AppChangeLog[]>([]);
  const [vocabChangeLogs, setVocabChangeLogs] = useState<VocabChangeLog[]>([]);
  const [detectedEnv, setDetectedEnv] = useState<string>("browser");
  const [tauriPath, setTauriPath] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // New visual progress states
  const [uploadStatus, setUploadStatus] = useState<"idle" | "reading" | "parsing" | "saving" | "success" | "error">("idle");
  const [uploadStep, setUploadStep] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importedVerbsCount, setImportedVerbsCount] = useState<number>(0);
  const [reloadCountdown, setReloadCountdown] = useState<number | null>(null);

  const [tauriSaveStatus, setTauriSaveStatus] = useState<"idle" | "checking" | "saving" | "success" | "error">("idle");
  const [tauriSaveStep, setTauriSaveStep] = useState<number>(0);

  // States for deleting custom database and restoring sample database
  const [persistedDbName, setPersistedDbName] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "resetting" | "success" | "error">("idle");
  const [deleteStep, setDeleteStep] = useState<number>(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const [showScrollTop, setShowScrollTop] = useState(false);

  // Global Backup & Restore Modal states
  const [showGlobalBackupModal, setShowGlobalBackupModal] = useState(false);
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);

  const handleExportFullBackup = async () => {
    setBackupExporting(true);
    setBackupStatusMessage(null);
    try {
      const jsonStr = await dbService.exportFullBackupJSON();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.download = `German_Language_Manager_Full_Backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBackupStatusMessage(
        locale === "fa"
          ? "فایل پشتیبان جامع (بکاپ) با موفقیت تولید و دانلود شد ✨"
          : "Complete backup file generated and exported successfully ✨"
      );
    } catch (e: any) {
      alert("Error exporting backup: " + e?.message);
    } finally {
      setBackupExporting(false);
    }
  };

  const handleImportFullBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupImporting(true);
    setBackupStatusMessage(
      locale === "fa"
        ? "در حال پردازش، بازخوانی و جای‌گذاری کامل اطلاعات پشتیبان..."
        : "Processing and restoring complete backup data..."
    );

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const success = await dbService.importFullBackupJSON(text);
        if (success) {
          setBackupStatusMessage(
            locale === "fa"
              ? "بازیابی اطلاعات بکاپ با موفقیت 100٪ انجام شد! تمام افعال، صرف‌ها، واژگان، گروه‌ها و تغییرات به‌روزرسانی شدند ✨"
              : "Complete backup restored successfully! Reloading view..."
          );
          setTimeout(() => {
            window.location.reload();
          }, 1800);
        }
      } catch (err: any) {
        alert(locale === "fa" ? "خطا در خواندن فایل بکاپ: " + err.message : "Backup error: " + err.message);
        setBackupStatusMessage(null);
      } finally {
        setBackupImporting(false);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Read initial locale from localStorage or default to English
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem("g_verb_locale");
    if (saved === "fa" || saved === "de" || saved === "en") {
      return saved as Locale;
    }
    return "en";
  });

  useEffect(() => {
    localStorage.setItem("g_verb_locale", locale);
  }, [locale]);

  useEffect(() => {
    const env = dbService.getEnvironment();
    setDetectedEnv(env);
    loadTauriSettings();
  }, []);

  useEffect(() => {
    const loadPersistedDbName = async () => {
      try {
        const cachedFilename = await dbService.getSetting<string>("cached_base_json_filename");
        if (cachedFilename) {
          setPersistedDbName(cachedFilename);
        } else {
          const hasBase = await dbService.getSetting<string>("cached_base_json");
          if (hasBase) {
            setPersistedDbName(locale === "fa" ? "دیتابیس شخصی" : "Custom Database");
          } else {
            setPersistedDbName(null);
          }
        }
      } catch (e) {
        setPersistedDbName(null);
      }
    };
    loadPersistedDbName();
  }, [locale]);

  const loadChangeLogs = async () => {
    const logs = await dbService.getChangeLogs();
    setChangeLogs(logs);
    const vLogs = await dbService.getVocabChangeLogs();
    setVocabChangeLogs(vLogs);
  };

  useEffect(() => {
    if (activeTab === "history" || activeTab === "conjugator" || activeTab === "vocabulary") {
      loadChangeLogs();
    }
  }, [activeTab]);

  const handleUndo = async (logId: string) => {
    await dbService.undoChange(logId);
    await loadChangeLogs();
    setSaveStatus(t.undoSuccess || "Change successfully undone!");
    setTimeout(() => {
      setSaveStatus(null);
    }, 4000);
  };

  const handleUndoVocab = async (logId: string) => {
    await dbService.undoVocabChange(logId);
    await loadChangeLogs();
    setSaveStatus(locale === "fa" ? "تغییر واژه با موفقیت بازگردانی شد ✨" : "Vocabulary change undone ✨");
    setTimeout(() => {
      setSaveStatus(null);
    }, 4000);
  };

  const loadTauriSettings = async () => {
    const savedPath = await dbService.getSetting<string>("tauri_json_path");
    if (savedPath) {
      setTauriPath(savedPath);
    }
  };

  const handleDeleteDatabase = async () => {
    setDeleteStatus("deleting");
    setDeleteStep(1); // Deleting custom uploaded files

    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setDeleteStatus("resetting");
      setDeleteStep(2); // Restoring sample database

      // Call database service helper to reset
      await dbService.resetToDefaultDatabase();

      await new Promise((resolve) => setTimeout(resolve, 800));
      setDeleteStatus("success");
      setDeleteStep(3); // Completed

      setSaveStatus(locale === "fa" ? "دیتابیس نمونه با موفقیت بازیابی شد." : "Default sample database restored successfully.");

      // Start countdown to reload
      let countLeft = 3;
      setReloadCountdown(countLeft);
      const interval = setInterval(() => {
        countLeft -= 1;
        setReloadCountdown(countLeft);
        if (countLeft <= 0) {
          clearInterval(interval);
          window.location.reload();
        }
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setDeleteStatus("error");
      setDeleteStep(0);
      setDeleteError(err?.message || (locale === "fa" ? "خطا در حذف دیتابیس" : "Error deleting database"));
    }
  };

  const handleSaveTauriPath = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPath = tauriPath.trim();
    if (!targetPath) return;

    setTauriSaveStatus("checking");
    setTauriSaveStep(1); // Checking format/path

    await new Promise((resolve) => setTimeout(resolve, 600));

    // Try reading and validating database from the path
    const canRead = await dbService.tryReadDatabaseFromPath(targetPath);

    setTauriSaveStatus("saving");
    setTauriSaveStep(2); // Saving path to IndexedDB settings
    await new Promise((resolve) => setTimeout(resolve, 600));

    try {
      await dbService.saveSetting("tauri_json_path", targetPath);

      // Extract filename from path to show on the badge
      const segments = targetPath.split(/[/\\]/);
      const fileName = segments[segments.length - 1] || "Custom DB";
      await dbService.saveSetting("cached_base_json_filename", fileName);
      setPersistedDbName(fileName);

      setTauriSaveStatus("success");
      setTauriSaveStep(3); // Save completed

      if (canRead) {
        setSaveStatus(
          locale === "fa"
            ? "مسیر تائوری ذخیره شد و دیتابیس با موفقیت بارگذاری گردید! برنامه در حال بروزرسانی است..."
            : "Tauri path saved and database successfully loaded! Reloading app..."
        );
      } else {
        const isLocalAbsolute = /^[a-zA-Z]:[/\\]|^\/|^\\\\/.test(targetPath);
        if (isLocalAbsolute && !(window as any).__TAURI__) {
          setSaveStatus(
            locale === "fa"
              ? "مسیر با موفقیت ذخیره شد. توجه: مرورگر به دلایل امنیتی پیش‌نمایش امکان دسترسی به هارد شما را ندارد، اما در نسخه Tauri به درستی کار خواهد کرد."
              : "Path saved! Note: Browser preview cannot access your local hard drive due to sandbox restrictions, but it will load perfectly inside Tauri."
          );
        } else {
          setSaveStatus(
            locale === "fa"
              ? "مسیر ذخیره شد اما فایل در این آدرس یافت نشد یا قالب آن نامعتبر است."
              : "Path saved, but file was not found or has an invalid JSON format."
          );
        }
      }

      setTimeout(() => {
        window.location.reload();
      }, 4000);

    } catch (err) {
      console.error(err);
      setTauriSaveStatus("error");
      setTauriSaveStep(0);
    }
  };

  // Handler for chrome extension file upload to store in Dexie.js (IndexedDB)
  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isZip = file.name.toLowerCase().endsWith(".zip");

    setUploadedFileName(file.name);
    setUploadStatus("reading");
    setUploadStep(1); // Reading file
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = "";
        if (isZip) {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          const unzipped = unzipSync(uint8Array);
          
          // Find the first file that ends with .json
          const jsonFileName = Object.keys(unzipped).find((name) => name.toLowerCase().endsWith(".json"));
          if (!jsonFileName) {
            throw new Error(locale === "fa" ? "هیچ فایل json. درون فایل فشرده zip یافت نشد." : "No .json file found inside the uploaded zip archive.");
          }
          
          const dec = new TextDecoder("utf-8");
          text = dec.decode(unzipped[jsonFileName]);
        } else {
          text = event.target?.result as string;
        }

        // Step 1 delay to show reader progress
        await new Promise((resolve) => setTimeout(resolve, 800));
        setUploadStatus("parsing");
        setUploadStep(2); // Parsing and validating structure

        const parsed = JSON.parse(text);

        // Step 2 delay to show verification progress
        await new Promise((resolve) => setTimeout(resolve, 800));
        setUploadStatus("saving");
        setUploadStep(3); // Saving to IndexedDB

        const verbsCache = await dbService.loadDatabase(text);
        try {
          await dbService.saveSetting("cached_base_json_filename", file.name);
          setPersistedDbName(file.name);
        } catch (dbErr) {
          console.warn("Could not save filename to settings DB", dbErr);
        }
        const count = Object.keys(verbsCache).length;
        setImportedVerbsCount(count);

        // Step 3 delay to show persistence progress
        await new Promise((resolve) => setTimeout(resolve, 800));
        setUploadStatus("success");
        setUploadStep(4); // Fully completed

        setSaveStatus(t.uploadingStatusSuccess.replace("{count}", count.toString()));

        // Start countdown to reload and refresh view nicely
        let countLeft = 3;
        setReloadCountdown(countLeft);
        const interval = setInterval(() => {
          countLeft -= 1;
          setReloadCountdown(countLeft);
          if (countLeft <= 0) {
            clearInterval(interval);
            window.location.reload();
          }
        }, 1000);
      } catch (err: any) {
        console.error(err);
        setUploadStatus("error");
        setUploadStep(0);
        setUploadError(err?.message || t.uploadingStatusError);
      }
    };

    reader.onerror = () => {
      setUploadStatus("error");
      setUploadStep(0);
      setUploadError(t.uploadingStatusError);
    };

    if (isZip) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Download template JSON configuration
  const handleDownloadTemplate = () => {
    const sampleTemplate = {
      "sprechen": {
        "success": true,
        "data": {
          "PRASENS": {
            "S1": ["spreche"],
            "S2": ["sprichst"],
            "S3": ["spricht"],
            "P1": ["sprechen"],
            "P2": ["sprecht"],
            "P3": ["sprechen"]
          },
          "PERFEKT": {
            "S1": ["habe", "gesprochen"],
            "S2": ["hast", "gesprochen"],
            "S3": ["hat", "gesprochen"],
            "P1": ["haben", "gesprochen"],
            "P2": ["habt", "gesprochen"],
            "P3": ["haben", "gesprochen"]
          }
        }
      }
    };

    const blob = new Blob([JSON.stringify(sampleTemplate, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "German_DB_custom_blueprint.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Current translation dictionary
  const t = translations[locale];
  const isRtl = locale === "fa";

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-indigo-100 pb-16"
    >
      {/* Top Navbar with Hamburger Menu Toggle */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center min-h-[4rem] py-2 sm:py-3 gap-2 sm:gap-4">
            {/* Left Group (LTR Hamburger or Logo) */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* LTR Hamburger Button (English/German on Left) */}
              {!isRtl && (
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  aria-label={locale === "de" ? "Hauptmenü öffnen" : "Open Navigation Menu"}
                  className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl sm:rounded-2xl transition-colors cursor-pointer border border-slate-200 flex items-center gap-1.5 font-vazir text-xs font-bold shrink-0"
                >
                  <Menu className="w-5 h-5 text-slate-700" />
                  <span className="hidden sm:inline">{locale === "de" ? "Menü" : "Menu"}</span>
                </button>
              )}

              {/* Logo */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white p-2 sm:p-2.5 rounded-xl sm:rounded-2xl shadow-md shadow-indigo-100 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className={`min-w-0 ${isRtl ? "text-right" : "text-left"}`}>
                  <span className="text-[9px] sm:text-xs font-semibold text-indigo-600 uppercase tracking-wider block font-vazir truncate">
                    {t.subtitle}
                  </span>
                  <h1 className="text-xs sm:text-base md:text-xl font-extrabold text-slate-900 leading-tight font-vazir truncate">
                    {t.title}
                  </h1>
                </div>
              </div>
            </div>

            {/* Right Group (Language Picker, Env Badge, and RTL Hamburger on Right) */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Language Selector */}
              <div className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" />
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                  className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 border border-slate-200 bg-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold text-slate-700 shadow-3xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 font-vazir"
                >
                  <option value="fa">FA</option>
                  <option value="de">DE</option>
                  <option value="en">EN</option>
                </select>
              </div>

              {/* Environment Indicator badge */}
              <div className="hidden md:flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 font-vazir">
                  {detectedEnv === "tauri" && (
                    <>
                      <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                      {t.envTauri}
                    </>
                  )}
                  {detectedEnv === "chrome_extension" && (
                    <>
                      <Chrome className="w-3.5 h-3.5 text-amber-500" />
                      {t.envExtension}
                    </>
                  )}
                  {detectedEnv === "browser" && (
                    <>
                      <Globe className="w-3.5 h-3.5 text-emerald-500" />
                      {t.envBrowser}
                    </>
                  )}
                </div>
              </div>

              {/* RTL Hamburger Button (Persian on Right Side with same style) */}
              {isRtl && (
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  aria-label="منوی اصلی"
                  className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl sm:rounded-2xl transition-colors cursor-pointer border border-slate-200 flex items-center gap-1.5 font-vazir text-xs font-bold shrink-0"
                >
                  <Menu className="w-5 h-5 text-slate-700" />
                  <span className="hidden sm:inline">منو</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hamburger Side Drawer Navigation Overlay */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex no-print animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setIsDrawerOpen(false)}
          />

          <div
            className={`fixed top-0 bottom-0 w-80 sm:w-96 bg-white shadow-2xl z-10 flex flex-col justify-between p-6 overflow-y-auto animate-in duration-250 ${
              isRtl ? "right-0 text-right slide-in-from-right" : "left-0 text-left slide-in-from-left"
            }`}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="bg-indigo-600 text-white p-2 rounded-xl">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 font-vazir">
                    {locale === "fa" ? "منوی اصلی برنامه" : locale === "de" ? "Hauptnavigation" : "Main Navigation"}
                  </h3>
                </div>

                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Menu Accordion Sections */}
              <div className="space-y-4 font-vazir">
                {/* SECTION 1: VOCABULARY (واژه) */}
                <div className="bg-purple-50/50 border border-purple-100 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setVocabGroupOpen(!vocabGroupOpen)}
                    className="w-full p-3.5 flex items-center justify-between font-extrabold text-purple-900 text-sm hover:bg-purple-100/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-5 h-5 text-purple-600" />
                      <span>{locale === "fa" ? "بخش واژه (Wortschatz)" : locale === "de" ? "Bereich Wortschatz" : "Vocabulary Section"}</span>
                    </div>
                    {vocabGroupOpen ? <ChevronUp className="w-4 h-4 text-purple-600" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
                  </button>

                  {vocabGroupOpen && (
                    <div className="p-2 space-y-1 bg-white border-t border-purple-100 text-xs">
                      <button
                        onClick={() => {
                          setActiveTab("vocabulary");
                          setVocabSubTab("bank");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "vocabulary" && vocabSubTab === "bank"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-purple-50"
                        }`}
                      >
                        <BookMarked className="w-4 h-4" />
                        <span>{locale === "fa" ? "بانک واژگان و اصطلاحات" : locale === "de" ? "Wortschatz & Phrasen" : "Word Bank & Phrases"}</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab("vocabulary");
                          setVocabSubTab("synonym_antonym");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "vocabulary" && vocabSubTab === "synonym_antonym"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-purple-50"
                        }`}
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>{locale === "fa" ? "شبکه‌های واژگانی" : locale === "de" ? "Wortschatz-Netzwerke" : "Lexical Networks"}</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab("vocabulary");
                          setVocabSubTab("categories");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "vocabulary" && vocabSubTab === "categories"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-purple-50"
                        }`}
                      >
                        <Tag className="w-4 h-4" />
                        <span>{locale === "fa" ? "مدیریت دسته‌بندی‌ها و تگ‌ها" : locale === "de" ? "Kategorien & Tags" : "Category Tags"}</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab("history");
                          setHistorySection("vocab");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "history" && historySection === "vocab"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-purple-50"
                        }`}
                      >
                        <History className="w-4 h-4" />
                        <span>{locale === "fa" ? "تغییرات اخیر واژگان" : locale === "de" ? "Änderungsverlauf Wortschatz" : "Recent Vocabulary Changes"}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* SECTION 2: VERBS (فعل) */}
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setVerbGroupOpen(!verbGroupOpen)}
                    className="w-full p-3.5 flex items-center justify-between font-extrabold text-indigo-900 text-sm hover:bg-indigo-100/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-indigo-600" />
                      <span>{locale === "fa" ? "بخش فعل (Verben)" : locale === "de" ? "Bereich Verben" : "Verbs Section"}</span>
                    </div>
                    {verbGroupOpen ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
                  </button>

                  {verbGroupOpen && (
                    <div className="p-2 space-y-1 bg-white border-t border-indigo-100 text-xs">
                      <button
                        onClick={() => {
                          setActiveTab("conjugator");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "conjugator"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-indigo-50"
                        }`}
                      >
                        <Database className="w-4 h-4" />
                        <span>{locale === "fa" ? "مدیریت و صرف افعال" : locale === "de" ? "Verbkonjugation & Verwaltung" : "Verb Conjugation Manager"}</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab("history");
                          setHistorySection("verbs");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "history" && historySection === "verbs"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-indigo-50"
                        }`}
                      >
                        <History className="w-4 h-4" />
                        <span>{locale === "fa" ? "تغییرات اخیر افعال" : locale === "de" ? "Änderungsverlauf Verben" : "Recent Verb Changes"}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* SECTION 3: PRACTICE (بخش تمرینات) */}
                <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setPracticeGroupOpen(!practiceGroupOpen)}
                    className="w-full p-3.5 flex items-center justify-between font-extrabold text-amber-950 text-sm hover:bg-amber-100/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-amber-600" />
                      <span>{locale === "fa" ? "بخش تمرینات (Übungen)" : locale === "de" ? "Bereich Übungen" : "Practice Section"}</span>
                    </div>
                    {practiceGroupOpen ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
                  </button>

                  {practiceGroupOpen && (
                    <div className="p-2 space-y-1 bg-white border-t border-amber-100 text-xs">
                      <button
                        onClick={() => {
                          setActiveTab("practice");
                          setPracticeSubTab("story");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "practice" && practiceSubTab === "story"
                            ? "bg-amber-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-amber-50"
                        }`}
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{locale === "fa" ? "داستان خوانی" : locale === "de" ? "Geschichten lesen" : "Story Reading"}</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab("practice");
                          setPracticeSubTab("saved_stories");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "practice" && practiceSubTab === "saved_stories"
                            ? "bg-amber-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-amber-50"
                        }`}
                      >
                        <Bookmark className="w-4 h-4" />
                        <span>{locale === "fa" ? "داستان‌های ذخیره شده" : locale === "de" ? "Gespeicherte Geschichten" : "Saved Stories"}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* SECTION 4: SETTINGS (مجموعه تنظیمات) */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setSettingsGroupOpen(!settingsGroupOpen)}
                    className="w-full p-3.5 flex items-center justify-between font-extrabold text-slate-800 text-sm hover:bg-slate-100/70 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-indigo-600" />
                      <span>{locale === "fa" ? "تنظیمات (Settings)" : locale === "de" ? "Einstellungen" : "Settings"}</span>
                    </div>
                    {settingsGroupOpen ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {settingsGroupOpen && (
                    <div className="p-2 space-y-1 bg-white border-t border-slate-200 text-xs">
                      <button
                        onClick={() => {
                          setActiveTab("settings");
                          setSettingsSubTab("verb_db");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "settings" && settingsSubTab === "verb_db"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Database className="w-4 h-4 text-indigo-600" />
                        <span>{locale === "fa" ? "تنظیمات دیتابیس افعال" : locale === "de" ? "Datenbank-Einstellungen" : "Verb Database Settings"}</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab("settings");
                          setSettingsSubTab("api_key");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "settings" && settingsSubTab === "api_key"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <KeyRound className="w-4 h-4 text-amber-500" />
                        <span>{locale === "fa" ? "تنظیمات API KEY" : "API Key Settings"}</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab("settings");
                          setSettingsSubTab("language");
                          setIsDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl ${isRtl ? "text-right" : "text-left"} font-bold transition-all flex items-center gap-2.5 cursor-pointer ${
                          activeTab === "settings" && settingsSubTab === "language"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Languages className="w-4 h-4 text-emerald-600" />
                        <span>{locale === "fa" ? "زبان برنامه" : locale === "de" ? "Sprache der App" : "App Language"}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* SECTION 5: BACKUP & RESTORE DATA (پشتیبان‌گیری و بازیابی) */}
                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl overflow-hidden p-1 shadow-2xs">
                  <button
                    onClick={() => {
                      setShowGlobalBackupModal(true);
                      setIsDrawerOpen(false);
                    }}
                    className="w-full p-3 flex items-center justify-between font-extrabold text-emerald-950 text-xs sm:text-sm hover:bg-emerald-100/60 rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{locale === "fa" ? "پشتیبان‌گیری و بازیابی جامع (Backup)" : locale === "de" ? "Sicherung & Wiederherstellung" : "Global Backup & Restore"}</span>
                    </div>
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 font-vazir space-y-1">
              <p className="font-bold text-slate-700">دیتابیس آنلاین مرجع افعال و واژگان</p>
              <p>زبان: {locale === "fa" ? "فارسی" : locale === "de" ? "آلمانی" : "انگلیسی"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Database Fallback Warning Banner */}
      {dbService.isFallbackActive() && (
        <div className="bg-amber-50 border-b border-amber-200/60 text-amber-900 py-3.5 px-4 sm:px-6 lg:px-8 no-print">
          <div className={`max-w-7xl mx-auto flex items-start gap-3 text-xs leading-relaxed ${isRtl ? "text-right font-vazir" : "text-left"}`}>
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              {locale === "fa" ? (
                <span>
                  <strong>برنامه در حالت حافظه موقت اجرا می‌شود:</strong> مرورگر شما به دلیل محدودیت‌های امنیتی فایل‌های محلی (پروتکل <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">file://</code>)، اجازه دسترسی به دیتابیس بومی مرورگر را نمی‌دهد. تغییرات، ویرایش‌ها و شخصی‌سازی‌های شما کاملاً کار خواهند کرد اما فقط تا زمانی که این صفحه را نبسته‌اید ذخیره خواهند ماند. برای حل دائمی این موضوع و باز شدن خودکار دیتابیس، لطفاً فایل را از روی دسکتاپ به یک مرورگر مدرن بکشید یا آن را در محیط وب آنلاین اجرا کنید.
                </span>
              ) : locale === "de" ? (
                <span>
                  <strong>In-Memory Modus aktiv:</strong> Ihr Browser blockiert die lokale Datenbank (IndexedDB) aufgrund von Sicherheitsbeschränkungen für lokale Dateien (Protokoll <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">file://</code>). Ihre Änderungen funktionieren einwandfrei, bleiben jedoch nur während dieser Sitzung erhalten. Um die Datenbank vollständig zu aktivieren, führen Sie die Anwendung über einen lokalen Webserver aus oder öffnen Sie sie in einem modernen Browser online.
                </span>
              ) : (
                <span>
                  <strong>In-Memory Mode Active:</strong> Your browser has blocked access to the local IndexedDB due to security restrictions on local files (running on the <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">file://</code> protocol). All features and edits will work perfectly, but they will only persist for this current session. To enable persistent local storage, run the app using a local web server or use the online web version.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hero Header Area with Quick Bar */}
      <div className="bg-gradient-to-b from-white to-slate-50/50 border-b border-slate-200/60 py-6 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className={`space-y-1 ${isRtl ? "text-right" : "text-left"}`}>
            <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold text-slate-950 tracking-tight font-vazir">
              {activeTab === "vocabulary"
                ? (locale === "fa" ? "بخش واژگان" : locale === "de" ? "Wortschatz-Bereich" : "Vocabulary Section")
                : activeTab === "practice"
                ? (locale === "fa" ? "بخش تمرینات: داستان‌خوانی" : locale === "de" ? "Übungen: Geschichten" : "Practice: German Stories")
                : activeTab === "settings"
                ? (locale === "fa" ? "تنظیمات برنامه" : locale === "de" ? "Einstellungen" : "Settings")
                : t.heroTitle}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm max-w-xl leading-relaxed font-vazir">
              {activeTab === "vocabulary"
                ? (locale === "fa" ? "در این بخش می‌توانید کلمات جدید اضافه کنید، تگ بسازید، فایل‌های JSON وارد کنید یا گروه مترادف‌ها/متضادها را مدیریت کنید." : "Manage words, articles, examples, categories and bulk JSON imports.")
                : activeTab === "practice"
                ? (locale === "fa" ? "با انتخاب افعال و واژگان موجود در دیتابیس (دستی یا تصادفی)، داستان‌های اصیل آلمانی تولید کنید و مهارت‌های زبانی خود را تقویت نمایید." : "Generate immersive German stories with your target verbs and vocabulary.")
                : activeTab === "settings"
                ? (locale === "fa" ? "پیکربندی دیتابیس افعال، کلیدهای اختصاصی هوش مصنوعی (API KEY) و زبان رابط کاربری." : "Configure verb database, custom Gemini API keys, and app language.")
                : t.heroDesc}
            </p>
          </div>

          {/* Quick Navigation Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 self-start md:self-auto shadow-2xs font-vazir text-xs font-bold">
            <button
              onClick={() => { setActiveTab("conjugator"); setVocabSubTab("bank"); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === "conjugator"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>{locale === "fa" ? "بخش فعل" : "Verbs"}</span>
            </button>

            <button
              onClick={() => { setActiveTab("vocabulary"); setVocabSubTab("bank"); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === "vocabulary"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" />
              <span>{locale === "fa" ? "بخش واژه" : "Vocabulary"}</span>
            </button>

            <button
              onClick={() => { setActiveTab("practice"); setPracticeSubTab("story"); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === "practice"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{locale === "fa" ? "بخش تمرینات" : "Practice"}</span>
            </button>

            <button
              onClick={() => { setActiveTab("settings"); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                activeTab === "settings"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{locale === "fa" ? "تنظیمات" : "Settings"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {saveStatus && (
          <div className={`mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center gap-2.5 shadow-3xs no-print ${isRtl ? "text-right" : "text-left"}`}>
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="font-semibold font-vazir">{saveStatus}</span>
          </div>
        )}

        {activeTab === "conjugator" && (
          <div className="space-y-6">
            <VerbTable locale={locale} t={t} />
          </div>
        )}

        {activeTab === "vocabulary" && (
          <div key={vocabSubTab} className="space-y-6">
            <VocabularyManager locale={locale} defaultSubTab={vocabSubTab} />
          </div>
        )}

        {activeTab === "practice" && (
          <div key={practiceSubTab} className="space-y-6">
            <StoryPractice
              locale={locale}
              isRtl={isRtl}
              initialSubTab={practiceSubTab === "saved_stories" ? "saved" : "generate"}
            />
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-6 max-w-4xl mx-auto px-1 sm:px-0 font-vazir">
            <div className={`bg-white border border-slate-200/80 p-4 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm space-y-6 ${isRtl ? "text-right" : "text-left"}`}>
              {/* Header & Section Selector Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                  <History className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-xl font-extrabold text-slate-900 font-vazir">
                      {locale === "fa" ? "تاریخچه تغییرات و بازگردانی" : t.historyTitle}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-vazir">
                      {locale === "fa" ? "مشاهده تغییرات و بازگردانی آخرین عملیات انجام شده" : t.historyDesc}
                    </p>
                  </div>
                </div>

                {/* Sub-tabs: Verbs vs Vocab */}
                <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200 shrink-0 self-start sm:self-auto">
                  <button
                    onClick={() => setHistorySection("verbs")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      historySection === "verbs" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>{locale === "fa" ? "تغییرات افعال" : "Verbs History"}</span>
                    {changeLogs.length > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] bg-indigo-500/30 rounded-full">
                        {changeLogs.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setHistorySection("vocab")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      historySection === "vocab" ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <BookMarked className="w-3.5 h-3.5" />
                    <span>{locale === "fa" ? "تغییرات واژگان" : "Vocabulary History"}</span>
                    {vocabChangeLogs.length > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] bg-purple-500/30 rounded-full">
                        {vocabChangeLogs.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* VERBS HISTORY */}
              {historySection === "verbs" && (
                <div>
                  {changeLogs.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-14 h-14 bg-indigo-50 text-indigo-400 rounded-full flex items-center justify-center border border-indigo-100">
                        <History className="w-7 h-7" />
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 font-vazir max-w-md">
                        {locale === "fa" ? "هیچ تغییر اخیری برای افعال ثبت نشده است." : t.noHistory}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {changeLogs.map((log) => {
                        let borderClass = "border-slate-200";
                        let bgIconClass = "bg-slate-50 text-slate-500";
                        
                        if (log.type === "verb_add") {
                          borderClass = "border-emerald-200";
                          bgIconClass = "bg-emerald-50 text-emerald-600 border-emerald-100";
                        } else if (log.type === "verb_delete") {
                          borderClass = "border-rose-200";
                          bgIconClass = "bg-rose-50 text-rose-600 border-rose-100";
                        } else if (log.type === "cell_edit") {
                          borderClass = "border-sky-200";
                          bgIconClass = "bg-sky-50 text-sky-600 border-sky-100";
                        } else if (log.type === "category_toggle") {
                          borderClass = "border-indigo-200";
                          bgIconClass = "bg-indigo-50 text-indigo-600 border-indigo-100";
                        } else if (log.type === "field_edit") {
                          borderClass = "border-amber-200";
                          bgIconClass = "bg-amber-50 text-amber-600 border-amber-100";
                        }

                        const displayDesc = locale === "fa" ? log.descFa : locale === "de" ? log.descDe : log.descEn;
                        const dateFormatted = new Date(log.timestamp).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false
                        });

                        return (
                          <div
                            key={log.id}
                            className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3.5 sm:p-4 bg-slate-50/50 hover:bg-slate-50 border ${borderClass} rounded-xl sm:rounded-2xl transition-all duration-200`}
                          >
                            <div className="flex items-start sm:items-center gap-3 w-full min-w-0">
                              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center border font-semibold ${bgIconClass} shrink-0 shadow-3xs mt-0.5 sm:mt-0`}>
                                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs sm:text-sm font-semibold text-slate-800 font-vazir break-words whitespace-normal leading-normal">
                                  {displayDesc}
                                </p>
                                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono block mt-0.5">
                                  {dateFormatted}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleUndo(log.id)}
                              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-indigo-50 text-indigo-700 hover:text-indigo-900 border border-indigo-200 rounded-lg sm:rounded-xl text-xs font-bold shadow-3xs transition-all active:scale-95 shrink-0 cursor-pointer font-vazir"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{t.undoBtn}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* VOCABULARY HISTORY */}
              {historySection === "vocab" && (
                <div>
                  {vocabChangeLogs.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-14 h-14 bg-purple-50 text-purple-400 rounded-full flex items-center justify-center border border-purple-100">
                        <History className="w-7 h-7" />
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 font-vazir max-w-md">
                        {locale === "fa" ? "هیچ تغییر اخیری برای واژگان ثبت نشده است." : "No recent vocabulary changes."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {vocabChangeLogs.map((log) => {
                        let borderClass = "border-slate-200";
                        let bgIconClass = "bg-slate-50 text-slate-500";
                        
                        if (log.type === "vocab_add") {
                          borderClass = "border-emerald-200";
                          bgIconClass = "bg-emerald-50 text-emerald-600 border-emerald-100";
                        } else if (log.type === "vocab_delete") {
                          borderClass = "border-rose-200";
                          bgIconClass = "bg-rose-50 text-rose-600 border-rose-100";
                        } else if (log.type === "vocab_edit") {
                          borderClass = "border-purple-200";
                          bgIconClass = "bg-purple-50 text-purple-600 border-purple-100";
                        }

                        const displayDesc = locale === "fa" ? log.descFa : locale === "de" ? log.descDe : log.descEn;
                        const dateFormatted = new Date(log.timestamp).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false
                        });

                        return (
                          <div
                            key={log.id}
                            className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3.5 sm:p-4 bg-slate-50/50 hover:bg-slate-50 border ${borderClass} rounded-xl sm:rounded-2xl transition-all duration-200`}
                          >
                            <div className="flex items-start sm:items-center gap-3 w-full min-w-0">
                              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center border font-semibold ${bgIconClass} shrink-0 shadow-3xs mt-0.5 sm:mt-0`}>
                                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs sm:text-sm font-semibold text-slate-800 font-vazir break-words whitespace-normal leading-normal">
                                  {displayDesc}
                                </p>
                                <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono block mt-0.5">
                                  {dateFormatted}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleUndoVocab(log.id)}
                              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-purple-50 text-purple-700 hover:text-purple-900 border border-purple-200 rounded-lg sm:rounded-xl text-xs font-bold shadow-3xs transition-all active:scale-95 shrink-0 cursor-pointer font-vazir"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                              <span>{locale === "fa" ? "بازگردانی" : "Undo"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Settings Sub-Tab Navigation Header */}
            <div className={`bg-white border border-slate-200/90 p-4 rounded-2xl sm:rounded-3xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 font-vazir ${isRtl ? "text-right" : "text-left"}`}>
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {locale === "fa" ? "تنظیمات برنامه" : locale === "de" ? "App-Einstellungen" : "Application Settings"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {settingsSubTab === "verb_db"
                      ? (locale === "fa" ? "پیکربندی مسیر تائوری، ایمپورت فایل‌های JSON/ZIP، دانلود الگو و حذف دیتابیس شخصی" : "Configure Tauri path, custom JSON upload, and database reset")
                      : settingsSubTab === "api_key"
                      ? (locale === "fa" ? "افزودن و مدیریت کلیدهای اختصاصی Gemini، وضعیت اتصال، کنترل فعال/غیرفعال و مصرف توکن" : "Manage custom Gemini API keys, connection status, and token usage")
                      : (locale === "fa" ? "تغییر زبان رابط کاربری، متون و جهت چیدمان صفحه" : "Change application language and layout direction")}
                  </p>
                </div>
              </div>

              {/* Subtabs Switcher */}
              <div className="flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 w-full sm:w-auto text-xs font-bold shrink-0">
                <button
                  onClick={() => setSettingsSubTab("verb_db")}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                    settingsSubTab === "verb_db"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{locale === "fa" ? "دیتابیس افعال" : "Verb DB"}</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab("api_key")}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                    settingsSubTab === "api_key"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{locale === "fa" ? "تنظیمات API KEY" : "API Keys"}</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab("language")}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                    settingsSubTab === "language"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>{locale === "fa" ? "زبان برنامه" : "Language"}</span>
                </button>
              </div>
            </div>

            {/* Sub-tab Views */}
            {settingsSubTab === "verb_db" && (
              <VerbDbSettings
                locale={locale}
                isRtl={isRtl}
                t={t}
                tauriPath={tauriPath}
                setTauriPath={setTauriPath}
                handleSaveTauriPath={handleSaveTauriPath}
                tauriSaveStatus={tauriSaveStatus}
                tauriSaveStep={tauriSaveStep}
                deleteStatus={deleteStatus}
                deleteStep={deleteStep}
                deleteError={deleteError}
                setDeleteStatus={setDeleteStatus}
                setDeleteStep={setDeleteStep}
                uploadStatus={uploadStatus}
                uploadStep={uploadStep}
                uploadError={uploadError}
                setUploadStatus={setUploadStatus}
                setUploadStep={setUploadStep}
                uploadedFileName={uploadedFileName}
                setUploadedFileName={setUploadedFileName}
                importedVerbsCount={importedVerbsCount}
                reloadCountdown={reloadCountdown}
                persistedDbName={persistedDbName}
                showDeleteConfirm={showDeleteConfirm}
                setShowDeleteConfirm={setShowDeleteConfirm}
                handleJsonUpload={handleJsonUpload}
                handleDeleteDatabase={handleDeleteDatabase}
                handleDownloadTemplate={handleDownloadTemplate}
              />
            )}

            {settingsSubTab === "api_key" && (
              <ApiKeySettings locale={locale} isRtl={isRtl} />
            )}

            {settingsSubTab === "language" && (
              <LanguageSettings locale={locale} setLocale={setLocale} isRtl={isRtl} />
            )}
          </div>
        )}


      </main>

      {/* Global Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`fixed bottom-6 ${
            isRtl ? "left-6" : "right-6"
          } z-50 p-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-indigo-200/50 hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer border border-indigo-500/30 no-print flex items-center justify-center`}
          title={locale === "fa" ? "برگشت به بالا" : locale === "de" ? "Nach oben" : "Scroll to top"}
        >
          <ArrowUp className="w-5 h-5 animate-pulse" />
        </button>
      )}

      {/* Global Backup & Restore Modal */}
      {showGlobalBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden p-6 space-y-6 font-vazir no-print">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {locale === "fa" ? "پشتیبان‌گیری و بازیابی کامل داده‌ها" : "Full Database Backup & Restore"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {locale === "fa" ? "دانلود خروجی جامع JSON یا وارد کردن اطلاعات روی دستگاه جدید" : "Export or import complete JSON data"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowGlobalBackupModal(false);
                  setBackupStatusMessage(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-slate-600">
              <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl space-y-1">
                <p className="font-bold text-slate-800">این خروجی شامل چه اطلاعاتی است؟</p>
                <p>• تمام افعال همراه با تمامی زمان‌ها و صرف کامل صیغه‌ها</p>
                <p>• تمامی واژگان، اصطلاحات، معانی، آرتیکل‌ها و مثال‌های نمونه</p>
                <p>• {locale === "fa" 
                  ? "دسته‌بندی‌ها، تگ‌ها و کلیه گروه‌های شبکه‌های معنایی (مترادف‌ها، متضادها، هم‌خانواده‌ها، میدان معنایی و اصطلاحات)" 
                  : locale === "de"
                  ? "Kategorien, Tags und alle Wortschatz-Netzwerke (Synonyme, Antonyme, Wortfamilien, Wortfelder und Redewendungen)"
                  : "Categories, tags, and all lexical network groups (Synonyms, Antonyms, Word Families, Semantic Fields, and Idioms)"}</p>
                <p>• ترتیب سفارشی، تنظیمات شخصی‌سازی و تاریخچه کامل تغییرات</p>
              </div>

              {backupStatusMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold rounded-2xl text-center animate-fadeIn">
                  {backupStatusMessage}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {/* Export Button */}
                <button
                  onClick={handleExportFullBackup}
                  disabled={backupExporting}
                  className="p-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md transition-all flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-6 h-6" />
                  <span>{backupExporting ? (locale === "fa" ? "در حال تولید بکاپ..." : "Exporting...") : (locale === "fa" ? "دانلود بکاپ کامل (JSON)" : "Export Full Backup")}</span>
                </button>

                {/* Import Button / File Input */}
                <label className="p-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl shadow-md transition-all flex flex-col items-center justify-center gap-2 cursor-pointer relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportFullBackupFile}
                    disabled={backupImporting}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="w-6 h-6 text-emerald-400" />
                  <span>{backupImporting ? (locale === "fa" ? "در حال بازخوانی..." : "Importing...") : (locale === "fa" ? "بازیابی بکاپ در دستگاه" : "Restore Backup File")}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
