import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Search,
  Download,
  Printer,
  Plus,
  RefreshCw,
  PlusCircle,
  Check,
  X,
  Smartphone,
  LayoutGrid,
  TableProperties,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Star,
  HelpCircle,
  Sparkles,
  FileCode,
  Upload
} from "lucide-react";
import { dbService, db } from "../DatabaseService";
import { Tense, TENSE_ORDER, type VerbItem, type Category } from "../types";
import CategoryManager from "./CategoryManager";

interface VerbTableProps {
  locale: "en" | "fa" | "de";
  t: any;
}

export default function VerbTable({ locale, t }: VerbTableProps) {
  const [verbs, setVerbs] = useState<VerbItem[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [selectedVerb, setSelectedVerb] = useState<string | null>(null);
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [itemsPerPage, setItemsPerPage] = useState(30);
  const ITEMS_PER_PAGE = itemsPerPage;

  // Debounce localSearchQuery into searchQuery for high performance
  useEffect(() => {
    if (localSearchQuery.trim() === "") {
      setSearchQuery("");
      return;
    }
    const handler = setTimeout(() => {
      setSearchQuery(localSearchQuery);
    }, 200);

    return () => {
      clearTimeout(handler);
    };
  }, [localSearchQuery]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const [showImperativ, setShowImperativ] = useState(() => localStorage.getItem("show_imperativ") === "true");
  const [showImperativInfo, setShowImperativInfo] = useState(false);
  const displayedTenses = showImperativ ? [...TENSE_ORDER, Tense.IMPERATIV] : TENSE_ORDER;

  const handleToggleImperativ = (val: boolean) => {
    setShowImperativ(val);
    localStorage.setItem("show_imperativ", String(val));
  };

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{
    verb: string;
    field: "hilfsverb" | "bedeutung" | string;
    value: string;
  } | null>(null);

  const [verbToDelete, setVerbToDelete] = useState<string | null>(null);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-detect responsive viewport on mount & resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setViewMode("cards");
      } else {
        setViewMode("table");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Sticky Table Header Scroll Effect
  useEffect(() => {
    if (viewMode !== "table") return;

    const handleScroll = () => {
      const table = tableRef.current;
      if (!table) return;

      const thead = table.querySelector("thead");
      if (!thead) return;

      const ths = thead.querySelectorAll("th");
      if (ths.length === 0) return;

      const lastVerbRow = table.querySelector("#last-verb-first-row") as HTMLElement;
      if (!lastVerbRow) {
        ths.forEach((th) => {
          th.style.transform = "";
        });
        return;
      }

      const rect = table.getBoundingClientRect();
      const lastVerbTop = lastVerbRow.getBoundingClientRect().top;
      const theadHeight = thead.getBoundingClientRect().height;

      const navbar = document.querySelector("header");
      const navbarHeight = navbar ? navbar.getBoundingClientRect().height : 80;

      let translateY = 0;
      if (rect.top < navbarHeight) {
        const scrollOffset = navbarHeight - rect.top;
        const maxTranslateY = lastVerbTop - rect.top - theadHeight;
        translateY = Math.max(0, Math.min(scrollOffset, maxTranslateY));
      }

      ths.forEach((th) => {
        th.style.transform = `translateY(${translateY}px)`;
        th.style.position = "relative";
        th.style.zIndex = "10";
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    const timeoutId = setTimeout(handleScroll, 100);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      clearTimeout(timeoutId);
    };
  }, [verbs, currentPage, showImperativ, activeFilterIds, searchQuery, viewMode]);

  // Handle click outside suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Loading state & list initialization
  useEffect(() => {
    initApp();
  }, []);

  const reloadCategories = async () => {
    const cats = await dbService.getCategories();
    const translated = cats.map(cat => {
      if (cat.id === "regular" && t.regular) return { ...cat, name: t.regular };
      if (cat.id === "irregular" && t.irregular) return { ...cat, name: t.irregular };
      if (cat.id === "separable" && t.separable) return { ...cat, name: t.separable };
      if (cat.id === "reflexive" && t.reflexive) return { ...cat, name: t.reflexive };
      if (cat.id === "akkusativ" && t.akkusativ) return { ...cat, name: t.akkusativ };
      if (cat.id === "dativ" && t.dativ) return { ...cat, name: t.dativ };
      if (cat.id === "favorites" && t.favorites) return { ...cat, name: t.favorites };
      return cat;
    });
    setAllCategories(translated);
  };

  const initApp = async () => {
    setLoading(true);
    await dbService.loadDatabase();
    await loadVerbsList();
    await reloadCategories();
    setLoading(false);
  };

  // Update translated categories when locale changes
  useEffect(() => {
    reloadCategories();
  }, [locale]);

  const handleCategoriesChanged = async () => {
    await loadVerbsList();
    await reloadCategories();
  };

  // Add Verb Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newInfinitive, setNewInfinitive] = useState("");
  const [newBedeutung, setNewBedeutung] = useState("");
  const [newHilfsverb, setNewHilfsverb] = useState<"haben" | "sein">("haben");
  const [newCategories, setNewCategories] = useState<string[]>(["regular"]);
  const [newPrasens, setNewPrasens] = useState({
    S1: "", S2: "", S3: "", P1: "", P2: "", P3: ""
  });
  const [addVerbToastMessage, setAddVerbToastMessage] = useState<string | null>(null);

  // Verb JSON Import Modal State
  const [showVerbJsonModal, setShowVerbJsonModal] = useState(false);
  const [verbJsonInputText, setVerbJsonInputText] = useState("");
  const [enableAiVerbJsonImport, setEnableAiVerbJsonImport] = useState(true);
  const [verbJsonImportError, setVerbJsonImportError] = useState<string | null>(null);
  const [verbJsonImportSuccess, setVerbJsonImportSuccess] = useState<string | null>(null);
  const verbFileInputRef = useRef<HTMLInputElement>(null);

  // AI State for Verbs
  const [verbAiLoading, setVerbAiLoading] = useState(false);

  // AI Fill Verb in Add Modal
  const handleAiFillVerbInModal = async () => {
    const inf = newInfinitive.trim();
    if (!inf) {
      alert(locale === "fa" ? "لطفاً ابتدا مصدر فعل آلمانی را وارد کنید." : "Please enter the German verb infinitive first.");
      return;
    }
    setVerbAiLoading(true);
    try {
      const res = await fetch("/api/gemini/verb-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infinitive: inf })
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        if (d.infinitive) setNewInfinitive(d.infinitive);
        if (d.bedeutung) setNewBedeutung(d.bedeutung);
        if (d.hilfsverb === "sein") setNewHilfsverb("sein");
        else setNewHilfsverb("haben");

        if (d.conjugations && d.conjugations.PRASENS) {
          const pr = d.conjugations.PRASENS;
          setNewPrasens({
            S1: Array.isArray(pr.S1) ? pr.S1.join(", ") : pr.S1 || "",
            S2: Array.isArray(pr.S2) ? pr.S2.join(", ") : pr.S2 || "",
            S3: Array.isArray(pr.S3) ? pr.S3.join(", ") : pr.S3 || "",
            P1: Array.isArray(pr.P1) ? pr.P1.join(", ") : pr.P1 || "",
            P2: Array.isArray(pr.P2) ? pr.P2.join(", ") : pr.P2 || "",
            P3: Array.isArray(pr.P3) ? pr.P3.join(", ") : pr.P3 || "",
          });
        }
        setAddVerbToastMessage(locale === "fa" ? "اطلاعات فعل و صرف‌ها با هوش مصنوعی پیدا شدند ✨" : "Verb data fetched with AI ✨");
        setTimeout(() => setAddVerbToastMessage(null), 3500);
      } else {
        alert(result.error || "خطا در تحلیل فعل با هوش مصنوعی");
      }
    } catch (err: any) {
      alert("خطا: " + err.message);
    } finally {
      setVerbAiLoading(false);
    }
  };

  // AI Enrich Existing Verb with full conjugations
  const handleAiEnrichVerb = async (verbItem: VerbItem) => {
    setVerbAiLoading(true);
    try {
      const res = await fetch("/api/gemini/verb-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infinitive: verbItem.infinitive, currentData: verbItem })
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        const cellOverrides: Record<string, string> = { ...verbItem.cellOverrides };

        if (d.conjugations) {
          const tensesKeys = [
            "PRASENS",
            "PERFEKT",
            "PRATERITUM",
            "KONJUNKTIV2_PRATERITUM",
            "FUTUR1",
            "PLUSQUAMPERFEKT",
            "KONJUNKTIV1_PRASENS",
            "FUTUR2",
            "IMPERATIV"
          ];
          for (const tKey of tensesKeys) {
            const tenseObj = d.conjugations[tKey];
            if (tenseObj) {
              for (const pKey of ["S1", "S2", "S3", "P1", "P2", "P3"]) {
                if (tenseObj[pKey]) {
                  const val = Array.isArray(tenseObj[pKey]) ? tenseObj[pKey].join(", ") : tenseObj[pKey];
                  if (val) {
                    cellOverrides[`${tKey}_${pKey}`] = val;
                  }
                }
              }
            }
          }
        }

        let newCats = verbItem.categories;
        if (Array.isArray(d.categories) && d.categories.length > 0) {
          newCats = d.categories;
        }

        const correctedInfinitive = (d.infinitive && typeof d.infinitive === "string" && d.infinitive.trim()) ? d.infinitive.trim() : verbItem.infinitive;
        if (correctedInfinitive !== verbItem.infinitive) {
          await dbService.renameVerbInfinitive(verbItem.infinitive, correctedInfinitive);
        }

        await dbService.addVerb({
          infinitive: correctedInfinitive,
          bedeutung: d.bedeutung || verbItem.bedeutung,
          hilfsverb: d.hilfsverb === "sein" ? "sein" : "haben",
          categories: newCats,
          cellOverrides
        });

        await loadVerbsList();
        setAddVerbToastMessage(
          locale === "fa"
            ? `تمام صرف‌های فعل "${correctedInfinitive}" با هوش مصنوعی تکمیل شد ✨`
            : `All tenses for "${correctedInfinitive}" populated with AI ✨`
        );
        setTimeout(() => setAddVerbToastMessage(null), 3500);
      } else {
        alert(result.error || "خطا در هوش مصنوعی");
      }
    } catch (err: any) {
      alert("خطا: " + err.message);
    } finally {
      setVerbAiLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setNewInfinitive("");
    setNewBedeutung("");
    setNewHilfsverb("haben");
    setNewCategories(["regular"]);
    setNewPrasens({ S1: "", S2: "", S3: "", P1: "", P2: "", P3: "" });
    setShowAddModal(true);
  };

  const handleCreateVerbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInf = newInfinitive.trim();
    if (!rawInf) return;

    // Duplicate check for single verb creation
    const exists = verbs.some(v => v.infinitive.toLowerCase().trim() === rawInf.toLowerCase());
    if (exists) {
      setAddVerbToastMessage(
        locale === "fa"
          ? `فعل "${rawInf}" از قبل در جدول افعال وجود دارد و اضافه نشد.`
          : `Verb "${rawInf}" already exists in table.`
      );
      setTimeout(() => setAddVerbToastMessage(null), 4000);
      return;
    }

    // Build cell overrides for Präsens if entered
    const cellOverrides: Record<string, string> = {};
    if (newPrasens.S1.trim()) cellOverrides["PRASENS_S1"] = newPrasens.S1.trim();
    if (newPrasens.S2.trim()) cellOverrides["PRASENS_S2"] = newPrasens.S2.trim();
    if (newPrasens.S3.trim()) cellOverrides["PRASENS_S3"] = newPrasens.S3.trim();
    if (newPrasens.P1.trim()) cellOverrides["PRASENS_P1"] = newPrasens.P1.trim();
    if (newPrasens.P2.trim()) cellOverrides["PRASENS_P2"] = newPrasens.P2.trim();
    if (newPrasens.P3.trim()) cellOverrides["PRASENS_P3"] = newPrasens.P3.trim();

    await dbService.addVerb({
      infinitive: rawInf,
      bedeutung: newBedeutung.trim(),
      hilfsverb: newHilfsverb,
      categories: newCategories.length > 0 ? newCategories : ["regular"],
      cellOverrides
    });

    setShowAddModal(false);

    // Reset filters and navigate to page 1 so user immediately sees the new verb at the top!
    setActiveFilterIds([]);
    setSelectedVerb(null);
    setSearchQuery("");
    setLocalSearchQuery("");
    setCurrentPage(1);

    await loadVerbsList();

    const successMsg = (t.verbAddedSuccess || "فعل \"{verb}\" با موفقیت اضافه شد و در بالای لیست قرار گرفت!").replace("{verb}", rawInf);
    setAddVerbToastMessage(successMsg);
    setTimeout(() => setAddVerbToastMessage(null), 4000);
  };

  const loadVerbsList = async () => {
    setLoading(true);
    try {
      const fetched = await dbService.getAllVerbs();

      // Retrieve custom order list
      let customOrder = await dbService.getCustomOrder();
      
      // If custom order is empty, initialize it with alphabetically sorted infinitives
      if (customOrder.length === 0) {
        const initialOrder = fetched
          .map(v => v.infinitive.toLowerCase().trim())
          .sort((a, b) => a.localeCompare(b));
        await dbService.saveCustomOrder(initialOrder);
        customOrder = initialOrder;
      }

      // Check if there are any newly fetched verbs missing from customOrder and PREPEND them
      const missingKeys = fetched
        .map(v => v.infinitive.toLowerCase().trim())
        .filter(k => !customOrder.includes(k));

      if (missingKeys.length > 0) {
        customOrder = [...missingKeys, ...customOrder];
        await dbService.saveCustomOrder(customOrder);
      }

      // Sort based on existing customOrder
      fetched.sort((a, b) => {
        const keyA = a.infinitive.toLowerCase().trim();
        const keyB = b.infinitive.toLowerCase().trim();
        
        let indexA = customOrder.indexOf(keyA);
        let indexB = customOrder.indexOf(keyB);
        
        if (indexA === -1) indexA = 99999;
        if (indexB === -1) indexB = 99999;
        
        if (indexA !== indexB) return indexA - indexB;
        return keyA.localeCompare(keyB);
      });

      setVerbs(fetched);
    } catch (err) {
      console.error("Error loading verbs list", err);
    } finally {
      setLoading(false);
    }
  };

  // Bulk Processing / Quick Add
  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim()) return;

    const list = bulkInput
      .split(/[,\-]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const existingVerbSet = new Set(verbs.map(v => v.infinitive.toLowerCase().trim()));
    const newVerbsToSave: string[] = [];
    const duplicateVerbs: string[] = [];

    for (const inf of list) {
      if (existingVerbSet.has(inf.toLowerCase())) {
        duplicateVerbs.push(inf);
      } else {
        existingVerbSet.add(inf.toLowerCase());
        newVerbsToSave.push(inf);
      }
    }

    if (newVerbsToSave.length === 0) {
      const msg = locale === "fa"
        ? `تمامی افعال وارد شده (${duplicateVerbs.join(", ")}) از قبل در جدول وجود دارند و هیچ فعل جدیدی اضافه نشد.`
        : `All entered verbs already exist (${duplicateVerbs.join(", ")}).`;
      setAddVerbToastMessage(msg);
      setTimeout(() => setAddVerbToastMessage(null), 4000);
      return;
    }

    let addedCount = 0;

    for (const inf of newVerbsToSave) {
      await dbService.addVerb({
        infinitive: inf,
        bedeutung: t.customVerb || "فعل دلخواه",
        hilfsverb: "haben",
        categories: ["regular"],
      });
      addedCount++;
    }

    // Reset active filters & search so newly added verb(s) are visible
    setActiveFilterIds([]);
    setSelectedVerb(null);
    setSearchQuery("");
    setLocalSearchQuery("");
    setCurrentPage(1);

    await loadVerbsList();
    setBulkInput("");

    let msg = addedCount === 1
      ? (t.verbAddedSuccess || "فعل \"{verb}\" با موفقیت اضافه شد.").replace("{verb}", newVerbsToSave[0])
      : (t.bulkVerbsAddedSuccess || "{count} فعل با موفقیت اضافه شد.").replace("{count}", addedCount.toString());

    if (duplicateVerbs.length > 0) {
      msg += locale === "fa"
        ? ` (${duplicateVerbs.length} فعل به دلیل تکراری بودن نادیده گرفته شدند: ${duplicateVerbs.join(", ")})`
        : ` (${duplicateVerbs.length} duplicates skipped)`;
    }

    setAddVerbToastMessage(msg);
    setTimeout(() => setAddVerbToastMessage(null), 4000);
  };

  // Verb JSON File Upload Handler
  const handleVerbFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setVerbJsonInputText(content);
        processVerbJsonImport(content);
      }
    };
    reader.readAsText(file);
  };

  // Verb JSON Import Processing
  const processVerbJsonImport = async (jsonText: string) => {
    setVerbJsonImportError(null);
    setVerbJsonImportSuccess(null);

    try {
      const parsed = JSON.parse(jsonText);
      let itemsArray: any[] = [];

      if (Array.isArray(parsed)) {
        itemsArray = parsed;
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.verbs)) itemsArray = parsed.verbs;
        else if (Array.isArray(parsed.items)) itemsArray = parsed.items;
        else itemsArray = [parsed];
      }

      if (!itemsArray || itemsArray.length === 0) {
        setVerbJsonImportError(locale === "fa" ? "هیچ فعلی در فایل JSON پیدا نشد." : "No verbs found in JSON.");
        return;
      }

      // Filter duplicates
      const existingVerbSet = new Set(verbs.map(v => v.infinitive.toLowerCase().trim()));
      const newCandidates: any[] = [];
      const duplicateVerbs: string[] = [];

      for (const raw of itemsArray) {
        let inf = "";
        if (typeof raw === "string") {
          inf = raw.trim();
        } else if (raw && typeof raw === "object" && raw.infinitive) {
          inf = String(raw.infinitive).trim();
        }
        if (!inf) continue;

        if (existingVerbSet.has(inf.toLowerCase())) {
          duplicateVerbs.push(inf);
        } else {
          existingVerbSet.add(inf.toLowerCase());
          newCandidates.push(typeof raw === "string" ? { infinitive: inf } : raw);
        }
      }

      if (newCandidates.length === 0) {
        const dupStr = duplicateVerbs.slice(0, 10).join(", ") + (duplicateVerbs.length > 10 ? "..." : "");
        setVerbJsonImportError(
          locale === "fa"
            ? `تمام افعال موجود در فایل از قبل در دیتابیس وجود دارند (${duplicateVerbs.length} فعل تکراری: ${dupStr}). هیچ فعل جدیدی اضافه نشد.`
            : `All imported verbs already exist (${duplicateVerbs.length} duplicates: ${dupStr}). No new verbs added.`
        );
        return;
      }

      itemsArray = newCandidates;

      // AI Enrichment for verbs if checked
      if (enableAiVerbJsonImport && itemsArray.length > 0) {
        setVerbJsonImportSuccess(
          locale === "fa"
            ? `در حال تحلیل و استخراج صرف‌های کامل ${itemsArray.length} فعل با هوش مصنوعی... (لطفاً کمی شکیبا باشید)`
            : "Enriching verb tenses and meanings with AI..."
        );

        try {
          const aiRes = await fetch("/api/gemini/batch-verb-fill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: itemsArray.slice(0, 30) }) // safety limit 30 items
          });
          const aiData = await aiRes.json();
          if (aiData.success && Array.isArray(aiData.items) && aiData.items.length > 0) {
            itemsArray = aiData.items;
          }
        } catch (err) {
          console.error("Batch AI error during verb JSON import:", err);
        }
      }

      let countSuccess = 0;

      for (const raw of itemsArray) {
        const inf = raw.infinitive || raw.word;
        if (!inf) continue;

        const cellOverrides: Record<string, string> = { ...raw.cellOverrides };

        if (raw.conjugations) {
          const tensesKeys = [
            "PRASENS", "PERFEKT", "PRATERITUM", "KONJUNKTIV2_PRATERITUM",
            "FUTUR1", "PLUSQUAMPERFEKT", "KONJUNKTIV1_PRASENS", "FUTUR2", "IMPERATIV"
          ];
          for (const tKey of tensesKeys) {
            const tenseObj = raw.conjugations[tKey];
            if (tenseObj) {
              for (const pKey of ["S1", "S2", "S3", "P1", "P2", "P3"]) {
                if (tenseObj[pKey]) {
                  const val = Array.isArray(tenseObj[pKey]) ? tenseObj[pKey].join(", ") : tenseObj[pKey];
                  if (val) {
                    cellOverrides[`${tKey}_${pKey}`] = val;
                  }
                }
              }
            }
          }
        }

        await dbService.addVerb({
          infinitive: inf,
          bedeutung: raw.bedeutung || raw.meaning || "",
          hilfsverb: raw.hilfsverb === "sein" ? "sein" : "haben",
          categories: Array.isArray(raw.categories) ? raw.categories : ["regular"],
          cellOverrides
        });
        countSuccess++;
      }

      await loadVerbsList();

      let msg = locale === "fa"
        ? `تعداد ${countSuccess} فعل جدید با موفقیت به جدول اضافه شد!`
        : `${countSuccess} new verbs imported successfully!`;

      if (duplicateVerbs.length > 0) {
        const dupStr = duplicateVerbs.slice(0, 5).join(", ") + (duplicateVerbs.length > 5 ? "..." : "");
        msg += locale === "fa"
          ? ` (${duplicateVerbs.length} فعل تکراری نادیده گرفته شدند: ${dupStr})`
          : ` (${duplicateVerbs.length} duplicate verbs skipped: ${dupStr})`;
      }

      setVerbJsonImportSuccess(msg);
      setAddVerbToastMessage(locale === "fa" ? `${countSuccess} فعل جدید درون‌ریزی شد.` : `${countSuccess} new verbs imported.`);
      setTimeout(() => setShowVerbJsonModal(false), 2000);
    } catch (err: any) {
      console.error("Verb JSON parse error:", err);
      setVerbJsonImportError(locale === "fa" ? "فرمت فایل JSON معتبر نیست." : "Invalid JSON file format.");
    }
  };

  // Pre-index conjugations for fast, performant live-search without CPU/RAM/memory pressure
  const indexedVerbs = useMemo(() => {
    return verbs.map((v) => {
      const wordsSet = new Set<string>();
      if (v.conjugations) {
        for (const tense of Object.values(v.conjugations) as any[]) {
          if (tense) {
            const persons = [tense.S1, tense.S2, tense.S3, tense.P1, tense.P2, tense.P3];
            for (const personArr of persons) {
              if (Array.isArray(personArr)) {
                for (const form of personArr) {
                  if (typeof form === "string") {
                    wordsSet.add(form.toLowerCase().trim());
                  }
                }
              }
            }
          }
        }
      }
      const conjugationsList = Array.from(wordsSet);
      return {
        verb: v,
        infinitiveLower: v.infinitive.toLowerCase().trim(),
        bedeutungLower: (v.bedeutung || "").toLowerCase().trim(),
        conjugationsList,
        conjugationsLower: conjugationsList.join(" ")
      };
    });
  }, [verbs]);

  // Pre-build index Map once to prevent recreating on every typing keypress
  const indexedVerbsMap = useMemo(() => {
    return new Map<string, typeof indexedVerbs[number]>(
      indexedVerbs.map(iv => [iv.infinitiveLower, iv])
    );
  }, [indexedVerbs]);

  // Pre-build category lookup map to prevent running allCategories.find inside loops
  const categoriesLookupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of allCategories) {
      map.set(cat.id, cat.name.toLowerCase());
    }
    return map;
  }, [allCategories]);

  // Filter verbs
  const filteredVerbs = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return activeFilterIds.length > 0
        ? verbs.filter((v) => activeFilterIds.every((id) => v.categories.includes(id)))
        : verbs;
    }

    const isExactMatch = selectedVerb && selectedVerb.toLowerCase().trim() === query;

    return verbs.filter((v) => {
      let matchesSearch = false;

      if (isExactMatch) {
        matchesSearch = v.infinitive.toLowerCase() === query;
      } else {
        const matchesInfinitive = v.infinitive.toLowerCase().includes(query);
        const matchesBedeutung = (v.bedeutung || "").toLowerCase().includes(query);
        
        // Check if any of the verb's categories matches the search query (O(1) lookup map)
        const matchesCategoryName = v.categories.some(catId => {
          const catNameLower = categoriesLookupMap.get(catId);
          return catNameLower && catNameLower.includes(query);
        });

        // Check if any of the verb's conjugations matches the search query
        const iv = indexedVerbsMap.get(v.infinitive.toLowerCase().trim());
        const matchesConjugation = iv ? iv.conjugationsLower.includes(query) : false;

        matchesSearch = matchesInfinitive || matchesBedeutung || matchesCategoryName || matchesConjugation;
      }

      const matchesCategory = activeFilterIds.length > 0
        ? activeFilterIds.every((id) => v.categories.includes(id))
        : true;
      return matchesSearch && matchesCategory;
    });
  }, [verbs, searchQuery, selectedVerb, activeFilterIds, categoriesLookupMap, indexedVerbsMap]);

  // Reset page when filters or search queries modify to avoid out-of-bounds page views
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilterIds]);

  const totalPages = Math.ceil(filteredVerbs.length / ITEMS_PER_PAGE);
  const paginatedVerbs = filteredVerbs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reordering
  const handleMoveVerb = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredVerbs.length) return;

    const currentVerb = filteredVerbs[index];
    const targetVerb = filteredVerbs[targetIndex];

    const currentKey = currentVerb.infinitive.toLowerCase().trim();
    const targetKey = targetVerb.infinitive.toLowerCase().trim();

    // Get current custom order
    let customOrder = await dbService.getCustomOrder();

    // If custom order is empty, initialize it first with current verbs sequence
    if (customOrder.length === 0) {
      customOrder = verbs.map((v) => v.infinitive.toLowerCase().trim());
    }

    // Find the positions of these two verbs in the global custom order list
    let idxA = customOrder.indexOf(currentKey);
    let idxB = customOrder.indexOf(targetKey);

    // If they aren't in the list, make sure they are added
    if (idxA === -1) {
      customOrder.push(currentKey);
      idxA = customOrder.length - 1;
    }
    if (idxB === -1) {
      customOrder.push(targetKey);
      idxB = customOrder.length - 1;
    }

    // Swap their positions in customOrder
    const temp = customOrder[idxA];
    customOrder[idxA] = customOrder[idxB];
    customOrder[idxB] = temp;

    // Save back to DB
    await dbService.saveCustomOrder(customOrder);

    // Reload the lists to update UI
    await loadVerbsList();
  };

  // Delete verb override or remove custom verb
  const handleDeleteVerb = async (infinitive: string) => {
    setVerbToDelete(infinitive);
  };

  const confirmDeleteVerb = async () => {
    if (!verbToDelete) return;
    await dbService.resetVerb(verbToDelete);
    await loadVerbsList();
    setVerbToDelete(null);
  };

  // Save manual overrides
  const startEditing = (verb: string, field: string, value: string) => {
    setEditingCell({ verb, field, value });
  };

  const handleSaveCellOverride = async () => {
    if (!editingCell) return;
    const { verb, field, value } = editingCell;

    if (field === "infinitive") {
      const newInf = value.trim();
      if (newInf && newInf !== verb) {
        await dbService.renameVerbInfinitive(verb, newInf);
        await loadVerbsList();
        setAddVerbToastMessage(
          locale === "fa"
            ? `املای فعل به "${newInf}" تغییر یافت`
            : `Verb spelling updated to "${newInf}"`
        );
        setTimeout(() => setAddVerbToastMessage(null), 3000);
      }
      setEditingCell(null);
      return;
    }

    if (field === "hilfsverb") {
      await dbService.saveOverride(verb, { hilfsverb: value });
    } else if (field === "bedeutung") {
      await dbService.saveOverride(verb, { bedeutung: value });
    } else {
      const cellOverrides = { [field]: value };
      await dbService.saveOverride(verb, { cellOverrides });
    }

    setEditingCell(null);
    await loadVerbsList();
  };

  // Manage Verb Category Membership
  const handleToggleVerbCategory = async (infinitive: string, catId: string) => {
    const verb = verbs.find((v) => v.infinitive === infinitive);
    if (!verb) return;

    let updatedCats = [...verb.categories];
    if (updatedCats.includes(catId)) {
      updatedCats = updatedCats.filter((id) => id !== catId);
    } else {
      updatedCats.push(catId);
      // Ensure regular and irregular are mutually exclusive
      if (catId === "regular") {
        updatedCats = updatedCats.filter((id) => id !== "irregular");
      } else if (catId === "irregular") {
        updatedCats = updatedCats.filter((id) => id !== "regular");
      }
    }

    await dbService.saveOverride(infinitive, { categories: updatedCats });
    await loadVerbsList();
  };

  // Reset all
  const handleResetAll = async () => {
    if (confirm(t.resetConfirm)) {
      await db.overrides.clear();
      await loadVerbsList();
    }
  };

  // Export HTML with Vazirmatn font
  const handleExportHTML = () => {
    const tenseHeader = showImperativ ? (locale === "fa" ? "حالت" : locale === "de" ? "Modus" : "Mode") : t.tenseCol;
    let rowsHtml = "";
    let globalRowIndex = 1;

    filteredVerbs.forEach((v) => {
      displayedTenses.forEach((tense, idx) => {
        const conj = v.conjugations[tense] || { S1: [], S2: [], S3: [], P1: [], P2: [], P3: [] };

        const ich = conj.S1.join(" ") || "-";
        const du = conj.S2.join(" ") || "-";
        const er = conj.S3.join(" ") || "-";
        const wir = conj.P1.join(" ") || "-";
        const ihr = conj.P2.join(" ") || "-";
        const sie = conj.P3.join(" ") || "-";

        rowsHtml += `
          <tr>
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-cell font-bold">${globalRowIndex}</td>` : ""}
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-cell font-bold text-indigo-700" style="text-align: left;">${v.infinitive}</td>` : ""}
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-cell">${v.hilfsverb}</td>` : ""}
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-cell text-slate-600">${v.bedeutung}</td>` : ""}
            <td class="tense-cell" style="text-align: center;">${getTenseLabel(tense)}</td>
            <td style="text-align: center;">${ich}</td>
            <td style="text-align: center;">${du}</td>
            <td style="text-align: center;">${er}</td>
            <td style="text-align: center;">${wir}</td>
            <td style="text-align: center;">${ihr}</td>
            <td style="text-align: center;">${sie}</td>
          </tr>
        `;
      });
      globalRowIndex++;
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${t.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap');
    body {
      font-family: 'Vazirmatn', sans-serif;
      padding: 40px;
      background-color: #f8fafc;
      color: #1e293b;
      direction: ${locale === "fa" ? "rtl" : "ltr"};
    }
    h1 {
      color: #4338ca;
      text-align: center;
      margin-bottom: 5px;
    }
    p.subtitle {
      text-align: center;
      color: #64748b;
      margin-bottom: 30px;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 40px;
      direction: ltr;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px 12px;
      text-align: ${locale === "fa" ? "right" : "left"};
      font-size: 13px;
    }
    th {
      background-color: #4338ca;
      color: white;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .group-cell {
      background-color: #f1f5f9;
      vertical-align: middle;
      text-align: center;
    }
    .tense-cell {
      font-weight: 600;
      color: #4f46e5;
    }
  </style>
</head>
<body>
  <h1>${t.title}</h1>
  <p class="subtitle">${t.subtitle} - Schriftart: Vazirmatn</p>
  <table>
    <thead>
      <tr>
        <th>${t.numberCol}</th>
        <th>${t.verbCol}</th>
        <th>${t.auxCol}</th>
        <th>${t.meaningCol}</th>
        <th>${tenseHeader}</th>
        <th>${t.ichCol}</th>
        <th>${t.duCol}</th>
        <th>${t.erCol}</th>
        <th>${t.wirCol}</th>
        <th>${t.ihrCol}</th>
        <th>${t.sieCol}</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `German_Verbs_Conjugations_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // High-fidelity print handler
  const handlePrintPDF = () => {
    const tenseHeader = showImperativ ? (locale === "fa" ? "حالت" : locale === "de" ? "Modus" : "Mode") : t.tenseCol;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert(locale === "fa" 
        ? "مرورگر شما جلوی باز شدن پنجره جدید را گرفت. لطفاً اجازه دسترسی به پاپ‌آپ (Pop-up) را در تنظیمات مرورگر خود بدهید تا فایل PDF صادر شود." 
        : "Your browser blocked the print window. Please allow popups for this site in your browser settings to export PDF.");
      return;
    }

    let rowsHtml = "";
    let globalRowIndex = 1;

    filteredVerbs.forEach((v) => {
      const verbBgClass = (globalRowIndex - 1) % 2 === 0 ? "bg-white" : "bg-indigo-alt";
      displayedTenses.forEach((tense, idx) => {
        const conj = v.conjugations[tense] || { S1: [], S2: [], S3: [], P1: [], P2: [], P3: [] };

        const ich = conj.S1.join(" ") || "-";
        const du = conj.S2.join(" ") || "-";
        const er = conj.S3.join(" ") || "-";
        const wir = conj.P1.join(" ") || "-";
        const ihr = conj.P2.join(" ") || "-";
        const sie = conj.P3.join(" ") || "-";

        const isLastTense = idx === displayedTenses.length - 1;
        const borderClass = isLastTense ? "border-thick" : "border-normal";

        rowsHtml += `
          <tr class="${verbBgClass} ${borderClass}">
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-num-cell text-center"><span class="badge-num">${globalRowIndex}</span></td>` : ""}
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-infinitive-cell text-left font-bold"><span class="inf-text">${v.infinitive}</span></td>` : ""}
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-aux-cell text-center">${v.hilfsverb}</td>` : ""}
            ${idx === 0 ? `<td rowspan="${displayedTenses.length}" class="group-meaning-cell text-center">${v.bedeutung}</td>` : ""}
            <td class="tense-cell text-center">${getTenseLabel(tense)}</td>
            <td class="conj-cell text-center">${ich}</td>
            <td class="conj-cell text-center">${du}</td>
            <td class="conj-cell text-center">${er}</td>
            <td class="conj-cell text-center">${wir}</td>
            <td class="conj-cell text-center">${ihr}</td>
            <td class="conj-cell text-center">${sie}</td>
          </tr>
        `;
      });
      globalRowIndex++;
    });

    printWindow.document.write(`
<html>
<head>
  <title>${t.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
    
    body {
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 20px;
      font-size: 11px;
      color: #334155;
      background-color: #ffffff;
      direction: ${locale === "fa" ? "rtl" : "ltr"};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    h2 {
      text-align: center;
      margin-bottom: 4px;
      color: #0f172a;
      font-size: 22px;
      font-weight: 800;
    }
    
    p.date {
      text-align: center;
      margin-bottom: 25px;
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
    }
    
    .table-container {
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
      background-color: #ffffff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
      direction: ltr;
    }
    
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    
    th {
      background-color: #0f172a;
      color: #f8fafc;
      font-weight: 600;
      font-size: 11px;
      padding: 14px 10px;
      border-bottom: 2px solid #1e293b;
      font-family: 'Vazirmatn', sans-serif;
    }
    
    td {
      padding: 10px 12px;
      font-size: 11px;
      color: #334155;
      vertical-align: middle;
      border-right: 1px solid #f1f5f9;
    }

    /* Directional text alignments */
    .text-left { text-align: left !important; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }

    /* Alternating rows and borders */
    tr.border-normal td {
      border-bottom: 1px solid #f1f5f9;
    }
    tr.border-thick td {
      border-bottom: 3.5px solid #cbd5e1;
    }
    
    .bg-white {
      background-color: #ffffff;
    }
    .bg-indigo-alt {
      background-color: rgba(79, 70, 229, 0.025);
    }
    
    /* Grouped sidebar columns matching app style */
    .group-num-cell {
      background-color: #f8fafc !important;
      border-right: 1px solid #e2e8f0 !important;
      width: 45px;
    }
    .badge-num {
      background-color: #e2e8f0;
      color: #475569;
      padding: 3px 7px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
    }
    
    .group-infinitive-cell {
      background-color: #f8fafc !important;
      border-right: 1px solid #e2e8f0 !important;
      font-size: 12px;
    }
    .inf-text {
      color: #4338ca;
      font-size: 13px;
      font-weight: 700;
    }
    
    .group-aux-cell {
      background-color: #f8fafc !important;
      border-right: 1px solid #e2e8f0 !important;
      color: #475569;
      font-size: 11px;
    }
    
    .group-meaning-cell {
      background-color: #f8fafc !important;
      border-right: 1px solid #e2e8f0 !important;
      color: #475569;
      font-size: 11px;
      max-width: 150px;
      word-wrap: break-word;
      font-family: 'Vazirmatn', sans-serif;
    }
    
    .tense-cell {
      font-weight: 700;
      color: #4f46e5;
      background-color: rgba(79, 70, 229, 0.04) !important;
      border-right: 1px solid #f1f5f9;
    }

    .conj-cell {
      font-weight: 500;
    }
    
    @media print {
      .no-print { display: none !important; }
      body {
        padding: 0;
      }
      .table-container {
        border-radius: 0;
        border: none;
        box-shadow: none;
      }
      th {
        background-color: #0f172a !important;
        color: #ffffff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .group-num-cell, .group-infinitive-cell, .group-aux-cell, .group-meaning-cell {
        background-color: #f8fafc !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .tense-cell {
        background-color: rgba(79, 70, 229, 0.04) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .bg-indigo-alt {
        background-color: rgba(79, 70, 229, 0.025) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    
    .print-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #e0e7ff;
      border: 1px solid #c7d2fe;
      padding: 14px 20px;
      border-radius: 12px;
      margin-bottom: 25px;
      font-family: 'Vazirmatn', sans-serif;
    }
    
    .print-btn {
      background: #4f46e5;
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      font-family: 'Vazirmatn', sans-serif;
      transition: background 0.2s;
    }
    .print-btn:hover {
      background: #4338ca;
    }
  </style>
</head>
<body>
  <!-- Print Guidance Banner -->
  <div class="print-banner no-print">
    <span style="font-weight: bold; color: #3730a3; font-size: 12px;">
      ${locale === "fa" 
        ? "پیش‌نمایش چاپ / خروجی PDF فعال شد. برای دانلود یا ذخیره به عنوان فایل PDF روی دکمه مقابل کلیک کنید و در مقصد گزینه 'Save as PDF' را انتخاب کنید:" 
        : "Print / PDF export preview is active. Click the button to print or save as PDF (choose 'Save as PDF' as the destination):"}
    </span>
    <button onclick="window.print()" class="print-btn">
      ${locale === "fa" ? "چاپ / ذخیره PDF" : "Print / Save as PDF"}
    </button>
  </div>

  <h2>${t.title}</h2>
  <p class="date">${t.subtitle} | Export: ${new Date().toLocaleDateString()}</p>
  
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 50px;">${t.numberCol}</th>
          <th class="text-center" style="width: 120px;">${t.verbCol}</th>
          <th class="text-center" style="width: 80px;">${t.auxCol}</th>
          <th class="text-center" style="width: 150px;">${t.meaningCol}</th>
          <th class="text-center" style="color: #a5b4fc; width: 130px;">${tenseHeader}</th>
          <th class="text-center">${t.ichCol}</th>
          <th class="text-center">${t.duCol}</th>
          <th class="text-center">${t.erCol}</th>
          <th class="text-center">${t.wirCol}</th>
          <th class="text-center">${t.ihrCol}</th>
          <th class="text-center">${t.sieCol}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
  
  <script>
    window.onload = function() {
      // Auto-open print dialog on desktop / supportive mobile browsers
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>
    `);
    printWindow.document.close();
  };

  // Map database enum key to translation tag
  const tenseColName = (tense: Tense) => {
    switch (tense) {
      case "PRASENS": return "ichCol"; 
      default: return tense;
    }
  };

  const getTenseLabel = (tense: Tense) => {
    switch (tense) {
      case "PRASENS": return "Präsens";
      case "PERFEKT": return "Perfekt";
      case "PRATERITUM": return "Präteritum";
      case "KONJUNKTIV2_PRATERITUM": return "Konjunktiv II (Präteritum)";
      case "FUTUR1": return "Futur I";
      case "PLUSQUAMPERFEKT": return "Plusquamperfekt (indikativ)";
      case "KONJUNKTIV1_PRASENS": return "Konjunktiv I (Präsens)";
      case "FUTUR2": return "Futur II";
      case "IMPERATIV": return locale === "fa" ? "Imperativ (امری)" : "Imperativ";
      default: return tense;
    }
  };

  const isRtl = locale === "fa";

  const suggestedVerbs = useMemo<{ key: string; verb: VerbItem; displayText: string; isConjugationMatch: boolean }[]>(() => {
    const query = localSearchQuery.toLowerCase().trim();
    if (query.length === 0) return [];
    
    const suggestions: { key: string; verb: VerbItem; displayText: string; isConjugationMatch: boolean }[] = [];
    const seenKeys = new Set<string>();

    for (const iv of indexedVerbs) {
      if (suggestions.length >= 10) break;

      const v = iv.verb;
      // 1. Check if the query matches the infinitive or the meaning
      const matchesInfinitive = iv.infinitiveLower.includes(query);
      const matchesBedeutung = iv.bedeutungLower.includes(query);

      if (matchesInfinitive || matchesBedeutung) {
        const key = `inf-${v.infinitive}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          suggestions.push({
            key,
            verb: v,
            displayText: v.infinitive,
            isConjugationMatch: false
          });
        }
      }

      // 2. Check for matching conjugations
      for (const form of iv.conjugationsList) {
        if (suggestions.length >= 10) break;

        if (form.includes(query)) {
          const key = `conj-${v.infinitive}-${form}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            suggestions.push({
              key,
              verb: v,
              displayText: form,
              isConjugationMatch: true
            });
          }
        }
      }
    }

    return suggestions;
  }, [localSearchQuery, indexedVerbs]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (suggestedVerbs.length === 0) return;
      e.preventDefault();
      setSuggestionIndex(prev => (prev + 1) % suggestedVerbs.length);
    } else if (e.key === "ArrowUp") {
      if (suggestedVerbs.length === 0) return;
      e.preventDefault();
      setSuggestionIndex(prev => (prev - 1 + suggestedVerbs.length) % suggestedVerbs.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestedVerbs.length > 0) {
        if (suggestionIndex >= 0 && suggestionIndex < suggestedVerbs.length) {
          const chosen = suggestedVerbs[suggestionIndex];
          setLocalSearchQuery(chosen.verb.infinitive);
          setSearchQuery(chosen.verb.infinitive);
          setSelectedVerb(chosen.verb.infinitive);
        } else {
          // No suggestion selected, search for all matching verbs, do not isolate to a single verb
          setSelectedVerb(null);
          setSearchQuery(localSearchQuery);
        }
      } else {
        setSelectedVerb(null);
        setSearchQuery(localSearchQuery);
      }
      setShowSuggestions(false);
      // Smooth scroll to results
      setTimeout(() => {
        resultsContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200/80 text-amber-950 font-bold rounded-xs px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification when verb is added */}
      {addVerbToastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top duration-300 font-vazir text-sm border border-emerald-500">
          <Check className="w-5 h-5 bg-white text-emerald-700 rounded-full p-0.5 shrink-0" />
          <span>{addVerbToastMessage}</span>
          <button 
            onClick={() => setAddVerbToastMessage(null)}
            className="mr-2 text-emerald-200 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Bulk Import Controls */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start no-print ${isRtl ? "text-right" : "text-left"}`}>
        {/* Search */}
        <div ref={searchContainerRef} className="lg:col-span-5 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-3 relative">
          <label className="text-sm font-semibold text-slate-800 flex items-center gap-2 font-vazir">
            <Search className="w-4 h-4 text-indigo-600" />
            {t.searchLabel}
          </label>
          <div className="relative">
            <input
              type="text"
              value={localSearchQuery}
              onChange={(e) => {
                setLocalSearchQuery(e.target.value);
                setSelectedVerb(null);
                setShowSuggestions(true);
                setSuggestionIndex(-1);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t.searchPlaceholder}
              className={`w-full py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 hover:bg-slate-100/50 transition-colors font-vazir ${
                isRtl ? "pl-4 pr-10 text-right" : "pl-10 pr-4 text-left"
              }`}
            />
            <Search className={`w-4 h-4 text-slate-400 absolute top-3.5 ${isRtl ? "right-3.5" : "left-3.5"}`} />

            {/* Wiktionary-style suggestions dropdown */}
            {showSuggestions && localSearchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden max-h-[380px] flex flex-col">
                <div className="overflow-y-auto divide-y divide-slate-100 py-1">
                  {suggestedVerbs.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-400 font-vazir text-center">
                      {locale === "fa" ? "هیچ فعلی یافت نشد" : "Keine Verben gefunden"}
                    </div>
                  ) : (
                    suggestedVerbs.map((item, sIdx) => {
                      const isFocused = sIdx === suggestionIndex;
                      const v = item.verb;
                      return (
                        <div
                          key={item.key}
                          onClick={() => {
                            setLocalSearchQuery(v.infinitive);
                            setSearchQuery(v.infinitive);
                            setSelectedVerb(v.infinitive);
                            setShowSuggestions(false);
                            setTimeout(() => {
                              resultsContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 50);
                          }}
                          onMouseEnter={() => setSuggestionIndex(sIdx)}
                          className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                            isFocused 
                              ? "bg-indigo-50/70" 
                              : "hover:bg-slate-50/70"
                          } ${isRtl ? "text-right" : "text-left"}`}
                        >
                          <BookOpen className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-800 font-sans flex flex-wrap items-center gap-2">
                              <span>{highlightMatch(item.displayText, localSearchQuery)}</span>
                              {item.isConjugationMatch && (
                                <span className={`text-[11px] font-normal text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md ${isRtl ? "mr-auto" : "ml-auto"}`}>
                                  {`← ${v.infinitive}`}
                                </span>
                              )}
                            </div>
                            {v.bedeutung && (
                              <div className="text-xs text-slate-400 font-vazir truncate mt-0.5">
                                {v.bedeutung}
                              </div>
                            )}
                          </div>
                          {v.categories && v.categories.length > 0 && (() => {
                            const displayCatId = v.categories.find(cId => cId !== "favorites") || v.categories[0];
                            const cat = allCategories.find((c) => c.id === displayCatId);
                            return (
                              <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-sm shrink-0 self-center font-vazir">
                                {cat ? cat.name : displayCatId}
                              </span>
                            );
                          })()}
                        </div>
                      );
                    })
                  )}
                </div>
                
                {/* Search for details action row */}
                <div className={`bg-slate-50 px-4 py-2 text-xs border-t border-slate-150 flex items-center justify-between font-vazir text-slate-500`}>
                  <span>
                    {locale === "fa" 
                      ? `کلیدهای جهتی ⇅ برای پیمایش، Enter برای انتخاب`
                      : `Pfeiltasten ⇅ zum Navigieren, Enter zum Auswählen`}
                  </span>
                  <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                    Esc
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Add Verb & Modal Trigger */}
        <div className="lg:col-span-7 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <label className="text-sm font-semibold text-slate-800 flex items-center gap-2 font-vazir">
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              {t.bulkLabel}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setVerbJsonInputText("");
                  setVerbJsonImportError(null);
                  setVerbJsonImportSuccess(null);
                  setShowVerbJsonModal(true);
                }}
                className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold px-3 py-1.5 rounded-xl border border-purple-200 transition-colors flex items-center gap-1 font-vazir shrink-0 cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5" />
                {locale === "fa" ? "+ ورود افعال از JSON" : "+ Import Verbs from JSON"}
              </button>
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-3 py-1.5 rounded-xl border border-indigo-200 transition-colors flex items-center gap-1 font-vazir shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.addVerbModalBtn || "+ افزودن فعل جدید"}
              </button>
            </div>
          </div>

          <form onSubmit={handleBulkImport} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={t.bulkPlaceholder}
              className={`flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-vazir ${isRtl ? "text-right" : "text-left"}`}
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-1.5 shadow-sm font-vazir cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> {t.importBtn}
            </button>
          </form>
        </div>
      </div>

      {/* Detailed Add New Verb Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 ${isRtl ? "text-right" : "text-left"}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-vazir">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                {t.addNewVerbTitle || "افزودن فعل جدید به دیتابیس"}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVerbSubmit} className="space-y-4">
              {/* AI Auto-Fill Action Header */}
              <div className="bg-purple-50 border border-purple-200 p-3.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-900 font-vazir">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>تکمیل هوشمند معانی و تمامی صرف‌های فعل با هوش مصنوعی</span>
                </div>
                <button
                  type="button"
                  disabled={verbAiLoading}
                  onClick={handleAiFillVerbInModal}
                  className="w-full sm:w-auto px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 font-vazir shrink-0"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${verbAiLoading ? "animate-spin text-amber-300" : ""}`} />
                  {verbAiLoading ? "در حال تحلیل AI..." : "تکمیل خودکار فعل با AI"}
                </button>
              </div>

              {/* Infinitive & Meaning */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 font-vazir">
                    {t.infinitiveLabel || "مصدر فعل (آلمانی)"} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newInfinitive}
                    onChange={(e) => setNewInfinitive(e.target.value)}
                    placeholder={t.infinitivePlaceholder || "مثلاً: laufen, kaufen"}
                    className={`w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-sans ${isRtl ? "text-right" : "text-left"}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 font-vazir">
                    {t.meaningLabel || "معنی / ترجمه"}
                  </label>
                  <input
                    type="text"
                    value={newBedeutung}
                    onChange={(e) => setNewBedeutung(e.target.value)}
                    placeholder={t.meaningPlaceholder || "مثلاً: دویدن، خریدن"}
                    className={`w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-vazir ${isRtl ? "text-right" : "text-left"}`}
                  />
                </div>
              </div>

              {/* Auxiliary Verb Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 font-vazir">
                  {t.auxLabel || "فعل کمکی (Hilfsverb)"}
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer font-sans">
                    <input
                      type="radio"
                      name="hilfsverb"
                      value="haben"
                      checked={newHilfsverb === "haben"}
                      onChange={() => setNewHilfsverb("haben")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    haben
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer font-sans">
                    <input
                      type="radio"
                      name="hilfsverb"
                      value="sein"
                      checked={newHilfsverb === "sein"}
                      onChange={() => setNewHilfsverb("sein")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    sein
                  </label>
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 font-vazir">
                  {t.categoriesLabel || "دسته‌بندی‌ها"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {allCategories.filter(c => c.id !== "favorites").map((cat) => {
                    const isSelected = newCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setNewCategories(newCategories.filter(id => id !== cat.id));
                          } else {
                            let updated = [...newCategories, cat.id];
                            if (cat.id === "regular") updated = updated.filter(id => id !== "irregular");
                            if (cat.id === "irregular") updated = updated.filter(id => id !== "regular");
                            setNewCategories(updated);
                          }
                        }}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer font-vazir ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Initial Präsens Conjugation Fields */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <label className="text-xs font-semibold text-indigo-700 font-vazir block">
                  {t.prasensConjugationTitle || "صرف اولیه زمان حال (Präsens - اختیاری)"}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-sans">
                  <div>
                    <span className="text-slate-400 text-[10px] block">ich</span>
                    <input
                      type="text"
                      value={newPrasens.S1}
                      onChange={(e) => setNewPrasens({ ...newPrasens, S1: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">du</span>
                    <input
                      type="text"
                      value={newPrasens.S2}
                      onChange={(e) => setNewPrasens({ ...newPrasens, S2: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">er/es/sie</span>
                    <input
                      type="text"
                      value={newPrasens.S3}
                      onChange={(e) => setNewPrasens({ ...newPrasens, S3: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">wir</span>
                    <input
                      type="text"
                      value={newPrasens.P1}
                      onChange={(e) => setNewPrasens({ ...newPrasens, P1: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">ihr</span>
                    <input
                      type="text"
                      value={newPrasens.P2}
                      onChange={(e) => setNewPrasens({ ...newPrasens, P2: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">sie/Sie</span>
                    <input
                      type="text"
                      value={newPrasens.P3}
                      onChange={(e) => setNewPrasens({ ...newPrasens, P3: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors font-vazir cursor-pointer"
                >
                  {t.cancelBtn || "انصراف"}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors font-vazir shadow-sm cursor-pointer"
                >
                  {t.saveVerbBtn || "ذخیره و افزودن به لیست"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category CRUD & Filters */}
      <CategoryManager
        activeFilterIds={activeFilterIds}
        onFilterChange={setActiveFilterIds}
        onCategoriesChanged={handleCategoriesChanged}
        locale={locale}
        t={t}
      />

      {/* View Mode & Rotation Tip on Mobile */}
      <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 no-print">
        <div className={`lg:hidden flex items-start gap-2.5 text-xs text-indigo-900 leading-relaxed ${isRtl ? "text-right" : "text-left"}`}>
          <Smartphone className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <span className="font-vazir font-medium">{t.landscapeTip}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          <span className="text-xs font-semibold text-slate-600 font-vazir shrink-0">{t.mobileViewMode}</span>
          <div className="flex bg-slate-200/60 p-0.5 rounded-xl border border-slate-200 w-full sm:w-auto overflow-hidden">
            <button
              onClick={() => setViewMode("cards")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "cards" ? "bg-white text-indigo-600 shadow-2xs" : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              <span className="font-vazir whitespace-nowrap">{t.mobileGrid}</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "table" ? "bg-white text-indigo-600 shadow-2xs" : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <TableProperties className="w-3.5 h-3.5 shrink-0" />
              <span className="font-vazir whitespace-nowrap">{t.mobileTable}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Imperativ Option Block */}
      <div className={`mt-4 mb-3 p-4 bg-indigo-50/30 border border-indigo-100 rounded-2xl no-print flex flex-col gap-2 relative ${isRtl ? "text-right" : "text-left"}`}>
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer select-none gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={showImperativ}
                onChange={(e) => handleToggleImperativ(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${showImperativ ? "bg-indigo-600" : "bg-slate-200"}`} />
              <div className={`absolute top-[2px] w-5 h-5 bg-white rounded-full transition-all border border-slate-300 ${
                showImperativ 
                  ? isRtl ? "right-[20px]" : "left-[20px]" 
                  : isRtl ? "right-[2px]" : "left-[2px]"
              }`} />
            </div>
            <span className="text-sm font-semibold text-slate-700 font-vazir">
              {locale === "fa" ? "نمایش حالت امری (Imperativ) در جدول" : locale === "de" ? "Spalte Imperativ in der Tabelle anzeigen" : "Show Imperative column in table"}
            </span>
          </label>

          {/* Question mark with relative container for popup */}
          <div className="relative inline-block">
            <button
              type="button"
              onMouseEnter={() => setShowImperativInfo(true)}
              onMouseLeave={() => setShowImperativInfo(false)}
              onClick={() => setShowImperativInfo(!showImperativInfo)}
              className="p-1 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100 transition-colors cursor-help"
              title={locale === "fa" ? "راهنما" : "Help"}
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Popup Box */}
            {showImperativInfo && (
              <div 
                className={`absolute z-50 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-lg border border-slate-800 leading-relaxed font-vazir ${
                  isRtl ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left"
                }`}
              >
                <div className="absolute top-full border-4 border-transparent border-t-slate-900 filter drop-shadow-[0_1px_0_rgba(0,0,0,0.1)]" style={{ left: isRtl ? 'auto' : '8px', right: isRtl ? '8px' : 'auto' }}></div>
                <p>
                  {locale === "fa" 
                    ? "حالت امری (Imperative) در دیتابیس به طور پیشفرض وجود ندارد و اگر کاربر بخواهد خودش می‌تواند صرف فعل‌ها را در آن حالت در جدول بنویسد."
                    : locale === "de"
                    ? "Der Imperativ ist standardmäßig nicht in der Datenbank vorhanden. Wenn Sie möchten, können Sie die Konjugationen für diesen Modus selbst in die Tabelle eintragen."
                    : "The imperative mood is not in the database by default. If you wish, you can write the verb conjugations for that mood in the table yourself."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div ref={resultsContainerRef} className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-200/80 no-print">
        <div className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left">
          <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-xl border border-indigo-100 font-mono shrink-0">
            {t.loadedCount.replace("{count}", filteredVerbs.length.toString())}
          </span>
          <span className="text-xs text-slate-500 font-medium font-vazir">
            {t.clickEditTip}
          </span>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportHTML}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-white border border-slate-200 hover:border-indigo-200 rounded-xl hover:bg-indigo-50/50 transition-all shadow-xs font-vazir"
            title="Exportieren als HTML"
          >
            <Download className="w-3.5 h-3.5" /> {t.htmlExportBtn}
          </button>
          <button
            onClick={handlePrintPDF}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm font-vazir"
            title="PDF drucken"
          >
            <Printer className="w-3.5 h-3.5" /> {t.pdfExportBtn}
          </button>
          <button
            onClick={handleResetAll}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl transition-all"
            title="Reset All"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Container - Conditional Rendering depending on viewMode state */}
      {viewMode === "cards" ? (
        /* COMPACT CARDS VIEW FOR MOBILE viewport */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 no-print">
          {filteredVerbs.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 text-sm italic font-vazir bg-white border border-slate-200 rounded-2xl">
              {t.noVerbsFound}
            </div>
          ) : (
            paginatedVerbs.map((v, verbIdx) => {
              const globalVerbIdx = (currentPage - 1) * ITEMS_PER_PAGE + verbIdx;
              // Alternating color design per verb!
              const verbBgColorClass = globalVerbIdx % 2 === 0 ? "bg-white border-slate-200" : "bg-indigo-50/10 border-indigo-100";
              const titleColorClass = "text-indigo-700";

              return (
                <div
                   key={v.infinitive}
                   className={`border-2 rounded-2xl shadow-xs p-5 transition-all space-y-4 ${verbBgColorClass}`}
                >
                  {/* Verb Header Block */}
                  <div className="flex flex-col gap-3 border-b border-slate-100/80 pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {/* Left: Number + Infinitive + Favorite + Edit */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="font-mono text-xs bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-lg shrink-0">
                          {globalVerbIdx + 1}
                        </span>

                        {editingCell?.verb === v.infinitive && editingCell.field === "infinitive" ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingCell.value}
                              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                              className="px-2 py-0.5 border border-indigo-300 rounded-lg text-base font-bold text-indigo-800 bg-white focus:ring-2 focus:ring-indigo-500 font-sans"
                              autoFocus
                            />
                            <button onClick={handleSaveCellOverride} className="p-1 bg-green-600 text-white rounded-lg hover:bg-green-700">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingCell(null)} className="p-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 min-w-0">
                            <h4 className={`text-xl font-bold font-sans tracking-wide truncate ${titleColorClass}`}>
                              {v.infinitive}
                            </h4>
                            <button
                              onClick={() => startEditing(v.infinitive, "infinitive", v.infinitive)}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer shrink-0"
                              title={locale === "fa" ? "ویرایش املای فعل" : "Edit verb spelling"}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <button
                          onClick={() => handleToggleVerbCategory(v.infinitive, "favorites")}
                          className="p-1 text-amber-500 hover:scale-110 transition-transform cursor-pointer shrink-0"
                          title={locale === "fa" ? "افزودن به علاقه‌مندی‌ها" : "Toggle Favorite"}
                        >
                          <Star className={`w-4 h-4 ${v.categories.includes("favorites") ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
                        </button>
                      </div>

                      {/* Right: Actions (AI Sparkles, Move Up, Move Down, Delete) */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAiEnrichVerb(v); }}
                          disabled={verbAiLoading}
                          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                          title={locale === "fa" ? "تکمیل هوشمند معانی و تمامی صرف‌ها با AI" : "AI Enrich Verb"}
                        >
                          <Sparkles className={`w-4 h-4 ${verbAiLoading ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={() => handleMoveVerb(globalVerbIdx, "up")}
                          disabled={globalVerbIdx === 0}
                          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer"
                          title={t.directionUp}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveVerb(globalVerbIdx, "down")}
                          disabled={globalVerbIdx === filteredVerbs.length - 1}
                          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer"
                          title={t.directionDown}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteVerb(v.infinitive); }}
                          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer"
                          title={locale === "fa" ? "حذف / بازنشانی" : "Reset / Remove"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Info lines (Hilfsverb & Bedeutung) */}
                    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 pt-1 ${isRtl ? "justify-start" : ""}`}>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-600">{t.auxCol}:</span>
                        {editingCell?.verb === v.infinitive && editingCell.field === "hilfsverb" ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={editingCell.value}
                              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                              className="px-1 py-0.5 border border-slate-300 rounded text-xs bg-white"
                            >
                              <option value="haben">haben</option>
                              <option value="sein">sein</option>
                              <option value="haben / sein">haben / sein</option>
                            </select>
                            <button onClick={handleSaveCellOverride} className="p-0.5 bg-green-600 text-white rounded">
                              <Check className="w-2.5 h-2.5" />
                            </button>
                            <button onClick={() => setEditingCell(null)} className="p-0.5 bg-slate-200 text-slate-600 rounded">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            onClick={() => startEditing(v.infinitive, "hilfsverb", v.hilfsverb)}
                            className="font-semibold text-slate-700 hover:bg-slate-200/50 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                          >
                            {v.hilfsverb}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-600">{t.meaningCol}:</span>
                        {editingCell?.verb === v.infinitive && editingCell.field === "bedeutung" ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingCell.value}
                              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                              className="px-1.5 py-0.5 border border-slate-300 rounded text-xs bg-white max-w-full focus:ring-1 focus:ring-indigo-500"
                              style={{ width: `${Math.max(6, (editingCell.value || "").length + 2)}ch` }}
                              autoFocus
                            />
                            <button onClick={handleSaveCellOverride} className="p-0.5 bg-green-600 text-white rounded">
                              <Check className="w-2.5 h-2.5" />
                            </button>
                            <button onClick={() => setEditingCell(null)} className="p-0.5 bg-slate-200 text-slate-600 rounded">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            onClick={() => startEditing(v.infinitive, "bedeutung", v.bedeutung)}
                            className="italic text-slate-700 hover:bg-slate-200/50 px-1.5 py-0.5 rounded cursor-pointer transition-colors font-vazir"
                          >
                            {v.bedeutung || t.unbekannt}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Category badget tags block */}
                  <div className="flex flex-wrap gap-1">
                    {allCategories.map((cat) => {
                      const isActive = v.categories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => handleToggleVerbCategory(v.infinitive, cat.id)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border flex items-center gap-0.5 transition-all font-vazir ${
                            isActive ? "text-white" : "bg-white hover:bg-slate-100 border-slate-200 text-slate-500"
                          }`}
                          style={{
                            backgroundColor: isActive ? cat.color : undefined,
                            borderColor: isActive ? cat.color : undefined,
                          }}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Accordion or Dense grid list of all 8 Tenses */}
                  <div className="space-y-3.5 pt-2">
                    {displayedTenses.map((tense) => {
                      const conj = v.conjugations[tense] || { S1: [], S2: [], S3: [], P1: [], P2: [], P3: [] };
                      const ichVal = conj.S1.join(" ");
                      const duVal = conj.S2.join(" ");
                      const erVal = conj.S3.join(" ");
                      const wirVal = conj.P1.join(" ");
                      const ihrVal = conj.P2.join(" ");
                      const sieVal = conj.P3.join(" ");

                      return (
                        <div key={tense} className="bg-slate-50/80 border border-slate-200/60 rounded-xl overflow-hidden shadow-2xs">
                          {/* Tense Header Banner */}
                          <div className="bg-indigo-50/40 border-b border-slate-200/60 px-3.5 py-2 flex justify-between items-center">
                            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">
                              {getTenseLabel(tense)}
                            </span>
                          </div>

                          {/* 2x3 Conjugation Grid with full inline editing capability */}
                          <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-400 block">ich:</span>
                              <CellEditor
                                verb={v.infinitive}
                                field={`${tense}_S1`}
                                value={ichVal}
                                onSave={handleSaveCellOverride}
                                editingCell={editingCell}
                                setEditingCell={setEditingCell}
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-400 block">du:</span>
                              <CellEditor
                                verb={v.infinitive}
                                field={`${tense}_S2`}
                                value={duVal}
                                onSave={handleSaveCellOverride}
                                editingCell={editingCell}
                                setEditingCell={setEditingCell}
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-400 block">er/es/sie:</span>
                              <CellEditor
                                verb={v.infinitive}
                                field={`${tense}_S3`}
                                value={erVal}
                                onSave={handleSaveCellOverride}
                                editingCell={editingCell}
                                setEditingCell={setEditingCell}
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-400 block">wir:</span>
                              <CellEditor
                                verb={v.infinitive}
                                field={`${tense}_P1`}
                                value={wirVal}
                                onSave={handleSaveCellOverride}
                                editingCell={editingCell}
                                setEditingCell={setEditingCell}
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-400 block">ihr:</span>
                              <CellEditor
                                verb={v.infinitive}
                                field={`${tense}_P2`}
                                value={ihrVal}
                                onSave={handleSaveCellOverride}
                                editingCell={editingCell}
                                setEditingCell={setEditingCell}
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="font-semibold text-slate-400 block">sie/Sie:</span>
                              <CellEditor
                                verb={v.infinitive}
                                field={`${tense}_P3`}
                                value={sieVal}
                                onSave={handleSaveCellOverride}
                                editingCell={editingCell}
                                setEditingCell={setEditingCell}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* TRADITIONAL WIDE TABLE VIEW WITH EXCELLENT ALT COLORING */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-visible">
          <div className="overflow-x-auto overflow-y-visible rounded-2xl scrollbar-thin">
            <table ref={tableRef} id="verb-conjugation-main-table" dir="ltr" className={`w-full border-collapse text-sm text-slate-600 ${isRtl ? "text-right" : "text-left"}`}>
              <thead>
                <tr className="bg-slate-900 text-white border-b border-slate-800 text-xs tracking-wider uppercase font-sans">
                  <th className="py-4 px-4 font-semibold text-center w-14 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800">{t.numberCol}</th>
                  <th className="py-4 px-5 font-semibold text-slate-200 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.verbCol}</th>
                  <th className="py-4 px-4 font-semibold font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.auxCol}</th>
                  <th className="py-4 px-4 font-semibold font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.meaningCol}</th>
                  <th className="py-4 px-4 font-semibold text-indigo-400 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">
                    {showImperativ ? (locale === "fa" ? "حالت" : locale === "de" ? "Modus" : "Mode") : t.tenseCol}
                  </th>
                  <th className="py-4 px-3 font-semibold text-slate-300 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.ichCol}</th>
                  <th className="py-4 px-3 font-semibold text-slate-300 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.duCol}</th>
                  <th className="py-4 px-3 font-semibold text-slate-300 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.erCol}</th>
                  <th className="py-4 px-3 font-semibold text-slate-300 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.wirCol}</th>
                  <th className="py-4 px-3 font-semibold text-slate-300 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.ihrCol}</th>
                  <th className="py-4 px-3 font-semibold text-slate-300 font-vazir relative z-10 bg-slate-900 shadow-2xs border-b border-slate-800 text-center">{t.sieCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVerbs.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400 text-sm italic font-vazir">
                      {t.noVerbsFound}
                    </td>
                  </tr>
                ) : (
                  paginatedVerbs.map((v, verbIdx) => {
                    const globalVerbIdx = (currentPage - 1) * ITEMS_PER_PAGE + verbIdx;
                    // VERB ALTERNATING COLOR STRATEGY:
                    // Color the entire 8-row block of a verb coherently!
                    // This visually groups all tenses of the same verb and sets it clearly apart from adjacent verbs.
                    const verbBgClass = globalVerbIdx % 2 === 0 ? "bg-white" : "bg-indigo-50/10";

                    return displayedTenses.map((tense, tenseIdx) => {
                      const conj = v.conjugations[tense] || { S1: [], S2: [], S3: [], P1: [], P2: [], P3: [] };

                      const ichVal = conj.S1.join(" ");
                      const duVal = conj.S2.join(" ");
                      const erVal = conj.S3.join(" ");
                      const wirVal = conj.P1.join(" ");
                      const ihrVal = conj.P2.join(" ");
                      const sieVal = conj.P3.join(" ");

                      const keys = {
                        hilfsverb: "hilfsverb",
                        bedeutung: "bedeutung",
                        S1: `${tense}_S1`,
                        S2: `${tense}_S2`,
                        S3: `${tense}_S3`,
                        P1: `${tense}_P1`,
                        P2: `${tense}_P2`,
                        P3: `${tense}_P3`,
                      };

                      const globalNummer = globalVerbIdx + 1;

                      // Thicker bottom border for the last tense of each verb to form a robust visual partition!
                      const borderClass = tenseIdx === displayedTenses.length - 1 ? "border-b-4 border-slate-300/80" : "border-b border-slate-100";

                      return (
                        <tr
                          key={`${v.infinitive}_${tense}`}
                          id={verbIdx === paginatedVerbs.length - 1 && tenseIdx === 0 ? "last-verb-first-row" : undefined}
                          className={`group ${borderClass} transition-colors duration-150 ${verbBgClass} hover:bg-indigo-50/30`}
                        >
                          {/* Grouped Number Column */}
                          {tenseIdx === 0 && (
                            <td
                              rowSpan={displayedTenses.length}
                              className="py-4 px-3 text-center font-bold text-slate-400 bg-slate-50 border-r border-slate-200/80 align-middle text-xs"
                            >
                              <div className="flex flex-col items-center justify-center gap-2">
                                <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded-md font-mono text-xs">
                                  {globalNummer}
                                </span>
                                <div className="flex flex-col gap-0.5 no-print">
                                  <button
                                    onClick={() => handleMoveVerb(globalVerbIdx, "up")}
                                    disabled={globalVerbIdx === 0}
                                    className="p-1 rounded text-slate-400 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                                    title={t.directionUp}
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveVerb(globalVerbIdx, "down")}
                                    disabled={globalVerbIdx === filteredVerbs.length - 1}
                                    className="p-1 rounded text-slate-400 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                                    title={t.directionDown}
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          )}

                          {/* Grouped Infinitive Column */}
                          {tenseIdx === 0 && (
                            <td
                              rowSpan={displayedTenses.length}
                              className="py-4 px-4 font-bold text-slate-900 bg-slate-50 border-r border-slate-200/80 align-middle text-sm"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {editingCell?.verb === v.infinitive && editingCell.field === "infinitive" ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={editingCell.value}
                                        onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                        className="px-2 py-0.5 border border-indigo-300 rounded text-sm font-bold text-indigo-800 bg-white focus:ring-1 focus:ring-indigo-500 font-sans"
                                        autoFocus
                                      />
                                      <button onClick={handleSaveCellOverride} className="p-1 bg-green-600 text-white rounded hover:bg-green-700">
                                        <Check className="w-3 h-3" />
                                      </button>
                                      <button onClick={() => setEditingCell(null)} className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span className="text-indigo-700 font-sans tracking-wide text-base">
                                        {v.infinitive}
                                      </span>
                                      <button
                                        onClick={() => startEditing(v.infinitive, "infinitive", v.infinitive)}
                                        className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                        title={locale === "fa" ? "ویرایش املای فعل" : "Edit verb spelling"}
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => handleToggleVerbCategory(v.infinitive, "favorites")}
                                    className="p-1 text-amber-500 hover:scale-110 transition-transform cursor-pointer"
                                    title={locale === "fa" ? "افزودن به علاقه‌مندی‌ها" : "Toggle Favorite"}
                                  >
                                    <Star className={`w-4 h-4 ${v.categories.includes("favorites") ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAiEnrichVerb(v); }}
                                    disabled={verbAiLoading}
                                    className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-all no-print cursor-pointer shrink-0"
                                    title={locale === "fa" ? "تکمیل هوشمند معانی و تمامی صرف‌ها با AI" : "AI Enrich Verb"}
                                  >
                                    <Sparkles className={`w-3.5 h-3.5 ${verbAiLoading ? "animate-spin" : ""}`} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteVerb(v.infinitive); }}
                                    className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 transition-all no-print cursor-pointer shrink-0"
                                    title="Reset / Remove"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="flex flex-wrap gap-1 no-print">
                                  {allCategories.map((cat) => {
                                    const isActive = v.categories.includes(cat.id);
                                    return (
                                      <button
                                        key={cat.id}
                                        onClick={() => handleToggleVerbCategory(v.infinitive, cat.id)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-0.5 transition-all font-vazir ${
                                          isActive
                                            ? "text-white"
                                            : "bg-white hover:bg-slate-100 border-slate-200 text-slate-500"
                                        }`}
                                        style={{
                                          backgroundColor: isActive ? cat.color : undefined,
                                          borderColor: isActive ? cat.color : undefined,
                                        }}
                                      >
                                        {cat.name}
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="hidden print:flex gap-1">
                                  {v.categories.map((cId) => {
                                    const cat = allCategories.find((c) => c.id === cId);
                                    return (
                                      <span
                                        key={cId}
                                        className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-slate-100 text-slate-800 font-vazir"
                                      >
                                        {cat?.name}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          )}

                          {/* Grouped Hilfsverb Column */}
                          {tenseIdx === 0 && (
                            <td
                              rowSpan={displayedTenses.length}
                              className="py-4 px-4 bg-slate-50 border-r border-slate-200/80 align-middle text-center"
                            >
                              {editingCell?.verb === v.infinitive && editingCell.field === keys.hilfsverb ? (
                                <div className="flex items-center gap-1 no-print justify-center">
                                  <select
                                    value={editingCell.value}
                                    onChange={(e) =>
                                      setEditingCell({ ...editingCell, value: e.target.value })
                                    }
                                    className="px-1.5 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 bg-white"
                                  >
                                    <option value="haben">haben</option>
                                    <option value="sein">sein</option>
                                    <option value="haben / sein">haben / sein</option>
                                  </select>
                                  <button
                                    onClick={handleSaveCellOverride}
                                    className="p-1 bg-green-600 text-white rounded hover:bg-green-700"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setEditingCell(null)}
                                    className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div
                                  onClick={() => startEditing(v.infinitive, keys.hilfsverb, v.hilfsverb)}
                                  className="cursor-pointer hover:bg-slate-200/50 px-2 py-1 rounded transition-colors inline-flex items-center gap-1 font-semibold text-slate-700 text-xs"
                                >
                                  {v.hilfsverb}
                                  <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-40" />
                                </div>
                              )}
                            </td>
                          )}

                          {/* Grouped Bedeutung Column */}
                          {tenseIdx === 0 && (
                            <td
                              rowSpan={displayedTenses.length}
                              className="py-4 px-4 bg-slate-50 border-r border-slate-200/80 align-middle max-w-[150px] text-center"
                            >
                              {editingCell?.verb === v.infinitive && editingCell.field === keys.bedeutung ? (
                                <div className="flex items-center gap-1 no-print justify-center">
                                  <input
                                    type="text"
                                    value={editingCell.value}
                                    onChange={(e) =>
                                      setEditingCell({ ...editingCell, value: e.target.value })
                                    }
                                    className="px-1.5 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 bg-white max-w-full text-center"
                                    style={{ width: `${Math.max(6, (editingCell.value || "").length + 2)}ch` }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={handleSaveCellOverride}
                                    className="p-0.5 bg-green-600 text-white rounded hover:bg-green-700"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setEditingCell(null)}
                                    className="p-0.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div
                                  onClick={() => startEditing(v.infinitive, keys.bedeutung, v.bedeutung)}
                                  className="cursor-pointer hover:bg-slate-200/50 px-2 py-1 rounded transition-colors inline-flex items-center gap-1 text-slate-600 text-xs italic break-words font-vazir w-full justify-center"
                                >
                                  {v.bedeutung || t.unbekannt}
                                  <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-40" />
                                </div>
                              )}
                            </td>
                          )}

                          {/* Zeitform Column */}
                          <td className="py-3 px-4 font-semibold text-indigo-600 bg-indigo-50/20 text-xs text-center">
                            {getTenseLabel(tense)}
                          </td>

                          {/* ich (S1) */}
                          <td className="py-3 px-3 text-center">
                            <CellEditor
                              verb={v.infinitive}
                              field={keys.S1}
                              value={ichVal}
                              onSave={handleSaveCellOverride}
                              editingCell={editingCell}
                              setEditingCell={setEditingCell}
                            />
                          </td>

                          {/* du (S2) */}
                          <td className="py-3 px-3 text-center">
                            <CellEditor
                              verb={v.infinitive}
                              field={keys.S2}
                              value={duVal}
                              onSave={handleSaveCellOverride}
                              editingCell={editingCell}
                              setEditingCell={setEditingCell}
                            />
                          </td>

                          {/* er/es/sie (S3) */}
                          <td className="py-3 px-3 text-center">
                            <CellEditor
                              verb={v.infinitive}
                              field={keys.S3}
                              value={erVal}
                              onSave={handleSaveCellOverride}
                              editingCell={editingCell}
                              setEditingCell={setEditingCell}
                            />
                          </td>

                          {/* wir (P1) */}
                          <td className="py-3 px-3 text-center">
                            <CellEditor
                              verb={v.infinitive}
                              field={keys.P1}
                              value={wirVal}
                              onSave={handleSaveCellOverride}
                              editingCell={editingCell}
                              setEditingCell={setEditingCell}
                            />
                          </td>

                          {/* ihr (P2) */}
                          <td className="py-3 px-3 text-center">
                            <CellEditor
                              verb={v.infinitive}
                              field={keys.P2}
                              value={ihrVal}
                              onSave={handleSaveCellOverride}
                              editingCell={editingCell}
                              setEditingCell={setEditingCell}
                            />
                          </td>

                          {/* sie/Sie (P3) */}
                          <td className="py-3 px-3 text-center">
                            <CellEditor
                              verb={v.infinitive}
                              field={keys.P3}
                              value={sieVal}
                              onSave={handleSaveCellOverride}
                              editingCell={editingCell}
                              setEditingCell={setEditingCell}
                            />
                          </td>
                        </tr>
                      );
                    });
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-white p-4 rounded-2xl border border-slate-200/80 no-print">
          <div className={`text-xs text-slate-500 font-vazir ${isRtl ? "text-right" : "text-left"}`}>
            {locale === "fa" 
              ? `نمایش ${(currentPage - 1) * ITEMS_PER_PAGE + 1} تا ${Math.min(currentPage * ITEMS_PER_PAGE, filteredVerbs.length)} از ${filteredVerbs.length} فعل` 
              : locale === "de"
              ? `Zeige ${(currentPage - 1) * ITEMS_PER_PAGE + 1} bis ${Math.min(currentPage * ITEMS_PER_PAGE, filteredVerbs.length)} von ${filteredVerbs.length} Verben`
              : `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1} to ${Math.min(currentPage * ITEMS_PER_PAGE, filteredVerbs.length)} of ${filteredVerbs.length} verbs`}
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="w-9 h-9 flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer disabled:pointer-events-none"
              >
                {isRtl ? <ChevronRight className="w-4 h-4 text-slate-600" /> : <ChevronLeft className="w-4 h-4 text-slate-600" />}
              </button>
              
              {/* Page number buttons */}
              {(() => {
                const pages = [];
                const maxButtons = 5;
                let startPage = Math.max(1, currentPage - 2);
                let endPage = Math.min(totalPages, startPage + maxButtons - 1);
                
                if (endPage - startPage < maxButtons - 1) {
                  startPage = Math.max(1, endPage - maxButtons + 1);
                }
                
                for (let i = startPage; i <= endPage; i++) {
                  pages.push(
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i)}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl text-xs font-semibold transition-all cursor-pointer font-mono ${
                        currentPage === i
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {i}
                    </button>
                  );
                }
                return pages;
              })()}

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="w-9 h-9 flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer disabled:pointer-events-none"
              >
                {isRtl ? <ChevronLeft className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
              </button>
            </div>

            {/* Vertical Divider */}
            <div className="hidden md:block h-6 w-px bg-slate-200" />

            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 font-vazir">
                {locale === "fa" ? "تعداد در صفحه:" : locale === "de" ? "Pro Seite:" : "Per page:"}
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-9 px-2.5 border border-slate-200 bg-white rounded-xl text-xs font-bold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Vertical Divider */}
            <div className="hidden md:block h-6 w-px bg-slate-200" />

            {/* Jump to Page Input */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 font-vazir">
                {locale === "fa" ? "برو به صفحه:" : locale === "de" ? "Gehe zu Seite:" : "Go to page:"}
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={pageInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d+$/.test(val)) {
                      setPageInput(val);
                      if (val !== "") {
                        const num = parseInt(val, 10);
                        if (num >= 1 && num <= totalPages) {
                          setCurrentPage(num);
                        }
                      }
                    }
                  }}
                  onBlur={() => {
                    setPageInput(String(currentPage));
                  }}
                  className="w-12 h-9 text-center border border-slate-200 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono shadow-2xs"
                />
                <span className="text-xs text-slate-400 font-mono">/ {totalPages}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete/Reset Confirmation Modal */}
      {verbToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs no-print">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className={`text-lg font-bold text-slate-900 ${isRtl ? "text-right font-vazir" : "text-left"}`}>
              {locale === "fa" ? "حذف یا بازنشانی فعل" : locale === "de" ? "Verb zurücksetzen" : "Reset or Remove Verb"}
            </h3>
            <p className={`mt-3 text-sm text-slate-600 leading-relaxed ${isRtl ? "text-right font-vazir" : "text-left"}`}>
              {t.resetVerbConfirm.replace("{verb}", verbToDelete)}
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setVerbToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-all font-vazir cursor-pointer"
              >
                {locale === "fa" ? "انصراف" : locale === "de" ? "Abbrechen" : "Cancel"}
              </button>
              <button
                onClick={confirmDeleteVerb}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition-all shadow-sm shadow-red-100 font-vazir cursor-pointer"
              >
                {locale === "fa" ? "حذف شود" : locale === "de" ? "Ja, löschen" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verb JSON Import Modal */}
      {showVerbJsonModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className={`bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 ${isRtl ? "text-right" : "text-left"}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-vazir">
                <FileCode className="w-5 h-5 text-purple-600" />
                {locale === "fa" ? "ورود گروهی افعال از JSON" : "Bulk Import Verbs from JSON"}
              </h3>
              <button
                onClick={() => setShowVerbJsonModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI Toggle */}
            <div className="bg-purple-50 border border-purple-200 p-3.5 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-900 font-vazir">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>تکمیل خودکار معانی، نقش‌ها و تمام صرف‌ها با هوش مصنوعی</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={enableAiVerbJsonImport}
                  onChange={(e) => setEnableAiVerbJsonImport(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* File Upload Option */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 font-vazir block">
                {locale === "fa" ? "انتخاب فایل JSON از کامپیوتر / گوشی:" : "Choose JSON file:"}
              </label>
              <input
                ref={verbFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleVerbFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => verbFileInputRef.current?.click()}
                className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer font-vazir"
              >
                <Upload className="w-4 h-4 text-indigo-600" />
                {locale === "fa" ? "بارگذاری فایل JSON" : "Upload JSON File"}
              </button>
            </div>

            <div className="relative flex items-center justify-center">
              <hr className="w-full border-slate-200" />
              <span className="absolute bg-white px-3 text-[11px] text-slate-400 font-vazir">یا جای‌گذاری متن JSON</span>
            </div>

            {/* JSON Text Input */}
            <div className="space-y-2">
              <textarea
                rows={6}
                value={verbJsonInputText}
                onChange={(e) => setVerbJsonInputText(e.target.value)}
                placeholder={`[\n  "gehen",\n  "sprechen",\n  "kaufen"\n]`}
                className="w-full p-3 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50 dir-ltr text-left"
              />
            </div>

            {/* Messages */}
            {verbJsonImportError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-vazir">
                {verbJsonImportError}
              </div>
            )}
            {verbJsonImportSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-vazir leading-relaxed">
                {verbJsonImportSuccess}
              </div>
            )}

            {/* Submit / Action Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowVerbJsonModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all font-vazir cursor-pointer"
              >
                {locale === "fa" ? "انصراف" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={!verbJsonInputText.trim()}
                onClick={() => processVerbJsonImport(verbJsonInputText)}
                className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-all shadow-md shadow-purple-100 font-vazir cursor-pointer disabled:opacity-40"
              >
                {locale === "fa" ? "پردازش و درون‌ریزی افعال" : "Import Verbs"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

interface CellEditorProps {
  verb: string;
  field: string;
  value: string;
  onSave: () => void;
  editingCell: { verb: string; field: string; value: string } | null;
  setEditingCell: (val: { verb: string; field: string; value: string } | null) => void;
}

function CellEditor({ verb, field, value, onSave, editingCell, setEditingCell }: CellEditorProps) {
  const isEditing = editingCell?.verb === verb && editingCell?.field === field;

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 no-print justify-center">
        <input
          type="text"
          value={editingCell.value}
          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
          className="px-1.5 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 bg-white max-w-full text-center"
          style={{ width: `${Math.max(6, (editingCell.value || "").length + 2)}ch` }}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") setEditingCell(null);
          }}
        />
        <button onClick={onSave} className="p-0.5 bg-green-600 text-white rounded hover:bg-green-700">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={() => setEditingCell(null)} className="p-0.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditingCell({ verb, field, value })}
      className="cursor-pointer hover:bg-slate-100 px-1.5 py-1 rounded transition-all text-xs font-medium text-slate-700 inline-flex items-center gap-1 w-full justify-center"
    >
      <span className={value === "-" || !value ? "text-slate-300" : ""}>{value || "-"}</span>
      <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-40 shrink-0" />
    </div>
  );
}
