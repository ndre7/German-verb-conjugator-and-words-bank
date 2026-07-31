import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  X,
  Search,
  BookOpen,
  ArrowRightLeft,
  Layers,
  Check,
  Tag,
  GitFork,
  Globe,
  BookmarkPlus,
  MessageSquare
} from "lucide-react";
import { dbService } from "../DatabaseService";
import { SynonymAntonymGroup, ArticleType, SynonymAntonymType, PartOfSpeech, VocabularyItem } from "../types";
import { Locale } from "../translations";

interface SynonymAntonymManagerProps {
  locale: Locale;
}

export default function SynonymAntonymManager({ locale }: SynonymAntonymManagerProps) {
  const isRtl = locale === "fa";

  const [groups, setGroups] = useState<SynonymAntonymGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | SynonymAntonymType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal / Form State
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SynonymAntonymGroup | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<SynonymAntonymType>("synonym");
  const [formNotes, setFormNotes] = useState("");
  const [formItems, setFormItems] = useState<{
    word: string;
    article?: ArticleType;
    partOfSpeech?: PartOfSpeech;
    meaning?: string;
    comparative?: string;
    superlative?: string;
  }>([
    { word: "", article: "none", partOfSpeech: "noun", meaning: "", comparative: "", superlative: "" },
    { word: "", article: "none", partOfSpeech: "noun", meaning: "", comparative: "", superlative: "" }
  ]);

  // AI States
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiGenerateModal, setShowAiGenerateModal] = useState(false);
  const [aiTopicInput, setAiTopicInput] = useState("");
  const [aiTypeInput, setAiTypeInput] = useState<SynonymAntonymType>("synonym");

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const list = await dbService.getSynonymAntonymGroups();
      setGroups(list);
    } catch (e) {
      console.error("Error loading synonym/antonym groups:", e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // AI Complete Group in Modal
  const handleAiCompleteModalGroup = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/gemini/synonyms-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "complete_group",
          type: formType,
          currentGroup: {
            title: formTitle || "گروه شبکه واژگانی",
            type: formType,
            items: formItems.filter(i => i.word.trim()),
            notes: formNotes
          }
        })
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        if (d.title && !formTitle.trim()) setFormTitle(d.title);
        if (d.type) setFormType(d.type);
        if (Array.isArray(d.items) && d.items.length > 0) {
          const newItems = d.items.map((it: any) => ({
            word: (it.word || "").replace(/^(der|die|das)\s+/i, "").trim(),
            article: (it.article && ["der", "die", "das", "none"].includes(it.article)) ? it.article : "none",
            partOfSpeech: it.partOfSpeech || (formType === "comparative_adjective" ? "adjective" : "noun"),
            meaning: it.meaning || "",
            comparative: it.comparative || "",
            superlative: it.superlative || ""
          }));
          setFormItems(newItems);
        }
        if (d.notes) setFormNotes(d.notes);
        showToast(locale === "fa" ? "اطلاعات گروه، آرتیکل‌ها، نوع واژه و نکات با AI تکمیل شدند ✨" : "Group filled with AI ✨");
      } else {
        alert(result.userMessage || result.error || "خطا در هوش مصنوعی");
      }
    } catch (err: any) {
      alert("خطا: " + (err.message || err));
    } finally {
      setAiLoading(false);
    }
  };

  // AI Create New Group
  const handleAiCreateNewGroup = async () => {
    if (!aiTopicInput.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/gemini/synonyms-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "new_group",
          topic: aiTopicInput,
          type: aiTypeInput
        })
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        const validItems = (Array.isArray(d.items) ? d.items : []).map((it: any) => ({
          word: (it.word || "").replace(/^(der|die|das)\s+/i, "").trim(),
          article: (it.article && ["der", "die", "das", "none"].includes(it.article)) ? it.article : "none",
          partOfSpeech: it.partOfSpeech || (aiTypeInput === "comparative_adjective" ? "adjective" : "noun"),
          meaning: (it.meaning || "").trim(),
          comparative: (it.comparative || "").trim(),
          superlative: (it.superlative || "").trim()
        })).filter((it: any) => it.word.length > 0);

        const newGrp: SynonymAntonymGroup = {
          id: `syn_ant_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: d.title || `گروه ${aiTopicInput}`,
          type: d.type || aiTypeInput,
          items: validItems,
          notes: d.notes || "",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        await dbService.saveSynonymAntonymGroup(newGrp);
        await loadGroups();
        setShowAiGenerateModal(false);
        setAiTopicInput("");
        showToast(locale === "fa" ? `گروه جدید "${newGrp.title}" با هوش مصنوعی ساخته شد ✨` : `New group created with AI ✨`);
      } else {
        alert(result.userMessage || result.error || "خطا در ساخت گروه با هوش مصنوعی");
      }
    } catch (err: any) {
      alert("خطا: " + (err.message || err));
    } finally {
      setAiLoading(false);
    }
  };

  const handleOpenAddModal = (type: SynonymAntonymType = "synonym") => {
    setEditingGroup(null);
    setFormTitle("");
    setFormType(type);
    setFormNotes("");
    setFormItems([
      { word: "", article: "none", partOfSpeech: type === "comparative_adjective" ? "adjective" : "noun", meaning: "", comparative: "", superlative: "" },
      { word: "", article: "none", partOfSpeech: type === "comparative_adjective" ? "adjective" : "noun", meaning: "", comparative: "", superlative: "" }
    ]);
    setShowModal(true);
  };

  const handleOpenEditModal = (group: SynonymAntonymGroup) => {
    setEditingGroup(group);
    setFormTitle(group.title);
    setFormType(group.type);
    setFormNotes(group.notes || "");
    setFormItems(
      group.items && group.items.length > 0
        ? group.items.map(i => ({
            word: i.word.replace(/^(der|die|das)\s+/i, "").trim(),
            article: i.article || "none",
            partOfSpeech: i.partOfSpeech || (group.type === "comparative_adjective" ? "adjective" : "noun"),
            meaning: i.meaning || "",
            comparative: i.comparative || "",
            superlative: i.superlative || ""
          }))
        : [
            { word: "", article: "none", partOfSpeech: group.type === "comparative_adjective" ? "adjective" : "noun", meaning: "", comparative: "", superlative: "" },
            { word: "", article: "none", partOfSpeech: group.type === "comparative_adjective" ? "adjective" : "noun", meaning: "", comparative: "", superlative: "" }
          ]
    );
    setShowModal(true);
  };

  const handleAddItemRow = () => {
    setFormItems(prev => [...prev, { word: "", article: "none", partOfSpeech: formType === "comparative_adjective" ? "adjective" : "noun", meaning: "", comparative: "", superlative: "" }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (formItems.length <= 1) {
      alert(locale === "fa" ? "حداقل یک واژه باید در فرم باشد." : "At least 1 item required.");
      return;
    }
    setFormItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (
    index: number,
    field: "word" | "article" | "partOfSpeech" | "meaning" | "comparative" | "superlative",
    value: string
  ) => {
    setFormItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    // Filter valid non-empty items
    const validItems = formItems
      .filter(i => i.word.trim().length > 0)
      .map(i => ({
        word: i.word.replace(/^(der|die|das)\s+/i, "").trim(),
        article: i.article || "none",
        partOfSpeech: i.partOfSpeech || (formType === "comparative_adjective" ? "adjective" : "noun"),
        meaning: i.meaning ? i.meaning.trim() : "",
        comparative: i.comparative ? i.comparative.trim() : "",
        superlative: i.superlative ? i.superlative.trim() : ""
      }));

    if (validItems.length < 1) {
      alert(
        locale === "fa"
          ? "لطفاً حداقل یک واژه برای این گروه وارد کنید."
          : "Please enter at least 1 word for this group."
      );
      return;
    }

    const newGroup: SynonymAntonymGroup = {
      id: editingGroup ? editingGroup.id : `syn_ant_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: formTitle.trim(),
      type: formType,
      items: validItems,
      notes: formNotes.trim(),
      createdAt: editingGroup ? editingGroup.createdAt : Date.now(),
      updatedAt: Date.now()
    };

    await dbService.saveSynonymAntonymGroup(newGroup);
    setShowModal(false);
    await loadGroups();

    showToast(
      locale === "fa"
        ? `گروه "${newGroup.title}" ذخیره شد.`
        : `Group "${newGroup.title}" saved successfully.`
    );
  };

  const handleDeleteGroup = async (group: SynonymAntonymGroup) => {
    const confirmMsg = locale === "fa"
      ? `آیا از حذف گروه "${group.title}" اطمینان دارید؟`
      : `Delete group "${group.title}"?`;

    if (window.confirm(confirmMsg)) {
      await dbService.deleteSynonymAntonymGroup(group.id);
      await loadGroups();
      showToast(locale === "fa" ? `گروه "${group.title}" با موفقیت حذف شد.` : `Group deleted.`);
    }
  };

  // Add Item from group card to main Vocabulary Bank
  const handleAddToVocabBank = async (item: { word: string; article?: ArticleType; partOfSpeech?: PartOfSpeech; meaning?: string }) => {
    try {
      const cleanWord = item.word.replace(/^(der|die|das)\s+/i, "").trim();
      if (!cleanWord) return;

      const existingVocabs = await dbService.getVocabularies();
      const duplicate = existingVocabs.find(
        v => v.word.trim().toLowerCase() === cleanWord.toLowerCase()
      );

      if (duplicate) {
        showToast(
          locale === "fa"
            ? `واژه "${cleanWord}" از قبل در جدول واژگان وجود دارد.`
            : `Word "${cleanWord}" already exists in the vocabulary table.`
        );
        return;
      }

      const newItem: VocabularyItem = {
        id: `vocab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        article: item.article || "none",
        word: cleanWord,
        meaning: item.meaning || "",
        partOfSpeech: item.partOfSpeech || "noun",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await dbService.saveVocabulary(newItem);
      showToast(
        locale === "fa"
          ? `واژه "${cleanWord}" به بانک اصلی واژگان اضافه شد ✨`
          : `Word "${cleanWord}" added to main Vocabulary Bank ✨`
      );
    } catch (err: any) {
      alert("خطا در افزودن واژه: " + err.message);
    }
  };

  // Article Badge
  const renderArticleBadge = (article?: ArticleType) => {
    if (!article || article === "none") return null;
    if (article === "der") {
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-blue-100 text-blue-800 border border-blue-300 font-sans shrink-0">
          der
        </span>
      );
    }
    if (article === "die") {
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 text-rose-800 border border-rose-300 font-sans shrink-0">
          die
        </span>
      );
    }
    if (article === "das") {
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-sans shrink-0">
          das
        </span>
      );
    }
    return null;
  };

  // Part of Speech Badge Helper
  const renderPartOfSpeechBadge = (pos?: PartOfSpeech) => {
    if (!pos) return null;
    const mapFa: Record<string, string> = {
      noun: "اسم",
      verb_phrase: "فعل",
      adjective: "صفت",
      adverb: "قید",
      preposition: "حرف اضافه",
      pronoun: "ضمیر",
      conjunction: "حرف ربط",
      expression: "اصطلاح"
    };
    const label = locale === "fa" ? (mapFa[pos] || pos) : pos;

    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 font-vazir shrink-0">
        {label}
      </span>
    );
  };

  // Group Type Badge
  const renderTypeBadge = (type: SynonymAntonymType) => {
    switch (type) {
      case "synonym":
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold font-vazir bg-purple-100 text-purple-800 border border-purple-300 shrink-0">
            {locale === "fa" ? "مترادف" : "Synonym"}
          </span>
        );
      case "antonym":
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold font-vazir bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
            {locale === "fa" ? "متضاد" : "Antonym"}
          </span>
        );
      case "word_family":
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold font-vazir bg-indigo-100 text-indigo-800 border border-indigo-300 shrink-0 flex items-center gap-1">
            <GitFork className="w-3 h-3" />
            {locale === "fa" ? "هم‌خانواده" : "Wortfamilie"}
          </span>
        );
      case "semantic_field":
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold font-vazir bg-teal-100 text-teal-800 border border-teal-300 shrink-0 flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {locale === "fa" ? "میدان معنایی" : "Wortfeld"}
          </span>
        );
      case "idiom":
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold font-vazir bg-rose-100 text-rose-800 border border-rose-300 shrink-0 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {locale === "fa" ? "اصطلاحات" : "Idioms"}
          </span>
        );
      case "comparative_adjective":
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold font-vazir bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            {locale === "fa" ? "صفات مقایسه‌ای" : "Comparative"}
          </span>
        );
    }
  };

  // Filtering
  const filteredGroups = groups.filter(g => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = g.title.toLowerCase().includes(q);
      const matchNotes = (g.notes || "").toLowerCase().includes(q);
      const matchItem = g.items.some(
        i => i.word.toLowerCase().includes(q) || (i.meaning || "").toLowerCase().includes(q) || (i.comparative || "").toLowerCase().includes(q) || (i.superlative || "").toLowerCase().includes(q)
      );
      return matchTitle || matchNotes || matchItem;
    }
    return true;
  });

  const synonymCount = groups.filter(g => g.type === "synonym").length;
  const antonymCount = groups.filter(g => g.type === "antonym").length;
  const wordFamilyCount = groups.filter(g => g.type === "word_family").length;
  const semanticFieldCount = groups.filter(g => g.type === "semantic_field").length;
  const idiomCount = groups.filter(g => g.type === "idiom").length;
  const comparativeCount = groups.filter(g => g.type === "comparative_adjective").length;

  return (
    <div className={`space-y-6 ${isRtl ? "text-right" : "text-left"}`}>
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

      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100 shrink-0">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-vazir">
                {locale === "fa" ? "شبکه‌های واژگانی (مترادف، متضاد، هم‌خانواده، میدان معنایی، اصطلاحات، صفات مقایسه‌ای)" : "German Vocab Networks & Comparative Adjectives"}
              </h2>
              <p className="text-xs text-slate-500 font-vazir">
                {locale === "fa"
                  ? "سازماندهی ارتباطات کلمات: مترادف‌ها، متضادها، کلمات هم‌خانواده، میدان معنایی مشترک، اصطلاحات کاربردی و صفات مقایسه‌ای (پایه، برتر، برترین)"
                  : "Organize vocabulary networks: Synonyms, Antonyms, Word Families, Semantic Fields, Idioms & Comparative Adjectives"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAiGenerateModal(true)}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs flex items-center gap-1.5 font-vazir cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              {locale === "fa" ? "ایجاد گروه با AI ✨" : "Create Group with AI ✨"}
            </button>
            <button
              onClick={() => handleOpenAddModal("synonym")}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1 font-vazir cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {locale === "fa" ? "+ مترادف" : "+ Synonym"}
            </button>
            <button
              onClick={() => handleOpenAddModal("antonym")}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1 font-vazir cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {locale === "fa" ? "+ متضاد" : "+ Antonym"}
            </button>
            <button
              onClick={() => handleOpenAddModal("word_family")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1 font-vazir cursor-pointer"
            >
              <GitFork className="w-3.5 h-3.5" />
              {locale === "fa" ? "+ هم‌خانواده" : "+ Family"}
            </button>
            <button
              onClick={() => handleOpenAddModal("semantic_field")}
              className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1 font-vazir cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === "fa" ? "+ میدان معنایی" : "+ Field"}
            </button>
            <button
              onClick={() => handleOpenAddModal("idiom")}
              className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1 font-vazir cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {locale === "fa" ? "+ اصطلاحات" : "+ Idioms"}
            </button>
            <button
              onClick={() => handleOpenAddModal("comparative_adjective")}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1 font-vazir cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {locale === "fa" ? "+ صفات مقایسه‌ای" : "+ Comparative"}
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 font-vazir text-xs flex-wrap">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                typeFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {locale === "fa" ? `همه (${groups.length})` : `All (${groups.length})`}
            </button>
            <button
              onClick={() => setTypeFilter("synonym")}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                typeFilter === "synonym" ? "bg-purple-600 text-white border-purple-600" : "bg-purple-50 text-purple-700 border-purple-200"
              }`}
            >
              {locale === "fa" ? `مترادف‌ها (${synonymCount})` : `Synonyms (${synonymCount})`}
            </button>
            <button
              onClick={() => setTypeFilter("antonym")}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                typeFilter === "antonym" ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {locale === "fa" ? `متضادها (${antonymCount})` : `Antonyms (${antonymCount})`}
            </button>
            <button
              onClick={() => setTypeFilter("word_family")}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                typeFilter === "word_family" ? "bg-indigo-600 text-white border-indigo-600" : "bg-indigo-50 text-indigo-700 border-indigo-200"
              }`}
            >
              {locale === "fa" ? `هم‌خانواده (${wordFamilyCount})` : `Families (${wordFamilyCount})`}
            </button>
            <button
              onClick={() => setTypeFilter("semantic_field")}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                typeFilter === "semantic_field" ? "bg-teal-600 text-white border-teal-600" : "bg-teal-50 text-teal-700 border-teal-200"
              }`}
            >
              {locale === "fa" ? `میدان معنایی (${semanticFieldCount})` : `Fields (${semanticFieldCount})`}
            </button>
            <button
              onClick={() => setTypeFilter("idiom")}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                typeFilter === "idiom" ? "bg-rose-600 text-white border-rose-600" : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              {locale === "fa" ? `اصطلاحات (${idiomCount})` : `Idioms (${idiomCount})`}
            </button>
            <button
              onClick={() => setTypeFilter("comparative_adjective")}
              className={`px-3 py-1.5 rounded-xl border font-bold transition-colors cursor-pointer ${
                typeFilter === "comparative_adjective" ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {locale === "fa" ? `صفات مقایسه‌ای (${comparativeCount})` : `Comparative (${comparativeCount})`}
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className={`w-4 h-4 text-slate-400 absolute top-2.5 ${isRtl ? "right-3" : "left-3"}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={locale === "fa" ? "جستجوی واژه یا عنوان..." : "Search group or word..."}
              className={`w-full py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 font-vazir ${
                isRtl ? "pr-9 pl-3 text-right" : "pl-9 pr-3 text-left"
              }`}
            />
          </div>
        </div>
      </div>

      {/* Groups List Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-400 font-vazir">
          در حال بارگذاری شبکه‌های واژگانی...
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 font-vazir">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">هیچ گروهی در این بخش یافت نشد!</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            با استفاده از دکمه‌های بالا گروه جدید مترادف، متضاد، هم‌خانواده، میدان معنایی یا اصطلاحات بسازید.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGroups.map((group) => {
            return (
              <div
                key={group.id}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-3xl p-5 shadow-xs space-y-4 flex flex-col justify-between transition-all"
              >
                <div className="space-y-3">
                  {/* Group Header */}
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {renderTypeBadge(group.type)}
                      <h3 className="text-base font-extrabold text-slate-900 font-vazir">
                        {group.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(group)}
                        title={locale === "fa" ? "ویرایش گروه" : "Edit Group"}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        title={locale === "fa" ? "حذف گروه" : "Delete Group"}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Concise Point-Based Notes */}
                  {group.notes && (
                    <div className="text-xs text-slate-600 font-vazir bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 space-y-1 leading-relaxed">
                      <div className="font-bold text-slate-800 text-[11px] mb-1 flex items-center gap-1">
                        📌 <span>نکات کلیدی و کاربردی (موقعیت استفاده):</span>
                      </div>
                      <div className="whitespace-pre-line text-slate-700 font-vazir">
                        {group.notes}
                      </div>
                    </div>
                  )}

                  {/* Words List with Article & PartOfSpeech Badges + Add to Bank Button */}
                  {group.type === "comparative_adjective" ? (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-500 font-vazir px-2 pb-1 border-b border-slate-100">
                        <span className="col-span-3">صفت پایه (Positiv)</span>
                        <span className="col-span-3">معنی</span>
                        <span className="col-span-3">برتر (Komparativ)</span>
                        <span className="col-span-3">برترین (Superlativ)</span>
                      </div>
                      {group.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-12 items-center p-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 text-xs gap-1"
                        >
                          <div className="col-span-3 font-extrabold text-slate-900 font-sans truncate" title={item.word}>
                            {idx + 1}. {item.word}
                          </div>
                          <div className="col-span-3 text-slate-700 font-vazir truncate" title={item.meaning}>
                            {item.meaning || "—"}
                          </div>
                          <div className="col-span-3 font-bold text-purple-700 font-sans truncate" title={item.comparative}>
                            {item.comparative || "—"}
                          </div>
                          <div className="col-span-3 font-bold text-indigo-700 font-sans truncate flex items-center justify-between gap-1" title={item.superlative}>
                            <span className="truncate">{item.superlative || "—"}</span>
                            <button
                              onClick={() => handleAddToVocabBank(item)}
                              title={locale === "fa" ? "افزودن مستقیم به بانک اصلی واژگان" : "Add to main Vocab Bank"}
                              className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer shrink-0"
                            >
                              <BookmarkPlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      {group.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 bg-slate-50/50 text-xs gap-2"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-slate-400 text-[11px]">{idx + 1}.</span>
                            {renderArticleBadge(item.article)}
                            <span className="font-extrabold text-slate-900 text-sm font-sans">
                              {item.word}
                            </span>
                            {renderPartOfSpeechBadge(item.partOfSpeech)}
                          </div>

                          <div className="flex items-center gap-2">
                            {item.meaning && (
                              <span className="text-slate-700 font-bold font-vazir text-xs">
                                {item.meaning}
                              </span>
                            )}
                            <button
                              onClick={() => handleAddToVocabBank(item)}
                              title={locale === "fa" ? "افزودن مستقیم به بانک اصلی واژگان" : "Add to main Vocab Bank"}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1 font-vazir text-[11px]"
                            >
                              <BookmarkPlus className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">+ بانک</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-vazir flex justify-between items-center">
                  <span>{group.items.length} واژه/عبارت در این شبکه</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-print">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl p-4 sm:p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 ${isRtl ? "text-right" : "text-left"}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2 font-vazir">
                <ArrowRightLeft className="w-5 h-5 text-purple-600 shrink-0" />
                {editingGroup
                  ? (locale === "fa" ? "ویرایش گروه در شبکه واژگانی" : "Edit Group")
                  : (locale === "fa" ? "ایجاد گروه جدید در شبکه واژگانی" : "Create New Group")}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* AI Banner inside Modal */}
              <div className="bg-purple-50 border border-purple-200 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-900 font-vazir">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>تکمیل آرتیکل‌ها، نوع واژگان، صفات مقایسه‌ای، ترجمه‌ها و نکات با AI</span>
                </div>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleAiCompleteModalGroup}
                  className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 font-vazir shrink-0"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin text-amber-300" : ""}`} />
                  {aiLoading ? "در حال تحلیل AI..." : "تکمیل با AI"}
                </button>
              </div>

              {/* Type Switcher (6 Options) */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 text-xs font-bold font-vazir">
                <button
                  type="button"
                  onClick={() => setFormType("synonym")}
                  className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                    formType === "synonym"
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                      : "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100"
                  }`}
                >
                  مترادف‌ها
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("antonym")}
                  className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                    formType === "antonym"
                      ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                      : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                  }`}
                >
                  متضادها
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("word_family")}
                  className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                    formType === "word_family"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100"
                  }`}
                >
                  هم‌خانواده
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("semantic_field")}
                  className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                    formType === "semantic_field"
                      ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                      : "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100"
                  }`}
                >
                  میدان معنایی
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("idiom")}
                  className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                    formType === "idiom"
                      ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                      : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
                  }`}
                >
                  اصطلاحات
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("comparative_adjective")}
                  className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                    formType === "comparative_adjective"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                  }`}
                >
                  صفات مقایسه‌ای
                </button>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 font-vazir">
                  {locale === "fa" ? "عنوان گروه" : "Group Title"} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={
                    formType === "word_family"
                      ? "مثلاً: هم‌خانواده فعل fahren"
                      : formType === "semantic_field"
                      ? "مثلاً: میدان معنایی زمان (ساعت، روز، سال)"
                      : formType === "idiom"
                      ? "مثلاً: اصطلاحات احوالپرسی و تشکر در خرید"
                      : formType === "comparative_adjective"
                      ? "مثلاً: صفات توصیفی، صفات کیفیت و حالت"
                      : "مثلاً: مترادف‌های زیبایی، متضادهای دما..."
                  }
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 font-vazir"
                />
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 font-vazir">
                    {locale === "fa" ? "واژگان این گروه:" : "Words in this group:"}
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs text-purple-600 hover:text-purple-800 font-bold font-vazir flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {locale === "fa" ? "+ سطر جدید" : "+ Add Word"}
                  </button>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-2xl border border-slate-200/90 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400 w-5 text-center shrink-0">{idx + 1}.</span>

                        {formType !== "comparative_adjective" && (
                          <>
                            {/* Article Dropdown */}
                            <select
                              value={item.article || "none"}
                              onChange={(e) => handleItemChange(idx, "article", e.target.value)}
                              className="py-1 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer shrink-0"
                            >
                              <option value="none">– آرتیکل –</option>
                              <option value="der">der</option>
                              <option value="die">die</option>
                              <option value="das">das</option>
                            </select>

                            {/* Part of Speech Dropdown */}
                            <select
                              value={item.partOfSpeech || "noun"}
                              onChange={(e) => handleItemChange(idx, "partOfSpeech", e.target.value)}
                              className="py-1 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer shrink-0"
                            >
                              <option value="noun">اسم</option>
                              <option value="verb_phrase">فعل</option>
                              <option value="adjective">صفت</option>
                              <option value="adverb">قید</option>
                              <option value="preposition">حرف اضافه</option>
                              <option value="expression">اصطلاح</option>
                            </select>
                          </>
                        )}

                        {formType === "comparative_adjective" && (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-lg border border-emerald-200 font-vazir">
                            صفت مقایسه‌ای (Adjektiv)
                          </span>
                        )}

                        {/* Remove Row Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          title={locale === "fa" ? "حذف این واژه از سطر" : "Remove item"}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer mr-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {formType === "comparative_adjective" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 font-vazir block mb-0.5">صفت در حالت پایه (Positiv)</label>
                            <input
                              type="text"
                              value={item.word}
                              onChange={(e) => handleItemChange(idx, "word", e.target.value)}
                              placeholder="مثلاً: schön, gut, alt"
                              className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 font-vazir block mb-0.5">معنی صفت</label>
                            <input
                              type="text"
                              value={item.meaning || ""}
                              onChange={(e) => handleItemChange(idx, "meaning", e.target.value)}
                              placeholder="مثلاً: زیبا"
                              className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-vazir focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 font-vazir block mb-0.5">حالت برتر (Komparativ)</label>
                            <input
                              type="text"
                              value={item.comparative || ""}
                              onChange={(e) => handleItemChange(idx, "comparative", e.target.value)}
                              placeholder="مثلاً: schöner"
                              className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 font-vazir block mb-0.5">حالت برترین (Superlativ)</label>
                            <input
                              type="text"
                              value={item.superlative || ""}
                              onChange={(e) => handleItemChange(idx, "superlative", e.target.value)}
                              placeholder="مثلاً: am schönsten"
                              className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={item.word}
                            onChange={(e) => handleItemChange(idx, "word", e.target.value)}
                            placeholder="واژه آلمانی (مثلاً: schön)"
                            className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <input
                            type="text"
                            value={item.meaning || ""}
                            onChange={(e) => handleItemChange(idx, "meaning", e.target.value)}
                            placeholder="معنی فارسی (مثلاً: زیبا)"
                            className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-vazir focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes - Large, Readable Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 font-vazir flex items-center gap-1">
                  <span>توضیحات و نکات کاربردی (موقعیت‌های استفاده)</span>
                </label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder={
                    locale === "fa"
                      ? "• موقعیت استفاده: در خریدهای روزمره و مغازه\n• نکته کاربردی: تفاوت با اصطلاحات رسمی..."
                      : "Key bullet points and usage nuances..."
                  }
                  className="w-full p-3 border border-slate-300 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 font-vazir leading-relaxed"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 font-vazir">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {editingGroup ? "ذخیره تغییرات" : "ایجاد گروه"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Generate Group Modal */}
      {showAiGenerateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print font-vazir">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200 ${isRtl ? "text-right" : "text-left"}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                ایجاد هوشمند شبکه واژگانی با AI
              </h3>
              <button onClick={() => setShowAiGenerateModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">نوع گروه:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAiTypeInput("synonym")}
                    className={`py-2 rounded-xl border text-center font-bold cursor-pointer ${
                      aiTypeInput === "synonym" ? "bg-purple-600 text-white border-purple-600" : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    مترادف (Synonym)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiTypeInput("antonym")}
                    className={`py-2 rounded-xl border text-center font-bold cursor-pointer ${
                      aiTypeInput === "antonym" ? "bg-amber-600 text-white border-amber-600" : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    متضاد (Antonym)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiTypeInput("word_family")}
                    className={`py-2 rounded-xl border text-center font-bold cursor-pointer ${
                      aiTypeInput === "word_family" ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    هم‌خانواده (Wortfamilie)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiTypeInput("semantic_field")}
                    className={`py-2 rounded-xl border text-center font-bold cursor-pointer ${
                      aiTypeInput === "semantic_field" ? "bg-teal-600 text-white border-teal-600" : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    میدان معنایی (Wortfeld)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiTypeInput("idiom")}
                    className={`py-2 rounded-xl border text-center font-bold cursor-pointer ${
                      aiTypeInput === "idiom" ? "bg-rose-600 text-white border-rose-600" : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    اصطلاحات (Redewendungen)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiTypeInput("comparative_adjective")}
                    className={`py-2 rounded-xl border text-center font-bold cursor-pointer ${
                      aiTypeInput === "comparative_adjective" ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    صفات مقایسه‌ای (Komparation)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">موضوع یا واژه اصلی (مثلاً: احوالپرسی، خرید، زیبا، fahren):</label>
                <input
                  type="text"
                  value={aiTopicInput}
                  onChange={(e) => setAiTopicInput(e.target.value)}
                  placeholder="e.g. خرید، احوالپرسی، schön, fahren"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-purple-50 p-3 rounded-xl border border-purple-100">
                هوش مصنوعی کلمات، آرتیکل‌ها، نوع کلمات و معانی و نکات موقعیت استفاده را دقیق تولید خواهد کرد.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowAiGenerateModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={aiLoading || !aiTopicInput.trim()}
                onClick={handleAiCreateNewGroup}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin text-amber-300" : ""}`} />
                {aiLoading ? "در حال ساخت..." : "ساخت با AI"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
