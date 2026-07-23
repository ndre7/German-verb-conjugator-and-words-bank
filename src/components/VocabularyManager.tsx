import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PlusCircle,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Filter,
  BookMarked,
  Download,
  Upload,
  RotateCcw,
  LayoutGrid,
  List,
  Tag,
  Info,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileText,
  ArrowRightLeft,
  FileJson,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { dbService } from "../DatabaseService";
import { VocabularyItem, ArticleType, PartOfSpeech, VocabularyCategory } from "../types";
import { translations, Locale } from "../translations";
import VocabularyCategoryManager from "./VocabularyCategoryManager";
import SynonymAntonymManager from "./SynonymAntonymManager";

interface VocabularyManagerProps {
  locale: Locale;
  defaultSubTab?: "bank" | "synonym_antonym" | "categories";
}

export default function VocabularyManager({ locale, defaultSubTab = "bank" }: VocabularyManagerProps) {
  const t = translations[locale] || translations.en;
  const isRtl = locale === "fa";

  // Sub-tabs: Vocabulary Bank vs Synonyms/Antonyms vs Category Management
  const [activeSubTab, setActiveSubTab] = useState<"bank" | "synonym_antonym" | "categories">(defaultSubTab);

  const [vocabularies, setVocabularies] = useState<VocabularyItem[]>([]);
  const [vocabCategories, setVocabCategories] = useState<VocabularyCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter States
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [articleFilter, setArticleFilter] = useState<ArticleType | "all">("all");
  const [posFilter, setPosFilter] = useState<PartOfSpeech | "all">("all");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Debounced search query update
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearchQuery);
      setCurrentPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [localSearchQuery]);

  // Click outside listener for suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Quick Add State
  const [quickInput, setQuickInput] = useState("");

  // Modal State for Add / Edit Word
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<VocabularyItem | null>(null);

  // Form Fields State
  const [formArticle, setFormArticle] = useState<ArticleType>("der");
  const [formWord, setFormWord] = useState("");
  const [formMeaning, setFormMeaning] = useState("");
  const [formPlural, setFormPlural] = useState("");
  const [formPos, setFormPos] = useState<PartOfSpeech>("noun");
  const [formExample, setFormExample] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTags, setFormTags] = useState<string[]>([]);

  // Bulk JSON Import Modal
  const [showJsonImportModal, setShowJsonImportModal] = useState(false);
  const [jsonInputText, setJsonInputText] = useState("");
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [jsonImportSuccess, setJsonImportSuccess] = useState<string | null>(null);

  // AI States
  const [aiLoading, setAiLoading] = useState(false);
  const [enableAiJsonImport, setEnableAiJsonImport] = useState(true);

  // AI Fill Single Word in Add/Edit Modal
  const handleAiFillSingleWord = async () => {
    const word = formWord.trim();
    if (!word) {
      alert(locale === "fa" ? "لطفاً ابتدا واژه آلمانی را وارد کنید." : "Please enter the German word first.");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/gemini/vocab-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          currentData: { article: formArticle, meaning: formMeaning, plural: formPlural, notes: formNotes }
        })
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        if (d.article && ["der", "die", "das", "none"].includes(d.article)) {
          setFormArticle(d.article as ArticleType);
        }
        if (d.word) setFormWord(d.word);
        if (d.meaning) setFormMeaning(d.meaning);
        if (d.plural !== undefined) setFormPlural(d.plural);
        if (d.partOfSpeech) setFormPos(d.partOfSpeech as PartOfSpeech);
        if (d.example) setFormExample(d.example);
        if (d.notes) setFormNotes(d.notes);
        showToast(
          locale === "fa"
            ? "تمامی بخش‌های واژه (معنی، آرتیکل، جمع، نقش و توضیحات) با AI تکمیل شد ✨"
            : "Word analyzed and filled with AI ✨"
        );
      } else {
        alert(result.error || "خطا در فراخوانی هوش مصنوعی");
      }
    } catch (err: any) {
      console.error("AI Error:", err);
      alert("خطا در ارتباط با سرور هوش مصنوعی: " + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // AI Enrich Existing Item directly from list
  const handleAiEnrichExistingItem = async (item: VocabularyItem) => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/gemini/vocab-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: item.word,
          currentData: item
        })
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        const updated: VocabularyItem = {
          ...item,
          article: (d.article && ["der", "die", "das", "none"].includes(d.article)) ? (d.article as ArticleType) : item.article,
          word: d.word || item.word,
          meaning: d.meaning || item.meaning,
          plural: d.plural !== undefined ? d.plural : (item.plural || ""),
          partOfSpeech: (d.partOfSpeech as PartOfSpeech) || item.partOfSpeech,
          example: d.example || item.example || "",
          notes: d.notes || item.notes || "",
          updatedAt: Date.now()
        };
        await dbService.saveVocabulary(updated);
        await loadData();
        showToast(
          locale === "fa"
            ? `اطلاعات کامل واژه "${updated.word}" با هوش مصنوعی بروزرسانی شد ✨`
            : `Word "${updated.word}" enriched with AI ✨`
        );
      } else {
        alert(result.error || "خطا در هوش مصنوعی");
      }
    } catch (err: any) {
      alert("خطا: " + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await dbService.getVocabularies();
      const customOrder = await dbService.getCustomVocabOrder();

      if (customOrder && customOrder.length > 0) {
        list.sort((a, b) => {
          let idxA = customOrder.indexOf(a.id);
          let idxB = customOrder.indexOf(b.id);
          if (idxA === -1) idxA = 99999;
          if (idxB === -1) idxB = 99999;
          if (idxA !== idxB) return idxA - idxB;
          return b.createdAt - a.createdAt;
        });
      } else {
        list.sort((a, b) => b.createdAt - a.createdAt);
      }

      setVocabularies(list);

      const cats = await dbService.getVocabCategories();
      setVocabCategories(cats);
    } catch (err) {
      console.error("Error loading vocabulary data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Reorder row up or down
  const handleMoveVocab = async (indexOnPage: number, direction: "up" | "down") => {
    const targetOnPage = direction === "up" ? indexOnPage - 1 : indexOnPage + 1;
    if (targetOnPage < 0 || targetOnPage >= filteredVocabularies.length) return;

    const itemToMove = filteredVocabularies[indexOnPage];
    const itemToSwap = filteredVocabularies[targetOnPage];

    const idx1 = vocabularies.findIndex(v => v.id === itemToMove.id);
    const idx2 = vocabularies.findIndex(v => v.id === itemToSwap.id);

    if (idx1 !== -1 && idx2 !== -1) {
      const newVocabs = [...vocabularies];
      newVocabs[idx1] = itemToSwap;
      newVocabs[idx2] = itemToMove;

      const newOrder = newVocabs.map(v => v.id);
      setVocabularies(newVocabs);
      await dbService.saveCustomVocabOrder(newOrder);
      showToast(locale === "fa" ? "ترتیب واژگان بروزرسانی شد." : "Vocabulary reordered.");
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormArticle("der");
    setFormWord("");
    setFormMeaning("");
    setFormPlural("");
    setFormPos("noun");
    setFormExample("");
    setFormNotes("");
    setFormTags([]);
    setShowModal(true);
  };

  const handleOpenEditModal = (item: VocabularyItem) => {
    setEditingItem(item);
    setFormArticle(item.article);
    setFormWord(item.word);
    setFormMeaning(item.meaning);
    setFormPlural(item.plural || "");
    setFormPos(item.partOfSpeech);
    setFormExample(item.example || "");
    setFormNotes(item.notes || "");
    setFormTags(item.tags || []);
    setShowModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawWord = formWord.trim();
    if (!rawWord) return;

    const newItem: VocabularyItem = {
      id: editingItem ? editingItem.id : `vocab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      article: formArticle,
      word: rawWord,
      meaning: formMeaning.trim(),
      plural: formPlural.trim(),
      partOfSpeech: formPos,
      example: formExample.trim(),
      notes: formNotes.trim(),
      tags: formTags,
      createdAt: editingItem ? editingItem.createdAt : Date.now(),
      updatedAt: Date.now()
    };

    await dbService.saveVocabulary(newItem);
    setShowModal(false);
    await loadData();

    if (editingItem) {
      showToast(locale === "fa" ? `واژه "${rawWord}" بروزرسانی شد.` : `Word "${rawWord}" updated.`);
    } else {
      showToast(locale === "fa" ? `واژه "${rawWord}" با موفقیت اضافه شد.` : `Word "${rawWord}" added.`);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = quickInput.trim();
    if (!raw) return;

    const parts = raw.split(/[-=–—,]+/).map(s => s.trim());
    const word = parts[0] || raw;
    const meaning = parts[1] || "";

    let article: ArticleType = "none";
    let cleanWord = word;

    if (/^der\s+/i.test(word)) {
      article = "der";
      cleanWord = word.replace(/^der\s+/i, "");
    } else if (/^die\s+/i.test(word)) {
      article = "die";
      cleanWord = word.replace(/^die\s+/i, "");
    } else if (/^das\s+/i.test(word)) {
      article = "das";
      cleanWord = word.replace(/^das\s+/i, "");
    }

    const newItem: VocabularyItem = {
      id: `vocab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      article,
      word: cleanWord,
      meaning,
      plural: "",
      partOfSpeech: article !== "none" ? "noun" : "expression",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await dbService.saveVocabulary(newItem);
    setQuickInput("");
    await loadData();
    showToast(locale === "fa" ? `واژه "${cleanWord}" سریع اضافه شد!` : `Word "${cleanWord}" added quickly!`);
  };

  const handleDelete = async (item: VocabularyItem) => {
    const confirmMsg = locale === "fa"
      ? `آیا از حذف واژه "${item.word}" اطمینان دارید؟`
      : `Delete "${item.word}"?`;

    if (window.confirm(confirmMsg)) {
      await dbService.deleteVocabulary(item.id);
      await loadData();
      showToast(locale === "fa" ? `واژه "${item.word}" حذف شد.` : `Word deleted.`);
    }
  };

  const handleResetVocabularies = async () => {
    const confirmMsg = locale === "fa"
      ? "آیا مایلید لیست واژگان به حالت نمونه اولیه بازیابی شود؟"
      : "Reset vocabulary list to default sample words?";

    if (window.confirm(confirmMsg)) {
      await dbService.resetVocabulariesToDefault();
      await loadData();
      showToast(locale === "fa" ? "واژگان با موفقیت بازیابی شدند." : "Vocabulary restored to defaults.");
    }
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(vocabularies, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `German_Vocabulary_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportFullBackup = async () => {
    try {
      const jsonStr = await dbService.exportFullBackupJSON();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `German_App_Full_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(locale === "fa" ? "پشتیبان‌گیری کامل برنامه دانلود شد 📦" : "Full backup downloaded 📦");
    } catch (err: any) {
      alert("خطا در پشتیبان‌گیری: " + err.message);
    }
  };

  const handleImportFullBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const success = await dbService.importFullBackupJSON(text);
        if (success) {
          showToast(
            locale === "fa"
              ? "بازیابی کامل دیتابیس با موفقیت انجام شد ✨"
              : "Full backup restored successfully ✨"
          );
          await loadData();
        }
      } catch (err: any) {
        alert("خطا در فایل پشتیبان: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Bulk JSON File / Code Import Processing
  const processJsonImport = async (jsonText: string) => {
    setJsonImportError(null);
    setJsonImportSuccess(null);

    try {
      const parsed = JSON.parse(jsonText);
      let itemsArray: any[] = [];

      if (Array.isArray(parsed)) {
        itemsArray = parsed;
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.words)) itemsArray = parsed.words;
        else if (Array.isArray(parsed.vocabularies)) itemsArray = parsed.vocabularies;
        else if (Array.isArray(parsed.items)) itemsArray = parsed.items;
        else itemsArray = [parsed];
      }

      if (!itemsArray || itemsArray.length === 0) {
        setJsonImportError(locale === "fa" ? "هیچ واژه‌ای در فایل JSON پیدا نشد." : "No words found in JSON.");
        return;
      }

      // If AI enrich is enabled, send to Gemini API
      if (enableAiJsonImport && itemsArray.length > 0) {
        setJsonImportSuccess(
          locale === "fa"
            ? "در حال تحلیل و تکمیل تمامی فیلدهای واژگان با هوش مصنوعی... (لطفاً چند لحظه شکیبا باشید)"
            : "Enriching vocabulary items with AI..."
        );
        try {
          const aiRes = await fetch("/api/gemini/batch-vocab-fill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: itemsArray.slice(0, 50) }) // safety limit 50 items
          });
          const aiData = await aiRes.json();
          if (aiData.success && Array.isArray(aiData.items) && aiData.items.length > 0) {
            itemsArray = aiData.items;
          }
        } catch (err) {
          console.error("Batch AI error during JSON import:", err);
        }
      }

      let countSuccess = 0;

      for (const raw of itemsArray) {
        if (!raw || typeof raw !== "object" || !raw.word) continue;

        let art: ArticleType = "none";
        if (raw.article === "der" || raw.article === "die" || raw.article === "das") {
          art = raw.article;
        } else if (/^der\s+/i.test(raw.word)) {
          art = "der";
        } else if (/^die\s+/i.test(raw.word)) {
          art = "die";
        } else if (/^das\s+/i.test(raw.word)) {
          art = "das";
        }

        const cleanWord = raw.word.replace(/^(der|die|das)\s+/i, "").trim();

        const item: VocabularyItem = {
          id: raw.id || `vocab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          article: art,
          word: cleanWord,
          meaning: raw.meaning ? String(raw.meaning).trim() : "",
          plural: raw.plural ? String(raw.plural).trim() : "",
          partOfSpeech: raw.partOfSpeech || (art !== "none" ? "noun" : "expression"),
          example: raw.example ? String(raw.example).trim() : "",
          notes: raw.notes ? String(raw.notes).trim() : "",
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          createdAt: raw.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        await dbService.saveVocabulary(item);
        countSuccess++;
      }

      await loadData();
      setJsonImportSuccess(
        locale === "fa"
          ? `${countSuccess} واژه با موفقیت وارد دیتابیس شد!`
          : `${countSuccess} words imported successfully!`
      );
      showToast(locale === "fa" ? `${countSuccess} واژه جدید درون‌ریزی شد.` : `${countSuccess} words imported.`);
      setTimeout(() => setShowJsonImportModal(false), 2000);
    } catch (err: any) {
      console.error("JSON parse error:", err);
      setJsonImportError(
        locale === "fa"
          ? `فرمت فایل JSON نامعتبر است. ساختار باید آرایه‌ای از اشیاء واژه باشد.\nخطا: ${err.message}`
          : `Invalid JSON format. Should be an array of word objects.\nError: ${err.message}`
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setJsonInputText(text);
      processJsonImport(text);
    };
    reader.readAsText(file);
  };

  const handleToggleTagFilter = (catId: string) => {
    setSelectedTagFilters(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    );
    setCurrentPage(1);
  };

  const handleToggleFormTag = (catId: string) => {
    setFormTags(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    );
  };

  // Filter Logic
  const filteredVocabularies = vocabularies.filter((item) => {
    if (articleFilter !== "all" && item.article !== articleFilter) return false;
    if (posFilter !== "all" && item.partOfSpeech !== posFilter) return false;

    // Filter by selected tags
    if (selectedTagFilters.length > 0) {
      const hasMatchingTag = item.tags && item.tags.some(t => selectedTagFilters.includes(t));
      if (!hasMatchingTag) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchWord = item.word.toLowerCase().includes(q);
      const matchMeaning = item.meaning.toLowerCase().includes(q);
      const matchPlural = (item.plural || "").toLowerCase().includes(q);
      const matchExample = (item.example || "").toLowerCase().includes(q);
      return matchWord || matchMeaning || matchPlural || matchExample;
    }
    return true;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredVocabularies.length / itemsPerPage) || 1;
  const paginatedItems = filteredVocabularies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Live Suggestions for Search Input
  const suggestedVocabs = useMemo(() => {
    if (!localSearchQuery.trim()) return [];
    const q = localSearchQuery.toLowerCase().trim();
    return vocabularies
      .filter((v) =>
        v.word.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q) ||
        (v.plural && v.plural.toLowerCase().includes(q))
      )
      .slice(0, 7);
  }, [vocabularies, localSearchQuery]);

  const highlightMatch = (text: string, query: string) => {
    if (!query || !query.trim() || !text) return text;
    const parts = text.split(new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.trim().toLowerCase() ? (
        <mark key={i} className="bg-amber-200 text-amber-950 font-bold rounded-xs px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Helper Badges
  const getArticleBadge = (art: ArticleType) => {
    switch (art) {
      case "der":
        return <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">der</span>;
      case "die":
        return <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold text-white border border-[#d25c9b] uppercase tracking-wide" style={{ backgroundColor: "#e673b1" }}>die</span>;
      case "das":
        return <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wide">das</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 font-mono">–</span>;
    }
  };

  const getPosLabel = (pos: PartOfSpeech) => {
    switch (pos) {
      case "noun": return locale === "fa" ? "اسم (Nomen)" : "Noun";
      case "adjective": return locale === "fa" ? "صفت (Adjektiv)" : "Adjective";
      case "adverb": return locale === "fa" ? "قید (Adverb)" : "Adverb";
      case "preposition": return locale === "fa" ? "حرف اضافه" : "Preposition";
      case "expression": return locale === "fa" ? "اصطلاح / عبارت" : "Expression";
      case "verb_phrase": return locale === "fa" ? "عبارت فعلی" : "Verb Phrase";
      case "pronoun": return locale === "fa" ? "ضمیر" : "Pronoun";
      case "conjunction": return locale === "fa" ? "حرف ربط" : "Conjunction";
      default: return pos;
    }
  };

  const sampleJsonTemplate = `[
  {
    "article": "der",
    "word": "Tisch",
    "meaning": "میز",
    "plural": "die Tische",
    "partOfSpeech": "noun",
    "example": "Der Tisch steht im Zimmer.",
    "tags": ["vcat_a1"]
  },
  {
    "article": "das",
    "word": "Buch",
    "meaning": "کتاب",
    "plural": "die Bücher",
    "partOfSpeech": "noun"
  }
]`;

  return (
    <div className={`space-y-6 relative ${isRtl ? "text-right" : "text-left"}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 text-sm font-vazir animate-in fade-in duration-200">
          <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="mr-2 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Navigation & Sub-Tabs Switcher */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <BookMarked className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 font-vazir">
                {locale === "fa" ? "بخش واژگان و اصطلاحات (Wortschatz)" : "Vocabulary & Phrases"}
              </h2>
              <p className="text-xs text-slate-500 font-vazir">
                {locale === "fa"
                  ? "مدیریت لغات، دسته‌بندی با تگ‌ها، فایل‌های JSON و گروه‌های مترادف/متضاد"
                  : "Manage German vocabulary, tags, bulk JSON imports & synonym groups"}
              </p>
            </div>
          </div>

          {/* Sub Tab Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 font-vazir text-xs font-bold">
            <button
              onClick={() => setActiveSubTab("bank")}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === "bank"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BookMarked className="w-4 h-4" />
              <span>{locale === "fa" ? "بانک واژگان" : "Word Bank"}</span>
            </button>

            <button
              onClick={() => setActiveSubTab("synonym_antonym")}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === "synonym_antonym"
                  ? "bg-white text-purple-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>{locale === "fa" ? "شبکه‌های واژگانی" : "Lexical Networks"}</span>
            </button>

            <button
              onClick={() => setActiveSubTab("categories")}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === "categories"
                  ? "bg-white text-emerald-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>{locale === "fa" ? "مدیریت تگ‌ها" : "Tag Categories"}</span>
            </button>
          </div>
        </div>

        {/* Action Controls for Bank Sub-Tab */}
        {activeSubTab === "bank" && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleOpenAddModal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs flex items-center gap-1.5 font-vazir cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {locale === "fa" ? "+ افزودن واژه جدید" : "+ Add Word"}
              </button>

              <button
                onClick={() => setShowJsonImportModal(true)}
                className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 font-vazir cursor-pointer"
              >
                <FileJson className="w-4 h-4 text-purple-600" />
                {locale === "fa" ? "افزودن با فایل JSON" : "Bulk Import JSON"}
              </button>

              <button
                onClick={handleExportJSON}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors flex items-center gap-1.5 font-vazir cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {locale === "fa" ? "خروجی واژگان" : "Export Vocab"}
              </button>

              <button
                onClick={handleExportFullBackup}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 font-vazir cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                {locale === "fa" ? "دانلود بکاپ کل برنامه (JSON)" : "Export Full Backup"}
              </button>

              <label className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 font-vazir cursor-pointer">
                <Upload className="w-4 h-4 text-amber-600" />
                <span>{locale === "fa" ? "بازیابی بکاپ کل برنامه" : "Restore Full Backup"}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFullBackup}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={handleResetVocabularies}
              title={locale === "fa" ? "بازیابی واژگان نمونه" : "Reset to Defaults"}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Render Sub-Tab Views */}
      {activeSubTab === "synonym_antonym" ? (
        <SynonymAntonymManager locale={locale} />
      ) : activeSubTab === "categories" ? (
        <VocabularyCategoryManager
          locale={locale}
          selectedCategories={selectedTagFilters}
          onToggleCategory={handleToggleTagFilter}
          onClearCategories={() => setSelectedTagFilters([])}
        />
      ) : (
        /* Default Vocabulary Bank View */
        <div className="space-y-6">
          {/* Tag Category Filter Bar */}
          <VocabularyCategoryManager
            locale={locale}
            selectedCategories={selectedTagFilters}
            onToggleCategory={handleToggleTagFilter}
            onClearCategories={() => setSelectedTagFilters([])}
          />

          {/* Search, Filter & Quick Add Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Search & Filters */}
            <div className="lg:col-span-8 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1" ref={searchContainerRef}>
                  <Search className={`w-4 h-4 text-slate-400 absolute top-3 ${isRtl ? "right-3" : "left-3"}`} />
                  <input
                    type="text"
                    value={localSearchQuery}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSuggestionIndex(prev => Math.min(prev + 1, suggestedVocabs.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSuggestionIndex(prev => Math.max(prev - 1, -1));
                      } else if (e.key === "Enter" && suggestionIndex >= 0 && suggestedVocabs[suggestionIndex]) {
                        e.preventDefault();
                        setLocalSearchQuery(suggestedVocabs[suggestionIndex].word);
                        setShowSuggestions(false);
                      } else if (e.key === "Escape") {
                        setShowSuggestions(false);
                      }
                    }}
                    onChange={(e) => {
                      setLocalSearchQuery(e.target.value);
                      setShowSuggestions(true);
                      setSuggestionIndex(-1);
                    }}
                    placeholder={locale === "fa" ? "جستجوی واژه، معنی، جمع یا نمونه..." : "Search word, meaning, example..."}
                    className={`w-full py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-vazir ${
                      isRtl ? "pr-9 pl-3 text-right" : "pl-9 pr-3 text-left"
                    }`}
                  />
                  {localSearchQuery && (
                    <button
                      onClick={() => {
                        setLocalSearchQuery("");
                        setSearchQuery("");
                        setShowSuggestions(false);
                      }}
                      className={`absolute top-2.5 ${isRtl ? "left-2.5" : "right-2.5"} text-slate-400 hover:text-slate-600`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {/* Search Live Suggestions Dropdown */}
                  {showSuggestions && suggestedVocabs.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden font-vazir text-xs divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {suggestedVocabs.map((vItem, sIdx) => (
                        <div
                          key={vItem.id}
                          onClick={() => {
                            setLocalSearchQuery(vItem.word);
                            setShowSuggestions(false);
                          }}
                          className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                            sIdx === suggestionIndex ? "bg-indigo-50 text-indigo-900 font-bold" : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {getArticleBadge(vItem.article)}
                            <span className="font-extrabold font-sans text-slate-900">{vItem.word}</span>
                          </div>
                          <span className="text-slate-500 text-[11px] truncate max-w-[150px]">{vItem.meaning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                  <button
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-lg text-xs cursor-pointer ${
                      viewMode === "table" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded-lg text-xs cursor-pointer ${
                      viewMode === "grid" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Article & POS Filters */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs font-vazir">
                <span className="text-slate-400 text-[11px] flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  آرتیکل:
                </span>
                <button
                  onClick={() => { setArticleFilter("all"); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                    articleFilter === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  همه
                </button>
                <button
                  onClick={() => { setArticleFilter("der"); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer ${
                    articleFilter === "der" ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  der
                </button>
                <button
                  onClick={() => { setArticleFilter("die"); setCurrentPage(1); }}
                  style={articleFilter === "die" ? { backgroundColor: "#e673b1", borderColor: "#d25c9b" } : {}}
                  className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer ${
                    articleFilter === "die" ? "text-white" : "bg-purple-50 text-[#e673b1] border-purple-200"
                  }`}
                >
                  die
                </button>
                <button
                  onClick={() => { setArticleFilter("das"); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer ${
                    articleFilter === "das" ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  das
                </button>
                <button
                  onClick={() => { setArticleFilter("none"); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                    articleFilter === "none" ? "bg-slate-700 text-white border-slate-700" : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  بدون آرتیکل
                </button>

                <span className="text-slate-300 mx-1">|</span>

                <select
                  value={posFilter}
                  onChange={(e) => { setPosFilter(e.target.value as any); setCurrentPage(1); }}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                >
                  <option value="all">تمام نقش‌های واژه</option>
                  <option value="noun">اسم (Nomen)</option>
                  <option value="adjective">صفت (Adjektiv)</option>
                  <option value="adverb">قید (Adverb)</option>
                  <option value="preposition">حرف اضافه</option>
                  <option value="expression">اصطلاح / عبارت</option>
                  <option value="verb_phrase">عبارت فعلی</option>
                  <option value="pronoun">ضمیر</option>
                  <option value="conjunction">حرف ربط</option>
                </select>
              </div>
            </div>

            {/* Quick Add Card */}
            <div className="lg:col-span-4 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-vazir">
                <PlusCircle className="w-4 h-4 text-indigo-600" />
                افزودن سریع واژه (واژه - معنی)
              </label>
              <form onSubmit={handleQuickAdd} className="flex gap-2">
                <input
                  type="text"
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  placeholder="مثلاً: der Tisch - میز"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-vazir"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold font-vazir cursor-pointer"
                >
                  ثبت
                </button>
              </form>
            </div>
          </div>

          {/* Content Table / Cards */}
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400 font-vazir">
              در حال بارگذاری واژگان...
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 font-vazir">
              <BookMarked className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-700">هیچ واژه‌ای یافت نشد!</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                عبارت دیگری را جستجو کنید یا فیلترها را تغییر دهید.
              </p>
            </div>
          ) : viewMode === "table" ? (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-vazir text-xs">
                      <th className="py-3 px-3 text-center font-bold w-16"># / ترتیب</th>
                      <th className="py-3 px-3 text-center font-bold w-20">آرتیکل</th>
                      <th className="py-3 px-3 font-bold">واژه / کلمه</th>
                      <th className="py-3 px-3 font-bold">معنی / ترجمه</th>
                      <th className="py-3 px-3 font-bold">حالت جمع (Plural)</th>
                      <th className="py-3 px-3 font-bold">نقش واژه</th>
                      <th className="py-3 px-3 font-bold">تگ‌ها</th>
                      <th className="py-3 px-3 font-bold">جمله نمونه</th>
                      <th className="py-3 px-3 text-center font-bold w-20">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.map((item, idx) => {
                      const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                      const isFirst = idx === 0 && currentPage === 1;
                      const isLast = idx === paginatedItems.length - 1 && currentPage === totalPages;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-2 text-center font-mono text-slate-400 text-xs">
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-bold text-slate-500 w-5">{globalIdx}</span>
                              <div className="flex flex-col gap-0.5">
                                <button
                                  disabled={isFirst}
                                  onClick={() => handleMoveVocab(idx, "up")}
                                  className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer"
                                  title="انتقال به بالا"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={isLast}
                                  onClick={() => handleMoveVocab(idx, "down")}
                                  className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer"
                                  title="انتقال به پایین"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {getArticleBadge(item.article)}
                          </td>
                          <td className="py-3.5 px-3 font-extrabold text-slate-900 text-sm font-sans tracking-tight">
                            {highlightMatch(item.word, searchQuery)}
                          </td>
                          <td className="py-3.5 px-3 font-bold text-slate-800 font-vazir">
                            {item.meaning ? highlightMatch(item.meaning, searchQuery) : <span className="text-slate-300 text-xs">ثبت نشده</span>}
                          </td>
                          <td className="py-3.5 px-3 font-sans text-slate-700">
                            {item.plural ? highlightMatch(item.plural, searchQuery) : <span className="text-slate-300 font-mono text-xs">–</span>}
                          </td>
                          <td className="py-3.5 px-3 text-xs text-slate-600 font-vazir">
                            {getPosLabel(item.partOfSpeech)}
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {item.tags && item.tags.length > 0 ? (
                                item.tags.map(tagId => {
                                  const tagObj = vocabCategories.find(c => c.id === tagId);
                                  return (
                                    <span
                                      key={tagId}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-vazir ${
                                        tagObj ? tagObj.color : "bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {tagObj ? tagObj.name : tagId}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-slate-300 text-xs">–</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-xs text-slate-600 max-w-xs truncate font-vazir">
                            {item.example ? (
                              <span title={item.example} className="text-slate-700 italic font-sans block truncate">
                                "{highlightMatch(item.example, searchQuery)}"
                              </span>
                            ) : (
                              <span className="text-slate-300">–</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleAiEnrichExistingItem(item)}
                                disabled={aiLoading}
                                title="تکمیل کامل هوشمند با AI"
                                className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg cursor-pointer transition-colors"
                              >
                                <Sparkles className="w-4 h-4 text-purple-600" />
                              </button>
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {paginatedItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3 flex flex-col justify-between hover:border-indigo-300 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {getArticleBadge(item.article)}
                        <span className="text-base font-extrabold text-slate-900 font-sans">{item.word}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleOpenEditModal(item)} className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item)} className="p-1 text-slate-400 hover:text-red-600 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-sm font-bold text-slate-800 font-vazir">{item.meaning}</div>

                    {item.plural && (
                      <div className="text-xs text-slate-500 font-vazir">
                        <span className="text-slate-400">جمع: </span>
                        <span className="font-sans font-semibold text-slate-700">{item.plural}</span>
                      </div>
                    )}

                    {item.example && (
                      <div className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded-xl border border-slate-100 font-sans">
                        "{item.example}"
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[11px] text-slate-400 font-vazir">
                    <span>{getPosLabel(item.partOfSpeech)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-xs">
              <span className="text-xs text-slate-500 font-vazir">
                صفحه {currentPage} از {totalPages} (کل: {filteredVocabularies.length} واژه)
              </span>
              <div className="flex gap-2 font-vazir">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  قبلی
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                >
                  بعدی
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk JSON Import Modal Dialog */}
      {showJsonImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200 ${isRtl ? "text-right" : "text-left"}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-vazir">
                <FileJson className="w-5 h-5 text-purple-600" />
                {locale === "fa" ? "درون‌ریزی انبوه واژگان با فایل JSON" : "Bulk Import Vocabulary via JSON"}
              </h3>
              <button onClick={() => setShowJsonImportModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 font-vazir leading-relaxed">
              شما می‌توانید یک فایل <code className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-mono">.json</code> انتخاب کنید یا کدهای JSON استاندارد را در کادر زیر کپی کنید:
            </p>

            {/* File Select */}
            <div className="border-2 border-dashed border-purple-200 hover:border-purple-400 rounded-2xl p-4 text-center bg-purple-50/40 transition-colors">
              <Upload className="w-8 h-8 text-purple-500 mx-auto mb-2" />
              <label className="text-xs font-bold text-purple-700 cursor-pointer block font-vazir">
                انتخاب فایل JSON از کامپیوتر
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 font-vazir block">
                یا کپی مستقیم کدهای JSON:
              </label>
              <textarea
                rows={5}
                value={jsonInputText}
                onChange={(e) => setJsonInputText(e.target.value)}
                placeholder={sampleJsonTemplate}
                className="w-full p-3 bg-slate-900 text-emerald-400 border border-slate-800 rounded-xl font-mono text-xs focus:outline-none"
              />
            </div>

            {/* AI Toggle */}
            <label className="flex items-center gap-2 p-3 bg-purple-50/80 border border-purple-200 rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={enableAiJsonImport}
                onChange={(e) => setEnableAiJsonImport(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 accent-purple-600 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 font-vazir">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>تکمیل و غنی‌سازی تمامی فیلدهای واژگان با هوش مصنوعی (آرتیکل، جمع، معنی، جمله نمونه و توضیحات)</span>
              </div>
            </label>

            {jsonImportError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-vazir flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap">{jsonImportError}</span>
              </div>
            )}

            {jsonImportSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-vazir flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{jsonImportSuccess}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 font-vazir">
              <button
                type="button"
                onClick={() => setShowJsonImportModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => processJsonImport(jsonInputText)}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs shadow-xs"
              >
                پردازش و ذخیره واژگان
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Word Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200 ${isRtl ? "text-right" : "text-left"}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-vazir">
                <BookMarked className="w-5 h-5 text-indigo-600" />
                {editingItem ? "ویرایش واژه" : "افزودن واژه جدید"}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 font-vazir">
              {/* AI Auto-Fill Action Header */}
              <div className="bg-purple-50 border border-purple-200 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>تکمیل هوشمند اطلاعات واژه با هوش مصنوعی</span>
                </div>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleAiFillSingleWord}
                  className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin text-amber-300" : ""}`} />
                  {aiLoading ? "در حال تحلیل AI..." : "تکمیل خودکار تمامی فیلدها با AI"}
                </button>
              </div>

              {/* Article Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  آرتیکل (Grammatikalischem Geschlecht)
                </label>
                <div className="grid grid-cols-4 gap-2 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setFormArticle("der")}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                      formArticle === "der" ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-800 border-blue-200"
                    }`}
                  >
                    der (مذکر)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormArticle("die")}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                      formArticle === "die" ? "bg-rose-600 text-white border-rose-600" : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    die (مونث)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormArticle("das")}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                      formArticle === "das" ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    das (خنثی)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormArticle("none")}
                    className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                      formArticle === "none" ? "bg-slate-700 text-white border-slate-700" : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    بدون آرتیکل
                  </button>
                </div>
              </div>

              {/* Word & Plural */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    واژه آلمانی (Wort) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formWord}
                    onChange={(e) => setFormWord(e.target.value)}
                    placeholder="e.g. Tisch, Buch, schnell"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    حالت جمع (Plural - اختیاری)
                  </label>
                  <input
                    type="text"
                    value={formPlural}
                    onChange={(e) => setFormPlural(e.target.value)}
                    placeholder="e.g. die Tische, die Bücher"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Meaning & POS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">معنی / ترجمه</label>
                  <input
                    type="text"
                    value={formMeaning}
                    onChange={(e) => setFormMeaning(e.target.value)}
                    placeholder="e.g. میز، کتاب، سریع"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 font-vazir focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">نقش واژه (Wortart)</label>
                  <select
                    value={formPos}
                    onChange={(e) => setFormPos(e.target.value as PartOfSpeech)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 font-vazir focus:outline-none"
                  >
                    <option value="noun">اسم (Nomen)</option>
                    <option value="adjective">صفت (Adjektiv)</option>
                    <option value="adverb">قید (Adverb)</option>
                    <option value="preposition">حرف اضافه</option>
                    <option value="expression">اصطلاح / عبارت</option>
                    <option value="verb_phrase">عبارت فعلی</option>
                    <option value="pronoun">ضمیر</option>
                    <option value="conjunction">حرف ربط</option>
                  </select>
                </div>
              </div>

              {/* Category Tags Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  تگ‌ها و دسته‌بندی‌های این واژه:
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {vocabCategories.map((cat) => {
                    const isChecked = formTags.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleToggleFormTag(cat.id)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          cat.color || "bg-slate-100 text-slate-800"
                        } ${isChecked ? "ring-2 ring-indigo-600 shadow-xs" : "opacity-60"}`}
                      >
                        {cat.name} {isChecked && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Example */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">جمله نمونه (Beispielsatz)</label>
                <input
                  type="text"
                  value={formExample}
                  onChange={(e) => setFormExample(e.target.value)}
                  placeholder="e.g. Der Tisch steht im Wohnzimmer."
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 font-sans focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                >
                  {editingItem ? "ذخیره تغییرات" : "ثبت واژه"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
