import React, { useState, useEffect } from "react";
import { Plus, Trash2, Tag, Check } from "lucide-react";
import { dbService } from "../DatabaseService";
import { type Category } from "../types";

interface CategoryManagerProps {
  onCategoriesChanged?: () => void;
  activeFilterIds: string[];
  onFilterChange: (ids: string[]) => void;
  locale: "en" | "fa" | "de";
  t: any;
}

export default function CategoryManager({
  onCategoriesChanged,
  activeFilterIds,
  onFilterChange,
  locale,
  t,
}: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3B82F6");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const list = await dbService.getCategories();
    // Translate the seeded base categories based on current locale
    const translatedList = list.map(cat => {
      if (cat.id === "regular" && t.regular) return { ...cat, name: t.regular };
      if (cat.id === "irregular" && t.irregular) return { ...cat, name: t.irregular };
      if (cat.id === "separable" && t.separable) return { ...cat, name: t.separable };
      if (cat.id === "reflexive" && t.reflexive) return { ...cat, name: t.reflexive };
      if (cat.id === "favorites" && t.favorites) return { ...cat, name: t.favorites };
      return cat;
    });
    setCategories(translatedList);
  };

  // Reload categories if translation changes
  useEffect(() => {
    loadCategories();
  }, [locale]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const id = newCatName.toLowerCase().replace(/\s+/g, "-");
    const newCat: Category = {
      id,
      name: newCatName.trim(),
      color: newCatColor,
    };

    await dbService.saveCategory(newCat);
    setNewCatName("");
    await loadCategories();
    if (onCategoriesChanged) onCategoriesChanged();
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm(t.deleteCatConfirm)) {
      await dbService.deleteCategory(id);
      if (activeFilterIds.includes(id)) {
        onFilterChange(activeFilterIds.filter((fId) => fId !== id));
      }
      await loadCategories();
      if (onCategoriesChanged) onCategoriesChanged();
    }
  };

  const isRtl = locale === "fa";

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 ${isRtl ? "text-right" : "text-left"}`}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-slate-800 text-lg font-vazir">{t.categoriesTitle}</h3>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors font-vazir"
        >
          {isOpen ? t.closeCatsBtn : t.manageCatsBtn}
        </button>
      </div>

      {/* Filter Quick-Select */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onFilterChange([])}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all font-vazir ${
            activeFilterIds.length === 0
              ? "bg-slate-900 border-slate-900 text-white shadow-sm"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
          }`}
        >
          {t.allVerbs}
        </button>
        {categories.map((cat) => {
          const isSelected = activeFilterIds.includes(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => {
                const nextFilters = isSelected
                  ? activeFilterIds.filter(id => id !== cat.id)
                  : [...activeFilterIds, cat.id];
                onFilterChange(nextFilters);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all font-vazir ${
                isSelected
                  ? "text-white shadow-sm font-semibold"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
              }`}
              style={{
                backgroundColor: isSelected ? cat.color || "#4F46E5" : undefined,
                borderColor: isSelected ? cat.color || "#4F46E5" : undefined,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: isSelected ? "#ffffff" : cat.color || "#4F46E5",
                }}
              />
              <span className="truncate">{cat.name}</span>
              {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Category CRUD Section */}
      {isOpen && (
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <h4 className="text-sm font-medium text-slate-700 font-vazir">{t.newCatTitle}</h4>
          <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder={t.catPlaceholder}
              className={`flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-vazir ${isRtl ? "text-right" : "text-left"}`}
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                className="w-10 h-9 p-1 bg-white border border-slate-200 rounded-xl cursor-pointer"
                title="Wählen Sie eine Farbe"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-1 transition-colors font-vazir"
              >
                <Plus className="w-4 h-4" /> {t.addBtn}
              </button>
            </div>
          </form>

          {/* Current Categories List with delete */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-500 block font-vazir">{t.existingCats}</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white shadow-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-vazir">{cat.name}</span>
                  </div>
                  {/* Avoid deleting seeded defaults blindly, but let them delete if wanted, or guard regular/irregular */}
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all"
                    title="Kategorie löschen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
