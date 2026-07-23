import React, { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Check, X, Tag, Palette } from "lucide-react";
import { dbService } from "../DatabaseService";
import { VocabularyCategory } from "../types";
import { Locale } from "../translations";

interface VocabularyCategoryManagerProps {
  locale: Locale;
  selectedCategories: string[];
  onToggleCategory: (catId: string) => void;
  onClearCategories: () => void;
}

const COLOR_OPTIONS = [
  { label: "سبز (A1 / عمومی)", value: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { label: "آبی (A2 / متوسط)", value: "bg-blue-100 text-blue-800 border-blue-300" },
  { label: "کهربایی (B1)", value: "bg-amber-100 text-amber-800 border-amber-300" },
  { label: "بنفش (B2 / پیشرفته)", value: "bg-purple-100 text-purple-800 border-purple-300" },
  { label: "فیروزه‌ای (سفر)", value: "bg-teal-100 text-teal-800 border-teal-300" },
  { label: "رز / قرمز (غذا)", value: "bg-rose-100 text-rose-800 border-rose-300" },
  { label: "نیلی (کار)", value: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { label: "خاکستری (روزمره)", value: "bg-slate-100 text-slate-800 border-slate-300" }
];

export default function VocabularyCategoryManager({
  locale,
  selectedCategories,
  onToggleCategory,
  onClearCategories
}: VocabularyCategoryManagerProps) {
  const isRtl = locale === "fa";
  const [categories, setCategories] = useState<VocabularyCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // New Category State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(COLOR_OPTIONS[0].value);

  // Edit Category State
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState("");

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const list = await dbService.getVocabCategories();
      setCategories(list);
    } catch (e) {
      console.error("Error loading vocab categories:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const newCat: VocabularyCategory = {
      id: `vcat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newCatName.trim(),
      color: newCatColor
    };

    await dbService.saveVocabCategory(newCat);
    setNewCatName("");
    setShowAddForm(false);
    await loadCategories();
  };

  const handleStartEdit = (cat: VocabularyCategory) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatColor(cat.color || COLOR_OPTIONS[0].value);
  };

  const handleSaveEdit = async (catId: string) => {
    if (!editCatName.trim()) return;
    const catToUpdate: VocabularyCategory = {
      id: catId,
      name: editCatName.trim(),
      color: editCatColor
    };
    await dbService.saveVocabCategory(catToUpdate);
    setEditingCatId(null);
    await loadCategories();
  };

  const handleDeleteCategory = async (catId: string, name: string) => {
    const confirmMsg = locale === "fa"
      ? `آیا از حذف دسته‌بندی / تگ "${name}" اطمینان دارید؟`
      : `Delete category "${name}"?`;

    if (window.confirm(confirmMsg)) {
      await dbService.deleteVocabCategory(catId);
      if (selectedCategories.includes(catId)) {
        onToggleCategory(catId);
      }
      await loadCategories();
    }
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4 ${isRtl ? "text-right" : "text-left"}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-vazir">
              {locale === "fa" ? "فیلتر و مدیریت دسته‌بندی‌ها (تگ‌های واژگان)" : "Vocabulary Tags & Categories"}
            </h3>
            <p className="text-[11px] text-slate-500 font-vazir">
              {locale === "fa"
                ? "برای فیلتر کردن واژه‌ها روی تگ‌ها کلیک کنید یا تگ‌های جدید بسازید."
                : "Click tags to filter words or add custom tags."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedCategories.length > 0 && (
            <button
              onClick={onClearCategories}
              className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-semibold font-vazir transition-colors cursor-pointer"
            >
              {locale === "fa" ? "پاکسازی فیلتر تگ‌ها" : "Clear Tag Filters"}
            </button>
          )}

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold font-vazir flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {locale === "fa" ? "+ ایجاد تگ جدید" : "+ New Tag"}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleCreateCategory} className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-3 font-vazir">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {locale === "fa" ? "عنوان تگ / دسته‌بندی" : "Tag Name"}
              </label>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={locale === "fa" ? "مثلاً: سطح B1، پزشکی، اصطلاحات خیابانی..." : "e.g. Medical, Level B1..."}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {locale === "fa" ? "انتخاب رنگ تگ" : "Tag Color"}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="color"
                  value={newCatColor.startsWith("#") ? newCatColor : "#3B82F6"}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="w-8 h-8 p-0.5 bg-white border border-slate-200 rounded-lg cursor-pointer shrink-0 shadow-2xs"
                  title={locale === "fa" ? "انتخاب رنگ دلخواه" : "Custom Color"}
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", 
                    "#EC4899", "#14B8A6", "#EF4444", "#64748B", 
                    "#6366F1", "#D97706"
                  ].map((hexColor) => (
                    <button
                      key={hexColor}
                      type="button"
                      onClick={() => setNewCatColor(hexColor)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                        newCatColor === hexColor ? "border-slate-900 scale-110 shadow-md" : "border-white shadow-2xs hover:scale-105"
                      }`}
                      style={{ backgroundColor: hexColor }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-xl"
            >
              {locale === "fa" ? "انصراف" : "Cancel"}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 shadow-xs"
            >
              {locale === "fa" ? "ذخیره تگ" : "Save Tag"}
            </button>
          </div>
        </form>
      )}

      {/* Categories Chips Grid */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {loading ? (
          <span className="text-xs text-slate-400 font-vazir">در حال بارگذاری تگ‌ها...</span>
        ) : categories.length === 0 ? (
          <span className="text-xs text-slate-400 font-vazir">تگی یافت نشد.</span>
        ) : (
          categories.map((cat) => {
            const isSelected = selectedCategories.includes(cat.id);
            const isEditing = editingCatId === cat.id;

            if (isEditing) {
              return (
                <div key={cat.id} className="flex items-center gap-1 bg-amber-50 border border-amber-300 p-1 rounded-xl text-xs">
                  <input
                    type="text"
                    value={editCatName}
                    onChange={(e) => setEditCatName(e.target.value)}
                    className="px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-vazir w-28"
                  />
                  <button
                    onClick={() => handleSaveEdit(cat.id)}
                    className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-md"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingCatId(null)}
                    className="p-1 text-slate-500 hover:bg-slate-200 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={cat.id}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold font-vazir transition-all cursor-pointer ${
                  cat.color || "bg-slate-100 text-slate-800 border-slate-200"
                } ${
                  isSelected ? "ring-2 ring-indigo-600 ring-offset-1 shadow-xs scale-102" : "opacity-80 hover:opacity-100"
                }`}
                onClick={() => onToggleCategory(cat.id)}
              >
                <span>{cat.name}</span>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleStartEdit(cat)}
                    className="p-0.5 text-slate-600 hover:text-indigo-600 rounded"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                    className="p-0.5 text-slate-600 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
