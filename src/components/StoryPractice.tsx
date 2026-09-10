import React, { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
  Sparkles,
  RefreshCw,
  Trash2,
  Bookmark,
  BookmarkCheck,
  Search,
  Shuffle,
  SlidersHorizontal,
  Layers,
  FileText,
  Check,
  Copy,
  Eye,
  EyeOff,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
  BookMarked,
  Database,
  GraduationCap
} from "lucide-react";
import type { VerbItem, VocabularyItem, SavedStory, CefrLevel } from "../types";
import { dbService } from "../DatabaseService";
import { geminiFetch } from "../services/apiKeyService";

interface StoryPracticeProps {
  locale: "fa" | "de" | "en";
  isRtl: boolean;
  verbs?: VerbItem[];
  vocabularies?: VocabularyItem[];
  initialSubTab?: "generate" | "saved";
}

interface SelectableItem {
  id: string;
  word: string;
  type: "verb" | "vocab";
  typeLabel: string;
  article?: string;
  meaning: string;
}

// Universal clipboard copy helper with fallback for iframes
async function copyTextToClipboard(text: string): Promise<boolean> {
  // 1. Try modern async clipboard API
  if (navigator?.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard.writeText failed in iframe, attempting textarea fallback:", err);
    }
  }

  // 2. Reliable fallback using hidden textarea execCommand
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("All copy attempts failed:", err);
    return false;
  }
}

export const StoryPractice: React.FC<StoryPracticeProps> = ({
  locale,
  isRtl,
  verbs = [],
  vocabularies = [],
  initialSubTab = "generate"
}) => {
  // Navigation inside Practice
  const [activeSubTab, setActiveSubTab] = useState<"generate" | "saved">(initialSubTab);

  // Local fallback verbs & vocabularies if parent doesn't provide them
  const [dbVerbs, setDbVerbs] = useState<VerbItem[]>(verbs);
  const [dbVocabs, setDbVocabs] = useState<VocabularyItem[]>(vocabularies);

  useEffect(() => {
    const fetchDbData = async () => {
      try {
        if (verbs.length === 0) {
          const v = await dbService.getAllVerbs();
          setDbVerbs(v || []);
        } else {
          setDbVerbs(verbs);
        }
        if (vocabularies.length === 0) {
          const voc = await dbService.getVocabularies();
          setDbVocabs(voc || []);
        } else {
          setDbVocabs(vocabularies);
        }
      } catch (e) {
        console.error("Error loading verbs/vocab for story practice:", e);
      }
    };
    fetchDbData();
  }, [verbs, vocabularies]);

  // Sync initialSubTab when parent changes it
  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  // Mode: "manual" (1-80) vs "random" (20-80)
  const [selectionMode, setSelectionMode] = useState<"manual" | "random">("manual");
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>("none");

  // Manual Selection state
  const [manualSearch, setManualSearch] = useState("");
  const [manualFilterType, setManualFilterType] = useState<"all" | "verb" | "vocab">("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Random Selection state
  const [randomCount, setRandomCount] = useState<number>(30); // 20 to 80
  const [randomSourceType, setRandomSourceType] = useState<"all" | "verb" | "vocab">("all");
  const [generatedRandomItems, setGeneratedRandomItems] = useState<SelectableItem[]>([]);

  // Story generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [currentStory, setCurrentStory] = useState<{
    id?: string;
    title: string;
    storyGerman: string;
    storyPersian?: string;
    targetItems: string[];
    usedTargetItems: string[];
    totalWordCount: number;
    cefrLevel: CefrLevel;
    selectionMode: "manual" | "random";
    isSaved?: boolean;
  } | null>(null);

  // UI Story Display States
  const [showPersianTranslation, setShowPersianTranslation] = useState(true);
  const [copiedStory, setCopiedStory] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Saved Stories List
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [savedStoriesLoading, setSavedStoriesLoading] = useState(false);
  const [savedSearch, setSavedSearch] = useState("");
  const [savedLevelFilter, setSavedLevelFilter] = useState<CefrLevel | "all">("all");
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(new Set());
  const [storyModalItem, setStoryModalItem] = useState<SavedStory | null>(null);

  // Modal confirmation states for safe deletion in sandboxed iframe
  const [pendingDeleteStory, setPendingDeleteStory] = useState<{ id: string; title: string } | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [pendingClearCurrent, setPendingClearCurrent] = useState(false);

  // Combine verbs and vocabularies into indexed selectable items
  const allSelectableItems = useMemo<SelectableItem[]>(() => {
    const list: SelectableItem[] = [];

    // Verbs
    for (const v of dbVerbs) {
      if (!v.infinitive) continue;
      list.push({
        id: `verb_${v.infinitive.toLowerCase().trim()}`,
        word: v.infinitive.trim(),
        type: "verb",
        typeLabel: locale === "fa" ? "فعل" : locale === "de" ? "Verb" : "Verb",
        meaning: v.bedeutung || ""
      });
    }

    // Vocabulary
    for (const voc of dbVocabs) {
      if (!voc.word) continue;
      list.push({
        id: `vocab_${voc.id || voc.word.toLowerCase().trim()}`,
        word: voc.word.trim(),
        type: "vocab",
        typeLabel: locale === "fa" ? "واژه" : locale === "de" ? "Wort" : "Word",
        article: voc.article && voc.article !== "none" ? voc.article : undefined,
        meaning: voc.meaning || ""
      });
    }

    return list;
  }, [dbVerbs, dbVocabs, locale]);

  // Filtered list for manual selection
  const filteredManualItems = useMemo(() => {
    const q = manualSearch.toLowerCase().trim();
    return allSelectableItems.filter((item) => {
      if (manualFilterType === "verb" && item.type !== "verb") return false;
      if (manualFilterType === "vocab" && item.type !== "vocab") return false;
      if (!q) return true;
      return (
        item.word.toLowerCase().includes(q) ||
        (item.meaning && item.meaning.toLowerCase().includes(q))
      );
    });
  }, [allSelectableItems, manualSearch, manualFilterType]);

  // Load Saved Stories
  const loadSavedStories = async () => {
    setSavedStoriesLoading(true);
    try {
      const list = await dbService.getSavedStories();
      setSavedStories(list);
    } catch (e) {
      console.error("Failed to load saved stories:", e);
    } finally {
      setSavedStoriesLoading(false);
    }
  };

  useEffect(() => {
    loadSavedStories();

    const handleDataChanged = () => {
      loadSavedStories();
    };
    window.addEventListener("saved-stories-changed", handleDataChanged);
    return () => window.removeEventListener("saved-stories-changed", handleDataChanged);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Toggle item selection in manual mode
  const handleToggleSelectItem = (id: string) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= 80) {
        showToast(
          locale === "fa"
            ? "حداکثر سقف انتخاب واژه‌ها در حالت دستی ۸۰ مورد است."
            : "Maximum 80 items can be selected manually."
        );
        return;
      }
      next.add(id);
    }
    setSelectedItemIds(next);
  };

  // Select all in current manual filtered view (up to limit of 80)
  const handleSelectAllFiltered = () => {
    const next = new Set(selectedItemIds);
    for (const item of filteredManualItems) {
      if (next.size >= 80) break;
      next.add(item.id);
    }
    setSelectedItemIds(next);
  };

  // Clear manual selections
  const handleClearSelections = () => {
    setSelectedItemIds(new Set());
  };

  // Pick random items with strict 4:10 verb-to-vocab ratio (40% verbs, 60% regular words)
  const pickRandomWithRatio = (count: number): { picked: SelectableItem[]; verbCount: number; vocabCount: number } => {
    const targetCount = Math.min(Math.max(20, count), 80);
    const verbPool = allSelectableItems.filter((i) => i.type === "verb");
    const vocabPool = allSelectableItems.filter((i) => i.type === "vocab");

    if (randomSourceType === "verb") {
      const shuffled = [...verbPool].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, Math.min(targetCount, verbPool.length));
      return { picked, verbCount: picked.length, vocabCount: 0 };
    }

    if (randomSourceType === "vocab") {
      const shuffled = [...vocabPool].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, Math.min(targetCount, vocabPool.length));
      return { picked, verbCount: 0, vocabCount: picked.length };
    }

    // Default "all": 4 verbs out of 10 items (40% verbs, 60% non-verbs / vocabulary)
    let desiredVerbs = Math.round(targetCount * 0.4);
    let desiredVocab = targetCount - desiredVerbs;

    // Adjust if one of the pools has fewer items
    if (verbPool.length < desiredVerbs) {
      desiredVerbs = verbPool.length;
      desiredVocab = Math.min(vocabPool.length, targetCount - desiredVerbs);
    } else if (vocabPool.length < desiredVocab) {
      desiredVocab = vocabPool.length;
      desiredVerbs = Math.min(verbPool.length, targetCount - desiredVocab);
    }

    const shuffledVerbs = [...verbPool].sort(() => Math.random() - 0.5).slice(0, desiredVerbs);
    const shuffledVocabs = [...vocabPool].sort(() => Math.random() - 0.5).slice(0, desiredVocab);

    // Shuffle together so verbs and vocabulary are distributed
    const combined = [...shuffledVerbs, ...shuffledVocabs].sort(() => Math.random() - 0.5);
    return { picked: combined, verbCount: shuffledVerbs.length, vocabCount: shuffledVocabs.length };
  };

  // Generate random items from existing database
  const handlePickRandomItems = () => {
    if (allSelectableItems.length === 0) {
      showToast(
        locale === "fa"
          ? "آیتمی در دیتابیس برای انتخاب تصادفی یافت نشد."
          : "No items found in database for random selection."
      );
      return;
    }

    const { picked, verbCount, vocabCount } = pickRandomWithRatio(randomCount);
    setGeneratedRandomItems(picked);
    showToast(
      locale === "fa"
        ? `تعداد ${picked.length} آیتم تصادفی (${verbCount} فعل و ${vocabCount} واژه - نسبت ۴ به ۱۰) انتخاب شدند ✨`
        : `${picked.length} random items picked (${verbCount} verbs, ${vocabCount} vocab) ✨`
    );
  };

  // Compute active target items based on mode
  const currentTargetItems: SelectableItem[] = useMemo(() => {
    if (selectionMode === "manual") {
      return allSelectableItems.filter((i) => selectedItemIds.has(i.id));
    } else {
      return generatedRandomItems;
    }
  }, [selectionMode, allSelectableItems, selectedItemIds, generatedRandomItems]);

  // Calculate proportional expected story length (strictly 300 to 600 words)
  const expectedStoryWordCount = useMemo(() => {
    const count = currentTargetItems.length;
    if (count === 0) return 300;
    return Math.min(600, Math.max(300, Math.round(300 + ((count - 1) / 79) * 300)));
  }, [currentTargetItems]);

  // Trigger AI Story Generation
  const handleGenerateStory = async () => {
    let itemsForStory: SelectableItem[] = [];

    if (selectionMode === "manual") {
      if (currentTargetItems.length < 1) {
        showToast(
          locale === "fa"
            ? "لطفاً حداقل ۱ واژه یا فعل را انتخاب نمایید (بین ۱ تا ۸۰ مورد)."
            : "Please select at least 1 item (1 to 80 items)."
        );
        return;
      }
      if (currentTargetItems.length > 80) {
        showToast(locale === "fa" ? "حداکثر سقف مجاز ۸۰ واژه است." : "Maximum 80 items allowed.");
        return;
      }
      itemsForStory = currentTargetItems;
    } else {
      if (generatedRandomItems.length < 20) {
        // Automatically roll with strict 4:10 ratio
        const { picked } = pickRandomWithRatio(randomCount);
        if (picked.length < 20) {
          showToast(
            locale === "fa"
              ? `برای انتخاب تصادفی حداقل ۲۰ واژه در دیتابیس نیاز است (دیتابیس فعلی: ${allSelectableItems.length} واژه).`
              : "At least 20 items needed in database for random selection."
          );
          return;
        }
        setGeneratedRandomItems(picked);
        itemsForStory = picked;
      } else {
        itemsForStory = generatedRandomItems;
      }
    }

    const itemsToSubmit = itemsForStory.map((i) => i.word);

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const res = await geminiFetch("/api/gemini/story-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetItems: itemsToSubmit,
          selectionMode,
          cefrLevel
        })
      });

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.userMessage || json.error || "خطا در تولید داستان با هوش مصنوعی");
      }

      const data = json.data;
      const actualWordCount =
        data.totalWordCount ||
        (data.storyGerman ? data.storyGerman.replace(/\*\*/g, "").trim().split(/\s+/).filter(Boolean).length : 350);

      // Verify all target items against story text
      const cleanGermanText = (data.storyGerman || "").toLowerCase();
      const usedSet = new Set<string>(
        Array.isArray(data.usedTargetItems) ? data.usedTargetItems : []
      );
      for (const item of itemsToSubmit) {
        const clean = item.replace(/^(der|die|das|ein|eine)\s+/i, "").trim().toLowerCase();
        if (cleanGermanText.includes(clean)) {
          usedSet.add(item);
        }
      }
      const verifiedUsed = Array.from(usedSet);

      // Extract accurate assessed CEFR level
      const assessedCefr: CefrLevel =
        (data.cefrLevel && data.cefrLevel !== "none" ? data.cefrLevel : null) ||
        (cefrLevel !== "none" ? cefrLevel : "B1");

      const newStoryState = {
        title: data.title || "Eine deutsche Geschichte",
        storyGerman: data.storyGerman,
        storyPersian: data.storyPersian,
        targetItems: itemsToSubmit,
        usedTargetItems: verifiedUsed.length > 0 ? verifiedUsed : itemsToSubmit,
        totalWordCount: actualWordCount,
        cefrLevel: assessedCefr,
        selectionMode: selectionMode,
        isSaved: false
      };

      setCurrentStory(newStoryState);
      showToast(
        locale === "fa"
          ? `داستان لایه‌بندی شده با سطح زبانی ${assessedCefr} خلق شد ✨`
          : `Story generated with CEFR level ${assessedCefr} ✨`
      );
    } catch (err: any) {
      console.error("Story generation failed:", err);
      setGenerateError(err.message || "خطا در تولید داستان");
    } finally {
      setIsGenerating(false);
    }
  };

  // Save Current Story
  const handleSaveCurrentStory = async () => {
    if (!currentStory) return;

    const newSavedStory: SavedStory = {
      id: "story_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      title: currentStory.title,
      storyGerman: currentStory.storyGerman,
      storyPersian: currentStory.storyPersian,
      targetItems: currentStory.targetItems,
      selectedCount: currentStory.targetItems.length,
      selectionMode: currentStory.selectionMode,
      totalWordCount: currentStory.totalWordCount,
      cefrLevel: currentStory.cefrLevel || (cefrLevel !== "none" ? cefrLevel : "B1"),
      createdAt: Date.now()
    };

    try {
      await dbService.saveStory(newSavedStory);
      setCurrentStory((prev) => (prev ? { ...prev, isSaved: true } : null));
      await loadSavedStories();
      showToast(
        locale === "fa"
          ? "داستان با موفقیت در بخش «داستان‌های ذخیره شده» ذخیره شد ✨"
          : "Story saved to archive ✨"
      );
    } catch (e: any) {
      showToast(locale === "fa" ? "خطا در ذخیره داستان: " + e.message : "Error saving story");
    }
  };

  // Delete/Clear Current Story (opens in-app modal)
  const handleClearCurrentStory = () => {
    setPendingClearCurrent(true);
  };

  const confirmClearCurrent = () => {
    setPendingClearCurrent(false);
    setCurrentStory(null);
    showToast(locale === "fa" ? "داستان جاری پاک شد." : "Current story cleared.");
  };

  // Copy Story to Clipboard
  const handleCopyStory = async () => {
    if (!currentStory) return;
    const cleanGerman = currentStory.storyGerman.replace(/\*\*/g, "");
    const text = `${currentStory.title}\n\n${cleanGerman}\n\n---\nترجمه فارسی:\n${currentStory.storyPersian || ""}`;
    const success = await copyTextToClipboard(text);
    if (success) {
      setCopiedStory(true);
      setTimeout(() => setCopiedStory(false), 2500);
      showToast(locale === "fa" ? "متن داستان با موفقیت کپی شد ✨" : "Story copied to clipboard ✨");
    } else {
      showToast(locale === "fa" ? "خطا در کپی متن به کلیپ‌بورد." : "Failed to copy text.");
    }
  };

  // Regenerate Current Story with the same target items
  const handleRegenerateCurrentStory = () => {
    if (!currentStory) return;
    handleGenerateStory();
  };

  // Delete a saved story (opens in-app modal, works 100% in iframe)
  const handleDeleteSavedStory = (id: string, title?: string) => {
    setPendingDeleteStory({ id, title: title || "" });
  };

  const confirmDeleteSavedStory = async () => {
    if (!pendingDeleteStory) return;
    const id = pendingDeleteStory.id;
    setPendingDeleteStory(null);
    try {
      await dbService.deleteStory(id);
      await loadSavedStories();
      if (storyModalItem?.id === id) setStoryModalItem(null);
      showToast(locale === "fa" ? "داستان ذخیره شده با موفقیت حذف شد." : "Story deleted successfully.");
    } catch (e) {
      showToast(locale === "fa" ? "خطا در حذف داستان." : "Error deleting story.");
    }
  };

  // Bulk Delete Saved Stories (opens in-app modal)
  const handleBulkDeleteSavedStories = () => {
    if (selectedStoryIds.size === 0) return;
    setPendingBulkDelete(true);
  };

  const confirmBulkDeleteSavedStories = async () => {
    if (selectedStoryIds.size === 0) return;
    setPendingBulkDelete(false);
    try {
      await dbService.deleteStories(Array.from(selectedStoryIds));
      setSelectedStoryIds(new Set());
      await loadSavedStories();
      showToast(locale === "fa" ? "داستان‌های انتخاب شده با موفقیت حذف شدند." : "Selected stories deleted.");
    } catch (e) {
      showToast(locale === "fa" ? "خطا در حذف داستان‌های گروهی." : "Error deleting stories.");
    }
  };

  // Regenerate a story from saved items
  const handleRegenerateFromSaved = (story: SavedStory) => {
    // Switch to generate tab, set target items, and trigger generation
    setSelectionMode(story.selectionMode);
    setCefrLevel(story.cefrLevel);
    setActiveSubTab("generate");

    // Match target items from database
    const matched = allSelectableItems.filter((i) => story.targetItems.includes(i.word));
    if (matched.length > 0) {
      setSelectedItemIds(new Set(matched.map((m) => m.id)));
      setGeneratedRandomItems(matched);
    }
    showToast(
      locale === "fa"
        ? `واژگان داستان «${story.title}» بارگذاری شدند. روی دکمه تولید داستان کلیک کنید.`
        : "Target items loaded for regeneration."
    );
  };

  // Filtered saved stories
  const filteredSavedStories = useMemo(() => {
    const q = savedSearch.toLowerCase().trim();
    return savedStories.filter((s) => {
      if (savedLevelFilter !== "all" && s.cefrLevel !== savedLevelFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.storyGerman.toLowerCase().includes(q) ||
        (s.storyPersian && s.storyPersian.toLowerCase().includes(q))
      );
    });
  }, [savedStories, savedSearch, savedLevelFilter]);

  // Helper to render German story text with 100% complete highlighting of all target words
  const renderGermanTextWithHighlights = (rawText: string, targetWords: string[] = []) => {
    // 1. Clean target terms (strip common articles)
    const cleanTargets = targetWords
      .map((w) => w.replace(/^(der|die|das|ein|eine)\s+/i, "").trim())
      .filter((w) => w.length >= 2);

    // 2. Pre-process text: ensure any unbolded target words in the story are safely wrapped in **...**
    let text = rawText;
    for (const term of cleanTargets) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\*\\*)(?<![a-zA-ZäöüßÄÖÜ])(${escaped})(?![a-zA-ZäöüßÄÖÜ])(?!\\*\\*)`, "gi");
      text = text.replace(regex, "**$1**");
    }

    // 3. Parse markdown **bold**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return (
      <div className="text-base sm:text-lg leading-relaxed text-slate-800 font-sans tracking-wide space-y-4 whitespace-pre-line text-left" dir="ltr">
        {parts.map((part, idx) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            const clean = part.slice(2, -2);
            return (
              <span
                key={idx}
                className="bg-indigo-100/90 hover:bg-amber-100 text-indigo-950 hover:text-amber-950 font-bold px-1.5 py-0.5 rounded-md border border-indigo-200/80 shadow-3xs inline-block transition-colors"
                title={`Target Word / واژه هدف: ${clean}`}
              >
                {clean}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${isRtl ? "text-right" : "text-left"}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-5 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-200 font-vazir no-print">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Section Header & Sub-Tabs Switcher */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-amber-50 border border-amber-200/80 text-amber-700 rounded-2xl">
                <BookOpen className="w-5 h-5" />
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 font-vazir">
                {locale === "fa" ? "بخش تمرینات: داستان‌خوانی و سناریونویسی" : "Practice Section: German Stories"}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-vazir max-w-2xl leading-relaxed">
              {locale === "fa"
                ? "خلق داستان‌های جذاب و خواندنی به سبک کتاب معروف Steps to Understanding (ماجراهای طنز و روزمره با پیچش هوشمندانه پایانی) با گنجاندن ۱۰۰٪ واژگان و افعال انتخابی شما."
                : "Generate engaging German stories in the witty, anecdotal style of 'Steps to Understanding' incorporating 100% of your target items."}
            </p>
          </div>

          {/* Sub-tab pills */}
          <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 font-vazir text-xs font-bold self-start md:self-auto shrink-0 shadow-3xs">
            <button
              onClick={() => setActiveSubTab("generate")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
                activeSubTab === "generate"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{locale === "fa" ? "تولید داستان جدید" : "New Story"}</span>
            </button>

            <button
              onClick={() => {
                setActiveSubTab("saved");
                loadSavedStories();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer relative ${
                activeSubTab === "saved"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>{locale === "fa" ? "داستان‌های ذخیره شده" : "Saved Stories"}</span>
              {savedStories.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    activeSubTab === "saved" ? "bg-white/30 text-white" : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  {savedStories.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: GENERATE NEW STORY */}
      {activeSubTab === "generate" && (
        <div className="space-y-6">
          {/* Controls Panel: Mode & CEFR Level */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-6 font-vazir">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Selection Mode */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                  <span>{locale === "fa" ? "روش انتخاب واژگان و افعال:" : "Selection Mode:"}</span>
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectionMode("manual")}
                    className={`py-3 px-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      selectionMode === "manual"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <Search className="w-4 h-4" />
                    <span>{locale === "fa" ? "انتخاب واژه/فعل (دستی)" : "Manual Selection"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectionMode("random");
                      if (generatedRandomItems.length === 0) {
                        handlePickRandomItems();
                      }
                    }}
                    className={`py-3 px-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      selectionMode === "random"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>{locale === "fa" ? "انتخاب تصادفی توسط برنامه" : "Random Selection"}</span>
                  </button>
                </div>
              </div>

              {/* CEFR Level Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>{locale === "fa" ? "سطح زبانی داستان (CEFR Level - اختیاری):" : "CEFR Level (Optional):"}</span>
                </label>
                <select
                  value={cefrLevel}
                  onChange={(e) => setCefrLevel(e.target.value as CefrLevel)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="none">
                    {locale === "fa" ? "🌟 خودکار / متناسب با واژگان انتخابی (آزاد)" : "🌟 Automatic / Natural"}
                  </option>
                  <option value="A1">A1 - سطح مقدماتی و جملات پایه</option>
                  <option value="A2">A2 - سطح عمومی و روزمره</option>
                  <option value="B1">B1 - سطح متوسط و ساختارهای کاربردی</option>
                  <option value="B2">B2 - سطح پیشرفته و روایی غنی</option>
                  <option value="C1">C1 - سطح تخصصی، ادبی و پیچیده</option>
                  <option value="C2">C2 - تسلط کامل زبان‌شناختی</option>
                </select>
              </div>
            </div>

            {/* Mode-specific configuration */}
            {selectionMode === "manual" ? (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                {/* Search & Type Filter Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      placeholder={locale === "fa" ? "جستجوی واژه یا معنی فارسی..." : "Search word or meaning..."}
                      className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                    />
                    {manualSearch && (
                      <button
                        onClick={() => setManualSearch("")}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter tabs */}
                  <div className="flex items-center gap-1.5 text-xs font-bold w-full sm:w-auto justify-between sm:justify-start">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => setManualFilterType("all")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          manualFilterType === "all" ? "bg-white text-slate-900 shadow-3xs" : "text-slate-600"
                        }`}
                      >
                        {locale === "fa" ? "همه" : "All"} ({allSelectableItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualFilterType("verb")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          manualFilterType === "verb" ? "bg-white text-indigo-700 shadow-3xs" : "text-slate-600"
                        }`}
                      >
                        {locale === "fa" ? "افعال" : "Verbs"} ({verbs.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualFilterType("vocab")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          manualFilterType === "vocab" ? "bg-white text-purple-700 shadow-3xs" : "text-slate-600"
                        }`}
                      >
                        {locale === "fa" ? "واژگان" : "Vocab"} ({vocabularies.length})
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        className="px-2.5 py-1 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer border border-indigo-200/50"
                      >
                        {locale === "fa" ? "انتخاب نتایج" : "Select Filtered"}
                      </button>
                      {selectedItemIds.size > 0 && (
                        <button
                          type="button"
                          onClick={handleClearSelections}
                          className="px-2.5 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border border-red-200/50"
                        >
                          {locale === "fa" ? "پاک کردن همه" : "Clear All"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Selected Status Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-xs text-indigo-900 font-bold">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                    <span>
                      {locale === "fa"
                        ? `تعداد انتخاب شده: ${selectedItemIds.size} از حداکثر ۸۰ مورد مجاز`
                        : `Selected: ${selectedItemIds.size} / 80 max`}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {locale === "fa"
                      ? "برای داستان باید بین ۱ تا ۸۰ مورد انتخاب شود."
                      : "Choose 1 to 80 words/verbs."}
                  </span>
                </div>

                {/* Scrollable Items Grid */}
                <div className="max-h-72 overflow-y-auto pr-1 border border-slate-200/70 rounded-2xl p-2 bg-slate-50/50 space-y-1.5">
                  {filteredManualItems.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-vazir">
                      {locale === "fa" ? "هیچ موردی پیدا نشد." : "No items found."}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {filteredManualItems.map((item) => {
                        const isSelected = selectedItemIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleToggleSelectItem(item.id)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                              isSelected
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-3xs"
                                : "bg-white text-slate-800 border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/20"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 font-sans font-bold truncate">
                                {item.article && (
                                  <span
                                    className={`text-[10px] px-1 py-0.2 rounded font-semibold ${
                                      isSelected
                                        ? "bg-white/20 text-white"
                                        : item.article === "der"
                                        ? "bg-blue-100 text-blue-800"
                                        : item.article === "die"
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-emerald-100 text-emerald-800"
                                    }`}
                                  >
                                    {item.article}
                                  </span>
                                )}
                                <span className="truncate">{item.word}</span>
                              </div>
                              {item.meaning && (
                                <p
                                  className={`text-[11px] truncate font-vazir mt-0.5 ${
                                    isSelected ? "text-indigo-100" : "text-slate-500"
                                  }`}
                                >
                                  {item.meaning}
                                </p>
                              )}
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                  isSelected
                                    ? "bg-white/20 text-white"
                                    : item.type === "verb"
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "bg-purple-100 text-purple-700"
                                }`}
                              >
                                {item.typeLabel}
                              </span>
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-white shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Random Mode Controls */
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  {/* Slider / Count Input (20 to 80) */}
                  <div className="sm:col-span-2 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>{locale === "fa" ? "تعداد واژگان و افعال تصادفی (۲۰ تا ۸۰):" : "Word Count (20-80):"}</span>
                      <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-xs font-extrabold">
                        {randomCount} {locale === "fa" ? "مورد" : "items"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="80"
                      value={randomCount}
                      onChange={(e) => setRandomCount(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-sans">
                      <span>20</span>
                      <span>35</span>
                      <span>50</span>
                      <span>65</span>
                      <span>80</span>
                    </div>
                  </div>

                  {/* Filter source */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      {locale === "fa" ? "منبع تصادفی:" : "Source:"}
                    </label>
                    <select
                      value={randomSourceType}
                      onChange={(e) => setRandomSourceType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="all">ترکیبی از فعل و واژه (توصیه شده)</option>
                      <option value="verb">فقط از لیست افعال</option>
                      <option value="vocab">فقط از بانک واژگان</option>
                    </select>
                  </div>
                </div>

                {/* Random Pick Action Button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handlePickRandomItems}
                    className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-3xs"
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>{locale === "fa" ? "تولید تصادفی مجدد واژه‌ها" : "Re-roll Random Words"}</span>
                  </button>

                  <span className="text-xs text-slate-500">
                    {locale === "fa"
                      ? `نسبت استاندارد: ۴ فعل به ازای هر ۶ واژه (۴۰٪ فعل، ۶۰٪ واژه عادی) از بین ${allSelectableItems.length} آیتم فعال.`
                      : `Standard ratio: 4 verbs per 6 vocab (40% verbs, 60% words) from ${allSelectableItems.length} items.`}
                  </span>
                </div>

                {/* Randomly selected preview chips */}
                {generatedRandomItems.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-2">
                        <span>{locale === "fa" ? "واژگان تصادفی انتخاب شده:" : "Randomly Selected Items:"}</span>
                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[11px] font-semibold">
                          {generatedRandomItems.filter((i) => i.type === "verb").length} فعل +{" "}
                          {generatedRandomItems.filter((i) => i.type === "vocab").length} واژه
                        </span>
                      </span>
                      <span className="text-indigo-600 font-extrabold">{generatedRandomItems.length} مورد</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {generatedRandomItems.map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-sans font-bold text-slate-800 shadow-3xs"
                        >
                          <span className="text-[10px] text-indigo-600 font-vazir font-normal">
                            ({item.typeLabel})
                          </span>
                          <span>{item.word}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Generate Action & Proportional Word Count Preview */}
            <div className="pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>
                    {locale === "fa"
                      ? `طول داستان تخمینی: حدود ${expectedStoryWordCount} کلمه (بین ۳۰۰ تا ۶۰۰ کلمه)`
                      : `Target Story Length: ~${expectedStoryWordCount} words (300 - 600)`}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  {locale === "fa"
                    ? "تعداد کلمات داستان بر اساس تعداد واژه‌های انتخاب شده به صورت پویا محاسبه می‌شود."
                    : "Word count scales dynamically with the number of target items."}
                </p>
              </div>

              <button
                type="button"
                disabled={isGenerating || currentTargetItems.length === 0}
                onClick={handleGenerateStory}
                className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl text-xs sm:text-sm font-extrabold shadow-md flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className={`w-4 h-4 text-amber-300 ${isGenerating ? "animate-spin" : ""}`} />
                <span>
                  {isGenerating
                    ? locale === "fa"
                      ? "در حال نگارش و خلق داستان با هوش مصنوعی..."
                      : "Writing story with AI..."
                    : locale === "fa"
                    ? `تولید داستان با ${currentTargetItems.length} واژه انتخابی ✨`
                    : `Generate Story (${currentTargetItems.length} words) ✨`}
                </span>
              </button>
            </div>

            {/* Error Message */}
            {generateError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{generateError}</span>
              </div>
            )}
          </div>

          {/* GENERATED STORY CARD DISPLAY */}
          {currentStory && (
            <div className="bg-white border-2 border-indigo-100 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 animate-in fade-in zoom-in-95 duration-200 font-vazir">
              {/* Header: Title, Metadata Badges & Action Icons */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs font-bold">
                      {locale === "fa" ? "داستان آلمانی" : "German Story"}
                    </span>
                    <span className="px-2.5 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-full text-xs font-extrabold flex items-center gap-1 shadow-3xs">
                      <GraduationCap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>
                        {locale === "fa"
                          ? `سطح زبانی CEFR: ${currentStory.cefrLevel && currentStory.cefrLevel !== "none" ? currentStory.cefrLevel : "B1"}`
                          : `CEFR Level: ${currentStory.cefrLevel && currentStory.cefrLevel !== "none" ? currentStory.cefrLevel : "B1"}`}
                      </span>
                    </span>
                    <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                      {currentStory.totalWordCount} {locale === "fa" ? "کلمه در متن" : "words"}
                    </span>
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-medium">
                      {currentStory.targetItems.length} {locale === "fa" ? "واژه هدف تعبیه شده در داستان" : "target words integrated"}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
                    {currentStory.title}
                  </h3>
                </div>

                {/* Toolbar: Save, Regenerate, Copy, Persian Toggle, Delete */}
                <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                  {/* Save button */}
                  <button
                    onClick={handleSaveCurrentStory}
                    disabled={currentStory.isSaved}
                    className={`p-2.5 rounded-2xl border transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                      currentStory.isSaved
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700 shadow-3xs"
                    }`}
                    title={locale === "fa" ? "ذخیره در داستان‌های من" : "Save Story"}
                  >
                    {currentStory.isSaved ? (
                      <>
                        <BookmarkCheck className="w-4 h-4 text-emerald-600" />
                        <span className="hidden sm:inline">{locale === "fa" ? "ذخیره شد" : "Saved"}</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4 text-indigo-600" />
                        <span className="hidden sm:inline">{locale === "fa" ? "ذخیره داستان" : "Save"}</span>
                      </>
                    )}
                  </button>

                  {/* Regenerate button */}
                  <button
                    onClick={handleRegenerateCurrentStory}
                    disabled={isGenerating}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-3xs"
                    title={locale === "fa" ? "تولید مجدد داستان با همین واژه‌ها" : "Regenerate Story"}
                  >
                    <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin text-indigo-600" : ""}`} />
                  </button>

                  {/* Copy button */}
                  <button
                    onClick={handleCopyStory}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-3xs"
                    title={locale === "fa" ? "کپی متن داستان" : "Copy Story"}
                  >
                    {copiedStory ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>

                  {/* Toggle Persian */}
                  <button
                    onClick={() => setShowPersianTranslation(!showPersianTranslation)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-3xs flex items-center gap-1.5"
                    title={locale === "fa" ? "نمایش/مخفی‌سازی ترجمه فارسی" : "Toggle Persian Translation"}
                  >
                    {showPersianTranslation ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-indigo-600" />}
                    <span className="text-[11px] hidden sm:inline">
                      {showPersianTranslation ? (locale === "fa" ? "مخفی کردن ترجمه" : "Hide Translation") : (locale === "fa" ? "ترجمه فارسی" : "Show Translation")}
                    </span>
                  </button>

                  {/* Delete / Clear button */}
                  <button
                    onClick={handleClearCurrentStory}
                    className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl border border-red-200 text-xs font-bold transition-all cursor-pointer shadow-3xs"
                    title={locale === "fa" ? "حذف و پاک کردن داستان" : "Clear Story"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Story Content Area */}
              <div className="space-y-6">
                {/* German Story with 100% Highlighting */}
                <div className="p-6 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                  {renderGermanTextWithHighlights(currentStory.storyGerman, currentStory.targetItems)}
                </div>

                {/* Persian Translation Section */}
                {showPersianTranslation && currentStory.storyPersian && (
                  <div className="p-6 bg-amber-50/40 border border-amber-200/60 rounded-2xl space-y-2 text-right animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900 border-b border-amber-200/50 pb-2">
                      <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>{locale === "fa" ? "ترجمه روان به زبان فارسی:" : "Persian Translation:"}</span>
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed text-slate-800 whitespace-pre-line font-vazir">
                      {currentStory.storyPersian}
                    </p>
                  </div>
                )}

                {/* Target words checklist chips */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>{locale === "fa" ? "واژگان هدف تعبیه شده در داستان:" : "Target Items Integrated:"}</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-bold">
                      {currentStory.targetItems.length} {locale === "fa" ? "واژه (۱۰۰٪ در داستان)" : "words (100% in story)"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {currentStory.targetItems.map((word, idx) => {
                      const clean = word.replace(/^(der|die|das|ein|eine)\s+/i, "").trim().toLowerCase();
                      const isUsed =
                        currentStory.usedTargetItems.includes(word) ||
                        currentStory.storyGerman.toLowerCase().includes(clean);
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-sans shadow-3xs border ${
                            isUsed
                              ? "bg-white border-indigo-200 text-indigo-900"
                              : "bg-amber-50 border-amber-200 text-amber-800"
                          }`}
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>{word}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SAVED STORIES (داستان‌های ذخیره شده) */}
      {activeSubTab === "saved" && (
        <div className="space-y-6 font-vazir">
          {/* Top Search & Filter Bar */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  placeholder={locale === "fa" ? "جستجو در عنوان یا متن داستان‌ها..." : "Search in saved stories..."}
                  className="w-full pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                />
                {savedSearch && (
                  <button
                    onClick={() => setSavedSearch("")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter by CEFR Level */}
              <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Filter className="w-4 h-4 text-indigo-600" />
                  <span>{locale === "fa" ? "فیلتر سطح:" : "Level:"}</span>
                  <select
                    value={savedLevelFilter}
                    onChange={(e) => setSavedLevelFilter(e.target.value as any)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="all">همه سطوح</option>
                    <option value="A1">A1</option>
                    <option value="A2">A2</option>
                    <option value="B1">B1</option>
                    <option value="B2">B2</option>
                    <option value="C1">C1</option>
                    <option value="C2">C2</option>
                    <option value="none">آزاد / عمومی</option>
                  </select>
                </div>

                {/* Multi-Delete Button */}
                {selectedStoryIds.size > 0 && (
                  <button
                    onClick={handleBulkDeleteSavedStories}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {locale === "fa" ? `حذف (${selectedStoryIds.size})` : `Delete (${selectedStoryIds.size})`}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Total and Select All info */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (selectedStoryIds.size === filteredSavedStories.length) {
                      setSelectedStoryIds(new Set());
                    } else {
                      setSelectedStoryIds(new Set(filteredSavedStories.map((s) => s.id)));
                    }
                  }}
                  className="flex items-center gap-1.5 text-slate-700 hover:text-indigo-600 font-bold transition-colors cursor-pointer"
                >
                  {selectedStoryIds.size > 0 && selectedStoryIds.size === filteredSavedStories.length ? (
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>{locale === "fa" ? "انتخاب همه" : "Select All"}</span>
                </button>
                <span>
                  {locale === "fa"
                    ? `تعداد کل داستان‌های ذخیره شده: ${filteredSavedStories.length} داستان`
                    : `Total saved stories: ${filteredSavedStories.length}`}
                </span>
              </div>
            </div>
          </div>

          {/* Stories List */}
          {savedStoriesLoading ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center text-slate-400 text-xs">
              {locale === "fa" ? "در حال بارگذاری داستان‌های ذخیره شده..." : "Loading saved stories..."}
            </div>
          ) : filteredSavedStories.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-200/80 text-indigo-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                <Bookmark className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="text-base font-bold text-slate-800">
                  {locale === "fa" ? "هنوز داستانی ذخیره نشده است" : "No saved stories yet"}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {locale === "fa"
                    ? "برای تولید داستان جدید، از سربرگ «تولید داستان جدید» استفاده کرده و پس از ایجاد داستان، روی آیکون ذخیره کلیک کنید."
                    : "Generate your first story and save it to review it anytime."}
                </p>
              </div>
              <button
                onClick={() => setActiveSubTab("generate")}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-xs transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{locale === "fa" ? "رفتن به بخش تولید داستان" : "Go to Story Generator"}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSavedStories.map((story) => {
                const isChecked = selectedStoryIds.has(story.id);
                const dateStr = new Date(story.createdAt).toLocaleDateString(locale === "fa" ? "fa-IR" : "de-DE", {
                  year: "numeric",
                  month: "short",
                  day: "numeric"
                });

                return (
                  <div
                    key={story.id}
                    className={`bg-white border rounded-3xl p-5 shadow-2xs space-y-4 transition-all hover:shadow-md ${
                      isChecked ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200/80"
                    }`}
                  >
                    {/* Story Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedStoryIds);
                            if (next.has(story.id)) next.delete(story.id);
                            else next.add(story.id);
                            setSelectedStoryIds(next);
                          }}
                          className="mt-1 cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                        <div className="space-y-1">
                          <h4 className="text-base font-bold text-slate-900 font-sans line-clamp-1">
                            {story.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>{dateStr}</span>
                          </div>
                        </div>
                      </div>

                      {/* CEFR Badge */}
                      <span className="px-2.5 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-full text-xs font-extrabold shrink-0 flex items-center gap-1 shadow-3xs">
                        <GraduationCap className="w-3 h-3 text-purple-600 shrink-0" />
                        <span>{story.cefrLevel && story.cefrLevel !== "none" ? story.cefrLevel : "B1"}</span>
                      </span>
                    </div>

                    {/* Metadata Badges: Total Word Count & Selected Target Count */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl font-bold flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          {story.totalWordCount} {locale === "fa" ? "کلمه داستان" : "words"}
                        </span>
                      </div>

                      <div className="px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-100 rounded-xl font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>
                          {story.selectedCount} {locale === "fa" ? "واژه انتخابی" : "target words"}
                        </span>
                      </div>

                      <div className="px-2 py-1 bg-slate-50 text-slate-500 rounded-xl text-[11px]">
                        {story.selectionMode === "random"
                          ? (locale === "fa" ? "انتخاب تصادفی" : "Random")
                          : (locale === "fa" ? "انتخاب دستی" : "Manual")}
                      </div>
                    </div>

                    {/* Story Preview Excerpt */}
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed font-sans text-left" dir="ltr">
                      {story.storyGerman.replace(/\*\*/g, "")}
                    </p>

                    {/* Action Buttons: View, Regenerate, Delete */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setStoryModalItem(story)}
                        className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-3xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{locale === "fa" ? "مشاهده کامل داستان" : "Read Full Story"}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRegenerateFromSaved(story)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                          title={locale === "fa" ? "تولید مجدد با همین واژه‌ها" : "Regenerate with these words"}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSavedStory(story.id, story.title)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                          title={locale === "fa" ? "حذف داستان" : "Delete Story"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FULL STORY MODAL VIEW */}
      {storyModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-vazir no-print">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs font-bold">
                    {locale === "fa" ? "داستان ذخیره شده" : "Saved Story"}
                  </span>
                  <span className="px-2.5 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-full text-xs font-extrabold flex items-center gap-1 shadow-3xs">
                    <GraduationCap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>
                      {locale === "fa"
                        ? `سطح زبانی داستان: ${storyModalItem.cefrLevel && storyModalItem.cefrLevel !== "none" ? storyModalItem.cefrLevel : "B1"}`
                        : `CEFR Level: ${storyModalItem.cefrLevel && storyModalItem.cefrLevel !== "none" ? storyModalItem.cefrLevel : "B1"}`}
                    </span>
                  </span>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                    {storyModalItem.totalWordCount} {locale === "fa" ? "کلمه" : "words"}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-sans tracking-tight">
                  {storyModalItem.title}
                </h3>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDeleteSavedStory(storyModalItem.id, storyModalItem.title)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                  title={locale === "fa" ? "حذف این داستان" : "Delete this story"}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setStoryModalItem(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* German Story Text */}
            <div className="p-6 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
              {renderGermanTextWithHighlights(storyModalItem.storyGerman, storyModalItem.targetItems)}
            </div>

            {/* Persian Translation */}
            {storyModalItem.storyPersian && (
              <div className="p-6 bg-amber-50/40 border border-amber-200/60 rounded-2xl space-y-2 text-right">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900 border-b border-amber-200/50 pb-2">
                  <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{locale === "fa" ? "ترجمه روان فارسی:" : "Persian Translation:"}</span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-slate-800 whitespace-pre-line">
                  {storyModalItem.storyPersian}
                </p>
              </div>
            )}

            {/* Target Words Chips */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
              <div className="text-xs font-bold text-slate-700">
                {locale === "fa" ? "واژگان هدف این داستان:" : "Target Words:"} ({storyModalItem.targetItems.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {storyModalItem.targetItems.map((w, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-indigo-200 text-indigo-900 rounded-lg text-xs font-bold font-sans shadow-3xs"
                  >
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>{w}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const cleanGerman = storyModalItem.storyGerman.replace(/\*\*/g, "");
                    const text = `${storyModalItem.title}\n\n${cleanGerman}\n\n---\nترجمه فارسی:\n${storyModalItem.storyPersian || ""}`;
                    const ok = await copyTextToClipboard(text);
                    if (ok) {
                      showToast(locale === "fa" ? "متن داستان با موفقیت کپی شد ✨" : "Story text copied ✨");
                    } else {
                      showToast(locale === "fa" ? "خطا در کپی متن." : "Failed to copy text.");
                    }
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{locale === "fa" ? "کپی متن" : "Copy"}</span>
                </button>

                <button
                  onClick={() => {
                    handleRegenerateFromSaved(storyModalItem);
                    setStoryModalItem(null);
                  }}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{locale === "fa" ? "تولید مجدد با همین واژه‌ها" : "Regenerate"}</span>
                </button>
              </div>

              <button
                onClick={() => setStoryModalItem(null)}
                className="w-full sm:w-auto px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {locale === "fa" ? "بستن" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* CONFIRM SINGLE STORY DELETE MODAL */}
      {pendingDeleteStory && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-vazir no-print animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-50 border border-red-100 rounded-2xl">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  {locale === "fa" ? "حذف داستان ذخیره شده" : "Delete Saved Story"}
                </h4>
                <p className="text-xs text-slate-500">
                  {locale === "fa" ? "این عملیات غیرقابل بازگشت است" : "This action cannot be undone"}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
              {locale === "fa" ? (
                <>
                  آیا از حذف داستان{" "}
                  {pendingDeleteStory.title ? (
                    <span className="font-bold text-slate-900">«{pendingDeleteStory.title}»</span>
                  ) : (
                    "این داستان"
                  )}{" "}
                  اطمینان دارید؟
                </>
              ) : (
                `Are you sure you want to delete this story?`
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPendingDeleteStory(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {locale === "fa" ? "انصراف" : "Cancel"}
              </button>
              <button
                onClick={confirmDeleteSavedStory}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{locale === "fa" ? "بله، حذف شود" : "Yes, Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM BULK DELETE MODAL */}
      {pendingBulkDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-vazir no-print animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-50 border border-red-100 rounded-2xl">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  {locale === "fa" ? "حذف گروهی داستان‌ها" : "Bulk Delete Stories"}
                </h4>
                <p className="text-xs text-slate-500">
                  {locale === "fa" ? "تمام داستان‌های انتخاب شده پاک خواهند شد" : "All selected stories will be removed"}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
              {locale === "fa"
                ? `آیا از حذف تعداد ${selectedStoryIds.size} داستان انتخاب‌شده اطمینان کامل دارید؟`
                : `Are you sure you want to delete ${selectedStoryIds.size} selected stories?`}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPendingBulkDelete(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {locale === "fa" ? "انصراف" : "Cancel"}
              </button>
              <button
                onClick={confirmBulkDeleteSavedStories}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{locale === "fa" ? `حذف تمام (${selectedStoryIds.size}) داستان` : "Yes, Delete All"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR CURRENT STORY MODAL */}
      {pendingClearCurrent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-vazir no-print animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  {locale === "fa" ? "بستن و پاک کردن داستان فعلی" : "Clear Current Story"}
                </h4>
                <p className="text-xs text-slate-500">
                  {locale === "fa" ? "در صورت عدم ذخیره، متن داستان از بین می‌رود" : "Unsaved story will be lost"}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
              {locale === "fa"
                ? "آیا از بستن داستان فعلی اطمینان دارید؟ اگر هنوز آن را ذخیره نکرده‌اید، می‌توانید ابتدا دکمه «ذخیره داستان» را بزنید."
                : "Are you sure you want to clear the current story? If not saved, it will be discarded."}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPendingClearCurrent(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {locale === "fa" ? "انصراف" : "Cancel"}
              </button>
              <button
                onClick={confirmClearCurrent}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{locale === "fa" ? "بله، پاک شود" : "Yes, Clear"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
