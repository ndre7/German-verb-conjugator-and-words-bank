import Dexie, { type Table } from "dexie";
import { Tense, type UserOverride, type Category, type TenseConjugations, type VerbItem, type ConjugationPerson, type AppChangeLog, type VocabChangeLog, type VocabularyItem, type ArticleType, type PartOfSpeech, type VocabularyCategory, type SynonymAntonymGroup, type SavedStory } from "./types";
import sampleDb from "./German_DB_sample_file.json";

// ----------------------------------------------------
// Dexie DB Setup
// ----------------------------------------------------
export class VerbConjugationDatabase extends Dexie {
  overrides!: Table<UserOverride, string>;
  categories!: Table<Category, string>;
  settings!: Table<{ key: string; value: any }, string>;
  vocabularies!: Table<VocabularyItem, string>;
  vocabCategories!: Table<VocabularyCategory, string>;
  synonymAntonymGroups!: Table<SynonymAntonymGroup, string>;
  savedStories!: Table<SavedStory, string>;

  constructor() {
    super("GermanVerbManagerDB");
    this.version(1).stores({
      overrides: "infinitive, sortOrder",
      categories: "id, name",
      settings: "key",
    });
    this.version(2).stores({
      overrides: "infinitive, sortOrder",
      categories: "id, name",
      settings: "key",
      vocabularies: "id, word, article, partOfSpeech"
    });
    this.version(3).stores({
      overrides: "infinitive, sortOrder",
      categories: "id, name",
      settings: "key",
      vocabularies: "id, word, article, partOfSpeech",
      vocabCategories: "id, name",
      synonymAntonymGroups: "id, title, type"
    });
    this.version(4).stores({
      overrides: "infinitive, sortOrder",
      categories: "id, name",
      settings: "key",
      vocabularies: "id, word, article, partOfSpeech",
      vocabCategories: "id, name",
      synonymAntonymGroups: "id, title, type",
      savedStories: "id, title, createdAt, cefrLevel"
    });
  }
}

export const db = new VerbConjugationDatabase();


// ----------------------------------------------------
// DatabaseService Class
// ----------------------------------------------------
export class DatabaseService {
  private static instance: DatabaseService;
  private verbsCache: Record<string, TenseConjugations> = {};
  private loaded: boolean = false;
  private env: "tauri" | "chrome_extension" | "browser" = "browser";
  
  // In-Memory Fallback fields in case IndexedDB is restricted or throws SecurityErrors
  private useInMemoryFallback: boolean = false;
  private inMemorySettings: Record<string, any> = {};
  private inMemoryOverrides: Record<string, UserOverride> = {};
  private inMemorySavedStories: SavedStory[] = [];
  private inMemoryCategories: Category[] = [
    { id: "regular", name: "Regelmäßig", color: "#10B981" },
    { id: "irregular", name: "Unregelmäßig", color: "#EF4444" },
    { id: "separable", name: "Trennbar", color: "#3B82F6" },
    { id: "reflexive", name: "Reflexiv", color: "#8B5CF6" },
    { id: "akkusativ", name: "Akkusativ", color: "#EC4899" },
    { id: "dativ", name: "Dativ", color: "#06B6D4" },
    { id: "favorites", name: "Favoriten", color: "#F59E0B" },
  ];

  private constructor() {
    this.detectEnvironment();
  }

  public isFallbackActive(): boolean {
    return this.useInMemoryFallback;
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Detects whether the app is running in Tauri, Chrome Extension, or standard Web Browser.
   */
  private detectEnvironment(): void {
    // Tauri sets __TAURI_IPC__ or other window objects
    if (typeof window !== "undefined" && (window as any).__TAURI_IPC__ !== undefined) {
      this.env = "tauri";
    }
    // Chrome Extension sets chrome.runtime
    else if (typeof window !== "undefined" && (window as any).chrome && (window as any).chrome.runtime && (window as any).chrome.runtime.id) {
      this.env = "chrome_extension";
    } else {
      this.env = "browser";
    }
  }

  public getEnvironment(): "tauri" | "chrome_extension" | "browser" {
    return this.env;
  }

  public async getSetting<T>(key: string): Promise<T | null> {
    // 1. Check memory cache first
    const memVal = this.inMemorySettings[key];
    if (memVal !== undefined) return memVal as T;

    // 2. Check localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const localVal = window.localStorage.getItem(`g_verb_setting_${key}`);
        if (localVal !== null) {
          const parsed = JSON.parse(localVal);
          this.inMemorySettings[key] = parsed;
          return parsed as T;
        }
      }
    } catch (e) {
      console.warn(`localStorage read failed for key ${key}`, e);
    }

    // 3. Check IndexedDB
    if (!this.useInMemoryFallback) {
      try {
        await db.open();
        const setting = await db.settings.get(key);
        if (setting) {
          this.inMemorySettings[key] = setting.value;
          return setting.value as T;
        }
      } catch (e) {
        console.warn(`IndexedDB read failed for key ${key}, falling back`, e);
        this.useInMemoryFallback = true;
      }
    }

    return null;
  }

  public async saveSetting(key: string, value: any): Promise<void> {
    // Always update memory
    this.inMemorySettings[key] = value;

    // Always attempt to save to localStorage as a durable fallback for reloads
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(`g_verb_setting_${key}`, JSON.stringify(value));
      }
    } catch (e) {
      console.warn(`localStorage write failed for key ${key}`, e);
    }

    // Attempt IndexedDB
    if (!this.useInMemoryFallback) {
      try {
        await db.open();
        await db.settings.put({ key, value });
      } catch (e) {
        console.warn(`IndexedDB write failed for key ${key}, falling back`, e);
        this.useInMemoryFallback = true;
      }
    }
  }

  public async deleteSetting(key: string): Promise<void> {
    // Clear from memory
    delete this.inMemorySettings[key];

    // Clear from localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(`g_verb_setting_${key}`);
      }
    } catch (e) {
      console.warn(`localStorage remove failed for key ${key}`, e);
    }

    // Clear from IndexedDB
    if (!this.useInMemoryFallback) {
      try {
        await db.open();
        await db.settings.delete(key);
      } catch (e) {
        console.warn(`IndexedDB delete failed for key ${key}`, e);
      }
    }
  }

  /**
   * Loads the base database into cache.
   */
  public async loadDatabase(customJsonContent?: string): Promise<Record<string, TenseConjugations>> {
    // Attempt to open/verify IndexedDB connection to catch SecurityError early
    if (!this.useInMemoryFallback) {
      try {
        await db.open();
      } catch (e) {
        console.warn("IndexedDB (Dexie) is not accessible (e.g. running from file:// or restricted webview). Falling back to in-memory mode.", e);
        this.useInMemoryFallback = true;
      }
    }

    if (customJsonContent) {
      try {
        const parsed = JSON.parse(customJsonContent);
        const success = this.cacheJsonDatabase(parsed);
        if (!success) {
          throw new Error("No valid verb conjugation data found in the uploaded JSON file.");
        }
        
        await this.saveSetting("cached_base_json", customJsonContent);
        await this.deleteSetting("verbs_custom_order");
        
        this.loaded = true;
        return this.verbsCache;
      } catch (err) {
        console.error("Failed to parse custom JSON content", err);
        throw err;
      }
    }

    // Try loading cached JSON from Settings
    const storedBaseVal = await this.getSetting<string>("cached_base_json");

    if (storedBaseVal) {
      try {
        const parsed = JSON.parse(storedBaseVal);
        const success = this.cacheJsonDatabase(parsed);
        if (success) {
          this.loaded = true;
          return this.verbsCache;
        }
        console.warn("Stored base JSON in DB is invalid or empty, falling back");
      } catch (e) {
        console.warn("Stored base JSON in DB is invalid, falling back", e);
      }
    }

    // Try loading from tauri_json_path if configured (Tauri native file read or Fetch fallback)
    const savedPathVal = await this.getSetting<string>("tauri_json_path");
    if (savedPathVal) {
      try {
        let content: string | null = null;
        
        // A. Try Tauri native FS if available
        const w = window as any;
        if (w.__TAURI__) {
          try {
            if (w.__TAURI__.fs && typeof w.__TAURI__.fs.readTextFile === "function") {
              content = await w.__TAURI__.fs.readTextFile(savedPathVal);
            } else if (w.__TAURI__.invoke) {
              content = await w.__TAURI__.invoke("read_text_file", { path: savedPathVal });
            }
          } catch (tauriFsErr) {
            console.warn("Failed to read file via Tauri FS", tauriFsErr);
          }
        }
        
        // B. Try standard Fetch as fallback (allows relative path testing in browser)
        if (!content) {
          try {
            const response = await fetch(savedPathVal);
            if (response.ok) {
              content = await response.text();
            }
          } catch (fetchErr) {
            console.warn("Failed to read file via Fetch fallback", fetchErr);
          }
        }
        
        if (content) {
          const parsed = JSON.parse(content);
          const success = this.cacheJsonDatabase(parsed);
          if (success) {
            this.loaded = true;
            return this.verbsCache;
          }
        }
      } catch (e) {
        console.error("Tauri/Path file read failed", e);
      }
    }

    // Fallback to bundled sample database
    this.cacheJsonDatabase(sampleDb);
    this.loaded = true;
    return this.verbsCache;
  }

  /**
   * Reads and validates JSON file content from a path or URL
   */
  public async tryReadDatabaseFromPath(path: string): Promise<boolean> {
    try {
      let content: string | null = null;
      
      // A. Try Tauri native FS if available
      const w = window as any;
      if (w.__TAURI__) {
        try {
          if (w.__TAURI__.fs && typeof w.__TAURI__.fs.readTextFile === "function") {
            content = await w.__TAURI__.fs.readTextFile(path);
          } else if (w.__TAURI__.invoke) {
            content = await w.__TAURI__.invoke("read_text_file", { path });
          }
        } catch (tauriFsErr) {
          console.warn("Failed to read file via Tauri FS", tauriFsErr);
        }
      }
      
      // B. Try standard Fetch as a fallback
      if (!content) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            content = await response.text();
          }
        } catch (fetchErr) {
          console.warn("Failed to read file via Fetch fallback", fetchErr);
        }
      }
      
      if (content) {
        const parsed = JSON.parse(content);
        return this.cacheJsonDatabase(parsed);
      }
    } catch (err) {
      console.error("tryReadDatabaseFromPath failed", err);
    }
    return false;
  }

  /**
   * Parse and load raw JSON database structure into singleton memory cache
   */
  private cacheJsonDatabase(json: any): boolean {
    if (!json || typeof json !== "object") return false;

    const tempCache: Record<string, TenseConjugations> = {};
    let count = 0;

    for (const [infinitive, verbObj] of Object.entries(json)) {
      if (!verbObj || typeof verbObj !== "object") continue;

      // Case 1: wrapped in success and data
      if ((verbObj as any).success && (verbObj as any).data) {
        tempCache[infinitive.toLowerCase().trim()] = (verbObj as any).data;
        count++;
      }
      // Case 2: direct conjugations (e.g., has PRASENS or PERFEKT keys)
      else if (
        (verbObj as any).PRASENS ||
        (verbObj as any).PRATERITUM ||
        (verbObj as any).PERFEKT
      ) {
        tempCache[infinitive.toLowerCase().trim()] = verbObj as TenseConjugations;
        count++;
      }
    }

    if (count > 0) {
      this.verbsCache = tempCache;
      return true;
    }
    return false;
  }

  /**
   * Get all infinitives currently loaded in the memory cache
   */
  public getLoadedInfinitives(): string[] {
    return Object.keys(this.verbsCache);
  }

  /**
   * Fetches all verbs in bulk, loading all overrides in a single IndexedDB transaction to maximize performance
   */
  public async getAllVerbs(): Promise<VerbItem[]> {
    const infinitivesSet = new Set<string>();
    for (const inf of this.getLoadedInfinitives()) {
      infinitivesSet.add(inf.toLowerCase().trim());
    }
    
    // 1. Get all overrides in one single fast transaction and add their infinitives
    const overridesMap = new Map<string, UserOverride>();
    if (this.useInMemoryFallback) {
      for (const [k, v] of Object.entries(this.inMemoryOverrides)) {
        overridesMap.set(k, v);
        infinitivesSet.add(v.infinitive || k);
      }
    } else {
      try {
        const list = await db.overrides.toArray();
        for (const item of list) {
          const key = item.infinitive.toLowerCase().trim();
          overridesMap.set(key, item);
          infinitivesSet.add(item.infinitive || key);
        }
      } catch (dbErr) {
        console.warn("Failed to bulk get overrides from IndexedDB, using fallback.", dbErr);
        this.useInMemoryFallback = true;
        for (const [k, v] of Object.entries(this.inMemoryOverrides)) {
          overridesMap.set(k, v);
          infinitivesSet.add(v.infinitive || k);
        }
      }
    }

    const infinitives = Array.from(infinitivesSet);
    const verbs: VerbItem[] = [];
    const tenses = Object.values(Tense);

    for (const inf of infinitives) {
      const key = inf.toLowerCase().trim();
      const baseConjugations = this.verbsCache[key];
      const override = overridesMap.get(key);

      if (override?.isDeleted) {
        continue;
      }

      if (!baseConjugations && !override) {
        continue;
      }

      let hilfsverb = "haben";
      let bedeutung = "";
      let categories: string[] = [];
      let mergedConjugations: TenseConjugations = JSON.parse(JSON.stringify(baseConjugations || {}));
      let sortOrder = override?.sortOrder ?? 9999;

      if (baseConjugations?.PERFEKT?.S1?.[0]) {
        const helper = baseConjugations.PERFEKT.S1[0].toLowerCase();
        if (helper === "bin" || helper === "ist" || helper === "sein" || helper === "sind") {
          hilfsverb = "sein";
        }
      }

      let hasCustomCategories = false;
      if (override) {
        if (override.hilfsverb) hilfsverb = override.hilfsverb;
        if (override.bedeutung) bedeutung = override.bedeutung;
        if (override.categories) {
          categories = override.categories;
          hasCustomCategories = true;
        }

        if (override.cellOverrides) {
          for (const [cellKey, value] of Object.entries(override.cellOverrides)) {
            const splitIdx = cellKey.indexOf("_");
            if (splitIdx > 0) {
              const tense = cellKey.substring(0, splitIdx);
              const person = splitIdx + 1 < cellKey.length ? (cellKey.substring(splitIdx + 1) as keyof ConjugationPerson) : "S1" as any;

              if (!mergedConjugations[tense]) {
                mergedConjugations[tense] = { S1: [], S2: [], S3: [], P1: [], P2: [], P3: [] };
              }
              mergedConjugations[tense][person] = value ? value.split(/\s+/) : [];
            }
          }
        }
      }

      for (const t of tenses) {
        if (!mergedConjugations[t]) {
          mergedConjugations[t] = {
            S1: [], S2: [], S3: [], P1: [], P2: [], P3: []
          };
        }
      }

      if (!hasCustomCategories) {
        categories = this.autoDetectCategories(override?.infinitive || inf, mergedConjugations);
      }

      verbs.push({
        infinitive: override?.infinitive || inf,
        hilfsverb,
        bedeutung,
        categories,
        conjugations: mergedConjugations,
        sortOrder
      });
    }

    return verbs;
  }

  /**
   * Fetches a single verb, merging the base cache with IndexedDB manual overrides
   */
  public async getVerb(infinitive: string): Promise<VerbItem | null> {
    const key = infinitive.toLowerCase().trim();
    const baseConjugations = this.verbsCache[key];

    // Get user-specific override from IndexedDB with safe fallback
    let override: UserOverride | undefined = undefined;
    if (this.useInMemoryFallback) {
      override = this.inMemoryOverrides[key];
    } else {
      try {
        override = await db.overrides.get(key);
      } catch (dbErr) {
        console.warn("Failed to get override from IndexedDB, using fallback.", dbErr);
        this.useInMemoryFallback = true;
        override = this.inMemoryOverrides[key];
      }
    }

    if (override?.isDeleted) {
      return null;
    }

    if (!baseConjugations && !override) {
      return null;
    }

    // 1. Establish basic default fields
    let hilfsverb = "haben";
    let bedeutung = "";
    let categories: string[] = [];
    let mergedConjugations: TenseConjugations = JSON.parse(JSON.stringify(baseConjugations || {}));
    let sortOrder = override?.sortOrder ?? 9999;

    // Detect basic auxiliary verb from PERFECT tense if available in base data
    if (baseConjugations?.PERFEKT?.S1?.[0]) {
      const helper = baseConjugations.PERFEKT.S1[0].toLowerCase();
      if (helper === "bin" || helper === "ist" || helper === "sein" || helper === "sind") {
        hilfsverb = "sein";
      }
    }

    // 2. Apply database manual overrides
    let hasCustomCategories = false;
    if (override) {
      if (override.hilfsverb) hilfsverb = override.hilfsverb;
      if (override.bedeutung) bedeutung = override.bedeutung;
      if (override.categories) {
        categories = override.categories;
        hasCustomCategories = true;
      }

      // Apply cell-by-cell overrides
      if (override.cellOverrides) {
        for (const [cellKey, value] of Object.entries(override.cellOverrides)) {
          // cellKey format: "TENSE_PERSON", e.g., "PRASENS_S1"
          const splitIdx = cellKey.indexOf("_");
          if (splitIdx > 0) {
            const tense = cellKey.substring(0, splitIdx);
            const person = splitIdx + 1 < cellKey.length ? (cellKey.substring(splitIdx + 1) as keyof ConjugationPerson) : "S1" as any;

            if (!mergedConjugations[tense]) {
              mergedConjugations[tense] = { S1: [], S2: [], S3: [], P1: [], P2: [], P3: [] };
            }
            // Value is stored as string in overrides, convert to the standard array format
            mergedConjugations[tense][person] = value ? value.split(/\s+/) : [];
          }
        }
      }
    }

    // Fallback default empty conjugation structure if absolutely nothing exists
    const tenses = Object.values(Tense);
    for (const t of tenses) {
      if (!mergedConjugations[t]) {
        mergedConjugations[t] = {
          S1: [], S2: [], S3: [], P1: [], P2: [], P3: []
        };
      }
    }

    // If no custom categories are specified, auto-classify based on linguistic patterns!
    if (!hasCustomCategories) {
      categories = this.autoDetectCategories(override?.infinitive || infinitive, mergedConjugations);
    }

    return {
      infinitive: override?.infinitive || infinitive,
      hilfsverb,
      bedeutung,
      categories,
      conjugations: mergedConjugations,
      sortOrder
    };
  }

  /**
   * Add or update a new verb explicitly, ensuring it is un-deleted and prepended to customOrder
   */
  public async addVerb(verbData: {
    infinitive: string;
    bedeutung?: string;
    hilfsverb?: string;
    categories?: string[];
    cellOverrides?: Record<string, string>;
  }): Promise<void> {
    const rawInf = verbData.infinitive.trim();
    if (!rawInf) return;
    const key = rawInf.toLowerCase();

    // 1. Save override with isDeleted: false
    await this.saveOverride(rawInf, {
      infinitive: rawInf,
      bedeutung: verbData.bedeutung || "",
      hilfsverb: verbData.hilfsverb || "haben",
      categories: verbData.categories && verbData.categories.length > 0 ? verbData.categories : ["regular"],
      cellOverrides: verbData.cellOverrides || {},
      isDeleted: false
    });

    // 2. Prepend this verb to customOrder so it appears at the very top of Page 1!
    const currentOrder = await this.getCustomOrder();
    const updatedOrder = [key, ...currentOrder.filter(k => k !== key)];
    await this.saveCustomOrder(updatedOrder);
  }

  /**
   * Save a cell override or field override to IndexedDB or fallback
   */
  public async saveOverride(infinitive: string, fields: Partial<UserOverride>): Promise<void> {
    const key = infinitive.toLowerCase().trim();
    let existing: UserOverride | undefined = undefined;

    if (this.useInMemoryFallback) {
      existing = this.inMemoryOverrides[key];
    } else {
      try {
        existing = await db.overrides.get(key);
      } catch (dbErr) {
        console.warn("Database get failed, switching to fallback", dbErr);
        this.useInMemoryFallback = true;
        existing = this.inMemoryOverrides[key];
      }
    }

    const previousOverride = existing ? JSON.parse(JSON.stringify(existing)) : null;
    const baseExisting = existing || { infinitive: infinitive, cellOverrides: {} };

    const updated: UserOverride = {
      ...baseExisting,
      ...fields,
      cellOverrides: {
        ...(baseExisting.cellOverrides || {}),
        ...(fields.cellOverrides || {})
      }
    };

    if (fields.isDeleted !== undefined) {
      updated.isDeleted = fields.isDeleted;
    } else if (previousOverride && previousOverride.isDeleted) {
      // If updating a soft-deleted verb without explicitly setting isDeleted: true, restore it!
      updated.isDeleted = false;
    }

    // Determine if this override contains active content
    const hasCellOverrides = updated.cellOverrides && Object.keys(updated.cellOverrides).length > 0;
    const hasOtherOverrides = !!(
      updated.bedeutung !== undefined ||
      updated.hilfsverb !== undefined ||
      (updated.categories && updated.categories.length > 0) ||
      updated.sortOrder !== undefined ||
      updated.isDeleted !== undefined ||
      updated.infinitive
    );

    if (this.useInMemoryFallback) {
      if (!hasCellOverrides && !hasOtherOverrides) {
        delete this.inMemoryOverrides[key];
      } else {
        this.inMemoryOverrides[key] = updated;
      }
    } else {
      try {
        if (!hasCellOverrides && !hasOtherOverrides) {
          await db.overrides.delete(key);
        } else {
          await db.overrides.put(updated);
        }
      } catch (dbErr) {
        console.warn("Database put failed, writing to fallback memory", dbErr);
        this.useInMemoryFallback = true;
        if (!hasCellOverrides && !hasOtherOverrides) {
          delete this.inMemoryOverrides[key];
        } else {
          this.inMemoryOverrides[key] = updated;
        }
      }
    }

    // Now, log the change!
    let changeType: "cell_edit" | "field_edit" | "category_toggle" | "verb_delete" | "verb_add" = "field_edit";
    if (fields.isDeleted === true) {
      changeType = "verb_delete";
    } else if (previousOverride === null && fields.infinitive !== undefined) {
      changeType = "verb_add";
    } else if (fields.cellOverrides !== undefined) {
      changeType = "cell_edit";
    } else if (fields.categories !== undefined) {
      changeType = "category_toggle";
    }

    // We do not want to log simple re-order changes or background initializations
    const isJustOrdering = fields.sortOrder !== undefined && Object.keys(fields).length === 1;
    if (!isJustOrdering) {
      await this.logChange(infinitive, changeType, previousOverride, fields);
    }
  }

  public async getChangeLogs(): Promise<AppChangeLog[]> {
    return (await this.getSetting<AppChangeLog[]>("change_history_log")) || [];
  }

  public async logChange(
    verb: string,
    type: "cell_edit" | "field_edit" | "category_toggle" | "verb_delete" | "verb_add",
    previousOverride: UserOverride | null,
    fields: Partial<UserOverride>
  ): Promise<void> {
    let descEn = "";
    let descFa = "";
    let descDe = "";

    const capitalizedVerb = verb.charAt(0).toUpperCase() + verb.slice(1);

    if (type === "verb_add" || (previousOverride === null && fields.infinitive)) {
      descEn = `Added new verb "${capitalizedVerb}"`;
      descFa = `فعل جدید "${capitalizedVerb}" اضافه شد`;
      descDe = `Neues Verb "${capitalizedVerb}" hinzugefügt`;
    } else if (type === "verb_delete" || fields.isDeleted === true) {
      descEn = `Deleted verb "${capitalizedVerb}"`;
      descFa = `فعل "${capitalizedVerb}" حذف شد`;
      descDe = `Verb "${capitalizedVerb}" gelöscht`;
    } else if (fields.hilfsverb !== undefined) {
      descEn = `Changed auxiliary verb of "${capitalizedVerb}" to "${fields.hilfsverb}"`;
      descFa = `فعل کمکی "${capitalizedVerb}" به "${fields.hilfsverb}" تغییر یافت`;
      descDe = `Hilfsverb von "${capitalizedVerb}" in "${fields.hilfsverb}" geändert`;
    } else if (fields.bedeutung !== undefined) {
      descEn = `Changed meaning of "${capitalizedVerb}" to "${fields.bedeutung}"`;
      descFa = `معنی "${capitalizedVerb}" به "${fields.bedeutung}" تغییر یافت`;
      descDe = `Bedeutung von "${capitalizedVerb}" in "${fields.bedeutung}" geändert`;
    } else if (fields.categories !== undefined) {
      descEn = `Updated categories of "${capitalizedVerb}"`;
      descFa = `دسته‌بندی‌های فعل "${capitalizedVerb}" بروزرسانی شد`;
      descDe = `Kategorien von "${capitalizedVerb}" aktualisiert`;
    } else if (fields.cellOverrides !== undefined) {
      descEn = `Edited conjugation of "${capitalizedVerb}"`;
      descFa = `صرف فعل "${capitalizedVerb}" ویرایش شد`;
      descDe = `Konjugation von "${capitalizedVerb}" bearbeitet`;
    } else {
      descEn = `Modified "${capitalizedVerb}"`;
      descFa = `فعل "${capitalizedVerb}" ویرایش شد`;
      descDe = `Verb "${capitalizedVerb}" bearbeitet`;
    }

    const newLog: AppChangeLog = {
      id: Math.random().toString(36).substring(2, 9) + "_" + Date.now(),
      timestamp: Date.now(),
      verb: capitalizedVerb,
      type,
      descFa,
      descEn,
      descDe,
      previousOverride
    };

    const currentLogs = await this.getChangeLogs();
    const updatedLogs = [newLog, ...currentLogs].slice(0, 15);
    await this.saveSetting("change_history_log", updatedLogs);
  }

  public async undoChange(logId: string): Promise<void> {
    const logs = await this.getChangeLogs();
    const targetLog = logs.find(l => l.id === logId);
    if (!targetLog) return;

    const key = targetLog.verb.toLowerCase().trim();
    if (targetLog.previousOverride === null) {
      if (!this.useInMemoryFallback) {
        try {
          await db.open();
          await db.overrides.delete(key);
        } catch (e) {
          delete this.inMemoryOverrides[key];
        }
      } else {
        delete this.inMemoryOverrides[key];
      }
    } else {
      if (!this.useInMemoryFallback) {
        try {
          await db.open();
          await db.overrides.put(targetLog.previousOverride);
        } catch (e) {
          this.inMemoryOverrides[key] = targetLog.previousOverride;
        }
      } else {
        this.inMemoryOverrides[key] = targetLog.previousOverride;
      }
    }

    const updatedLogs = logs.filter(l => l.id !== logId);
    await this.saveSetting("change_history_log", updatedLogs);
  }

  // ----------------------------------------------------
  // Vocabulary History & Change Logs
  // ----------------------------------------------------
  public async getVocabChangeLogs(): Promise<VocabChangeLog[]> {
    return (await this.getSetting<VocabChangeLog[]>("vocab_change_history_log")) || [];
  }

  public async logVocabChange(
    word: string,
    type: "vocab_add" | "vocab_delete" | "vocab_edit",
    previousItem: VocabularyItem | null
  ): Promise<void> {
    let descEn = "";
    let descFa = "";
    let descDe = "";

    const displayWord = word.trim();

    if (type === "vocab_add") {
      descEn = `Added vocabulary item "${displayWord}"`;
      descFa = `واژه جدید "${displayWord}" اضافه شد`;
      descDe = `Neues Wort "${displayWord}" hinzugefügt`;
    } else if (type === "vocab_delete") {
      descEn = `Deleted vocabulary item "${displayWord}"`;
      descFa = `واژه "${displayWord}" حذف شد`;
      descDe = `Wort "${displayWord}" gelöscht`;
    } else {
      descEn = `Updated vocabulary item "${displayWord}"`;
      descFa = `واژه "${displayWord}" ویرایش شد`;
      descDe = `Wort "${displayWord}" bearbeitet`;
    }

    const newLog: VocabChangeLog = {
      id: "vlog_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now(),
      timestamp: Date.now(),
      word: displayWord,
      type,
      descFa,
      descEn,
      descDe,
      previousItem
    };

    const currentLogs = await this.getVocabChangeLogs();
    const updatedLogs = [newLog, ...currentLogs].slice(0, 20);
    await this.saveSetting("vocab_change_history_log", updatedLogs);
  }

  public async undoVocabChange(logId: string): Promise<void> {
    const logs = await this.getVocabChangeLogs();
    const targetLog = logs.find(l => l.id === logId);
    if (!targetLog) return;

    if (targetLog.type === "vocab_add") {
      // Undo add = delete item if exists
      const allVocabs = await this.getVocabularies();
      const existing = allVocabs.find(v => v.word.toLowerCase().trim() === targetLog.word.toLowerCase().trim());
      if (existing) {
        await this.deleteVocabularyDirect(existing.id);
      }
    } else if (targetLog.type === "vocab_delete" || targetLog.type === "vocab_edit") {
      // Undo delete/edit = restore previous item state
      if (targetLog.previousItem) {
        await this.saveVocabularyDirect(targetLog.previousItem);
      }
    }

    const updatedLogs = logs.filter(l => l.id !== logId);
    await this.saveSetting("vocab_change_history_log", updatedLogs);
  }


  /**
   * Rename/edit the spelling of a verb infinitive
   */
  public async renameVerbInfinitive(oldInfinitive: string, newInfinitive: string): Promise<void> {
    const oldKey = oldInfinitive.toLowerCase().trim();
    const newKey = newInfinitive.toLowerCase().trim();
    if (!newKey || oldKey === newKey) return;

    let existing: UserOverride | undefined = undefined;
    if (this.useInMemoryFallback) {
      existing = this.inMemoryOverrides[oldKey];
    } else {
      try {
        existing = await db.overrides.get(oldKey);
      } catch (e) {
        existing = this.inMemoryOverrides[oldKey];
      }
    }

    const baseOverride = existing || { infinitive: oldInfinitive, cellOverrides: {} };

    // Soft delete or remove old key
    if (this.useInMemoryFallback) {
      delete this.inMemoryOverrides[oldKey];
    } else {
      try {
        await db.overrides.delete(oldKey);
      } catch (e) {}
    }

    // Save under new key
    const newOverride: UserOverride = {
      ...baseOverride,
      infinitive: newInfinitive.trim(),
      isDeleted: false,
    };

    if (this.useInMemoryFallback) {
      this.inMemoryOverrides[newKey] = newOverride;
    } else {
      try {
        await db.overrides.put(newOverride);
      } catch (e) {
        this.inMemoryOverrides[newKey] = newOverride;
      }
    }

    // Update verbs_custom_order
    const customOrder = await this.getCustomOrder();
    const updatedOrder = customOrder.map((k) => (k === oldKey ? newKey : k));
    if (!updatedOrder.includes(newKey)) {
      updatedOrder.unshift(newKey);
    }
    await this.saveCustomOrder(updatedOrder);
  }

  /**
   * Delete override and reset a verb to original base state (completely hide it)
   */
  public async resetVerb(infinitive: string): Promise<void> {
    const key = infinitive.toLowerCase().trim();
    
    // Completely hide the verb from lists by marking it deleted (soft delete)
    await this.saveOverride(infinitive, { isDeleted: true });

    const order = await this.getSetting<string[]>("verbs_custom_order");
    if (order) {
      const updated = order.filter((k) => k !== key);
      await this.saveSetting("verbs_custom_order", updated);
    }
  }

  public async deleteVerb(infinitive: string): Promise<void> {
    await this.resetVerb(infinitive);
  }

  /**
   * Get custom order list from DB settings or memory
   */
  public async getCustomOrder(): Promise<string[]> {
    return (await this.getSetting<string[]>("verbs_custom_order")) || [];
  }

  /**
   * Save custom order list to DB settings or memory
   */
  public async saveCustomOrder(order: string[]): Promise<void> {
    const normalized = order.map(inf => inf.toLowerCase().trim());
    await this.saveSetting("verbs_custom_order", normalized);
  }

  /**
   * Retrieve all categories from DB or memory, seeded with defaults if empty
   */
  public async getCategories(): Promise<Category[]> {
    if (this.useInMemoryFallback) {
      return [...this.inMemoryCategories];
    }
    try {
      const list = await db.categories.toArray();
      if (list.length === 0) {
        const defaults: Category[] = [
          { id: "regular", name: "Regelmäßig", color: "#10B981" },
          { id: "irregular", name: "Unregelmäßig", color: "#EF4444" },
          { id: "separable", name: "Trennbar", color: "#3B82F6" },
          { id: "reflexive", name: "Reflexiv", color: "#8B5CF6" },
          { id: "akkusativ", name: "Akkusativ", color: "#EC4899" },
          { id: "dativ", name: "Dativ", color: "#06B6D4" },
          { id: "favorites", name: "Favoriten", color: "#F59E0B" },
        ];
        try {
          await db.categories.bulkAdd(defaults);
        } catch (addErr) {
          console.warn("Failed to save default categories to DB", addErr);
        }
        return defaults;
      }
      
      const missingCategories = [
        { id: "akkusativ", name: "Akkusativ", color: "#EC4899" },
        { id: "dativ", name: "Dativ", color: "#06B6D4" },
        { id: "favorites", name: "Favoriten", color: "#F59E0B" },
      ];

      for (const cat of missingCategories) {
        if (!list.some(c => c.id === cat.id)) {
          try {
            await db.categories.add(cat);
            list.push(cat);
          } catch (e) {}
        }
      }
      
      return list;
    } catch (dbErr) {
      console.warn("Database getCategories failed, using in-memory defaults", dbErr);
      this.useInMemoryFallback = true;
      return [...this.inMemoryCategories];
    }
  }

  /**
   * Automatically detect categories for a verb based on its infinitive and conjugations
   */
  public autoDetectCategories(infinitive: string, conjugations: TenseConjugations): string[] {
    const categories: string[] = [];
    const infLower = infinitive.toLowerCase().trim();

    // 1. Reflexive detection (starts with sich or contains sich)
    if (infLower.startsWith("sich ") || infLower.includes(" sich") || infLower === "sich") {
      categories.push("reflexive");
    }

    // 2. Separable detection
    const separablePrefixes = [
      "ab", "an", "auf", "aus", "bei", "ein", "mit", "nach", "vor", "zu", 
      "weg", "los", "her", "hin", "zurück", "zusammen", "entgegen", "gegenüber"
    ];
    const hasPrefix = separablePrefixes.some(pref => infLower.startsWith(pref) && infLower.length > pref.length);
    let isSeparable = false;
    if (hasPrefix) {
      const perfektS1 = conjugations?.PERFEKT?.S1;
      if (perfektS1 && perfektS1.length > 1) {
        const participle = (perfektS1[1] || "").toLowerCase();
        for (const pref of separablePrefixes) {
          if (participle.startsWith(pref + "ge") && participle.length > (pref.length + 2)) {
            isSeparable = true;
            break;
          }
        }
      }
    }
    // Force separable if linguistic rules dictate and not inside non-separable prefixes
    if (isSeparable || (hasPrefix && !infLower.startsWith("be") && !infLower.startsWith("ge") && !infLower.startsWith("er") && !infLower.startsWith("ver") && !infLower.startsWith("zer") && !infLower.startsWith("ent") && !infLower.startsWith("emp") && !infLower.startsWith("miss"))) {
      categories.push("separable");
    }

    // 3. Regular vs Irregular detection
    const prateritumS1 = conjugations?.PRATERITUM?.S1?.[0]?.toLowerCase();
    const perfektS1 = conjugations?.PERFEKT?.S1?.[1]?.toLowerCase() || conjugations?.PERFEKT?.S1?.[0]?.toLowerCase();

    if (prateritumS1 && perfektS1) {
      const endsWithTe = prateritumS1.endsWith("te") || prateritumS1.endsWith("tet") || prateritumS1.endsWith("ten") || prateritumS1.endsWith("tete");
      const endsWithEn = perfektS1.endsWith("en");

      if (!endsWithTe || endsWithEn) {
        categories.push("irregular");
      } else {
        categories.push("regular");
      }
    } else {
      categories.push("regular");
    }

    return categories;
  }

  /**
   * Add or update a category
   */
  public async saveCategory(category: Category): Promise<void> {
    if (this.useInMemoryFallback) {
      const idx = this.inMemoryCategories.findIndex(c => c.id === category.id);
      if (idx >= 0) {
        this.inMemoryCategories[idx] = category;
      } else {
        this.inMemoryCategories.push(category);
      }
      return;
    }
    try {
      await db.categories.put(category);
    } catch (dbErr) {
      console.warn("Database saveCategory failed, saving to memory", dbErr);
      this.useInMemoryFallback = true;
      const idx = this.inMemoryCategories.findIndex(c => c.id === category.id);
      if (idx >= 0) {
        this.inMemoryCategories[idx] = category;
      } else {
        this.inMemoryCategories.push(category);
      }
    }
  }

  /**
   * Delete a category and remove it from any verb overrides
   */
  public async deleteCategory(id: string): Promise<void> {
    if (this.useInMemoryFallback) {
      this.inMemoryCategories = this.inMemoryCategories.filter(c => c.id !== id);
      for (const [key, ov] of Object.entries(this.inMemoryOverrides)) {
        if (ov.categories && ov.categories.includes(id)) {
          ov.categories = ov.categories.filter(c => c !== id);
        }
      }
      return;
    }
    try {
      await db.categories.delete(id);
      // Clean up verbs referencing this category
      const overrides = await db.overrides.toArray();
      for (const ov of overrides) {
        if (ov.categories && ov.categories.includes(id)) {
          const updatedCats = ov.categories.filter(c => c !== id);
          await this.saveOverride(ov.infinitive, { categories: updatedCats });
        }
      }
    } catch (dbErr) {
      console.warn("Database deleteCategory failed, using memory", dbErr);
      this.useInMemoryFallback = true;
      this.inMemoryCategories = this.inMemoryCategories.filter(c => c.id !== id);
      for (const [key, ov] of Object.entries(this.inMemoryOverrides)) {
        if (ov.categories && ov.categories.includes(id)) {
          ov.categories = ov.categories.filter(c => c !== id);
        }
      }
    }
  }

  /**
   * Resets to the original bundled sample database and deletes custom uploaded database files.
   */
  public async resetToDefaultDatabase(): Promise<Record<string, TenseConjugations>> {
    await this.deleteSetting("cached_base_json");
    await this.deleteSetting("verbs_custom_order");
    await this.deleteSetting("cached_base_json_filename");
    await this.deleteSetting("tauri_json_path");

    this.inMemoryOverrides = {};
    this.inMemorySettings = {};
    this.inMemoryCategories = [
      { id: "regular", name: "Regelmäßig", color: "#10B981" },
      { id: "irregular", name: "Unregelmäßig", color: "#EF4444" },
      { id: "separable", name: "Trennbar", color: "#3B82F6" },
      { id: "reflexive", name: "Reflexiv", color: "#8B5CF6" },
      { id: "favorites", name: "Favoriten", color: "#F59E0B" },
    ];

    if (!this.useInMemoryFallback) {
      try {
        await db.overrides.clear();
        await db.categories.clear();
      } catch (dbErr) {
        console.warn("Database clear failed during reset, clearing memory fields", dbErr);
      }
    }

    // Reload database with original sample database
    this.verbsCache = {};
    this.cacheJsonDatabase(sampleDb);
    this.loaded = true;
    return this.verbsCache;
  }

  // ----------------------------------------------------
  // Vocabulary Management System
  // ----------------------------------------------------
  private defaultSampleVocabularies: VocabularyItem[] = [
    {
      id: "vocab_1",
      article: "der",
      word: "Tisch",
      meaning: "میز",
      plural: "die Tische",
      partOfSpeech: "noun",
      example: "Der Tisch steht im Wohnzimmer.",
      createdAt: 1700000000000,
      updatedAt: 1700000000000
    },
    {
      id: "vocab_2",
      article: "die",
      word: "Frau",
      meaning: "زن / خانم",
      plural: "die Frauen",
      partOfSpeech: "noun",
      example: "Die Frau liest ein Buch.",
      createdAt: 1700000001000,
      updatedAt: 1700000001000
    },
    {
      id: "vocab_3",
      article: "das",
      word: "Buch",
      meaning: "کتاب",
      plural: "die Bücher",
      partOfSpeech: "noun",
      example: "Das Buch ist sehr interessant.",
      createdAt: 1700000002000,
      updatedAt: 1700000002000
    },
    {
      id: "vocab_4",
      article: "der",
      word: "Apfel",
      meaning: "سیب",
      plural: "die Äpfel",
      partOfSpeech: "noun",
      example: "Der Apfel schmeckt süß und frisch.",
      createdAt: 1700000003000,
      updatedAt: 1700000003000
    },
    {
      id: "vocab_5",
      article: "die",
      word: "Zeit",
      meaning: "زمان / وقت",
      plural: "die Zeiten",
      partOfSpeech: "noun",
      example: "Hast du heute Abend Zeit?",
      createdAt: 1700000004000,
      updatedAt: 1700000004000
    },
    {
      id: "vocab_6",
      article: "das",
      word: "Haus",
      meaning: "خانه / ساختمان",
      plural: "die Häuser",
      partOfSpeech: "noun",
      example: "Das Haus ist neu gebaut worden.",
      createdAt: 1700000005000,
      updatedAt: 1700000005000
    },
    {
      id: "vocab_7",
      article: "none",
      word: "schnell",
      meaning: "سریع / تند",
      plural: "-",
      partOfSpeech: "adjective",
      example: "Er läuft sehr schnell.",
      createdAt: 1700000006000,
      updatedAt: 1700000006000
    },
    {
      id: "vocab_8",
      article: "none",
      word: "oft",
      meaning: "اغلب / زیاد",
      plural: "-",
      partOfSpeech: "adverb",
      example: "Ich trinke oft morgens Kaffee.",
      createdAt: 1700000007000,
      updatedAt: 1700000007000
    },
    {
      id: "vocab_9",
      article: "none",
      word: "mit",
      meaning: "با / به همراه (+ Dativ)",
      plural: "-",
      partOfSpeech: "preposition",
      example: "Ich fahre mit dem Bus zur Arbeit.",
      createdAt: 1700000008000,
      updatedAt: 1700000008000
    },
    {
      id: "vocab_10",
      article: "none",
      word: "auf jeden Fall",
      meaning: "در هر صورت / حتماً",
      plural: "-",
      partOfSpeech: "expression",
      example: "Das mache ich auf jeden Fall!",
      createdAt: 1700000009000,
      updatedAt: 1700000009000
    }
  ];

  private inMemoryVocabularies: VocabularyItem[] | null = null;

  private deduplicateVocabularies(list: VocabularyItem[]): VocabularyItem[] {
    const seenIds = new Set<string>();
    const seenWords = new Set<string>();
    const result: VocabularyItem[] = [];

    for (const item of list) {
      if (!item || !item.id || !item.word) continue;
      const normKey = `${item.word.toLowerCase().trim()}_${(item.article || "none").toLowerCase()}_${(item.partOfSpeech || "noun").toLowerCase()}`;
      if (!seenIds.has(item.id) && !seenWords.has(normKey)) {
        seenIds.add(item.id);
        seenWords.add(normKey);
        result.push(item);
      }
    }
    return result;
  }

  public async getVocabularies(): Promise<VocabularyItem[]> {
    if (this.useInMemoryFallback) {
      if (!this.inMemoryVocabularies) {
        // Try reading from localStorage
        try {
          const local = localStorage.getItem("g_verb_vocabularies");
          if (local) {
            this.inMemoryVocabularies = JSON.parse(local);
          }
        } catch (e) {}
        if (!this.inMemoryVocabularies || this.inMemoryVocabularies.length === 0) {
          this.inMemoryVocabularies = [...this.defaultSampleVocabularies];
        }
      }
      this.inMemoryVocabularies = this.deduplicateVocabularies(this.inMemoryVocabularies);
      return [...this.inMemoryVocabularies];
    }

    try {
      await db.open();
      const list = await db.vocabularies.toArray();
      if (!list || list.length === 0) {
        // Seed default sample vocabularies
        await db.vocabularies.bulkAdd(this.defaultSampleVocabularies);
        this.inMemoryVocabularies = [...this.defaultSampleVocabularies];
        return [...this.defaultSampleVocabularies];
      }
      const cleanList = this.deduplicateVocabularies(list);
      this.inMemoryVocabularies = cleanList;
      return cleanList;
    } catch (e) {
      console.warn("IndexedDB vocabularies fetch failed, falling back to memory", e);
      this.useInMemoryFallback = true;
      if (!this.inMemoryVocabularies) {
        this.inMemoryVocabularies = [...this.defaultSampleVocabularies];
      }
      this.inMemoryVocabularies = this.deduplicateVocabularies(this.inMemoryVocabularies);
      return [...this.inMemoryVocabularies];
    }
  }

  public async saveVocabularyDirect(item: VocabularyItem): Promise<void> {
    const now = Date.now();
    const preparedItem: VocabularyItem = {
      ...item,
      updatedAt: now,
      createdAt: item.createdAt || now
    };

    if (this.useInMemoryFallback) {
      if (!this.inMemoryVocabularies) this.inMemoryVocabularies = [];
      const idx = this.inMemoryVocabularies.findIndex(v => v.id === preparedItem.id);
      if (idx >= 0) {
        this.inMemoryVocabularies[idx] = preparedItem;
      } else {
        this.inMemoryVocabularies.unshift(preparedItem);
      }
      try {
        localStorage.setItem("g_verb_vocabularies", JSON.stringify(this.inMemoryVocabularies));
      } catch (e) {}
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-data-changed"));
      }
      return;
    }

    try {
      await db.open();
      await db.vocabularies.put(preparedItem);
      if (this.inMemoryVocabularies) {
        const idx = this.inMemoryVocabularies.findIndex(v => v.id === preparedItem.id);
        if (idx >= 0) {
          this.inMemoryVocabularies[idx] = preparedItem;
        } else {
          this.inMemoryVocabularies.unshift(preparedItem);
        }
        try {
          localStorage.setItem("g_verb_vocabularies", JSON.stringify(this.inMemoryVocabularies));
        } catch (e) {}
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-data-changed"));
      }
    } catch (e) {
      console.warn("Failed saving vocabulary to DB, using memory fallback", e);
      this.useInMemoryFallback = true;
      await this.saveVocabularyDirect(preparedItem);
    }
  }

  public async saveVocabulary(item: VocabularyItem): Promise<void> {
    // Check if previous item exists to determine if add vs edit and capture state for undo
    const existingList = await this.getVocabularies();
    const prevItem = existingList.find(v => v.id === item.id) || null;
    const isNew = !prevItem;

    await this.saveVocabularyDirect(item);

    // Log change
    await this.logVocabChange(
      item.word,
      isNew ? "vocab_add" : "vocab_edit",
      prevItem
    );
  }

  public async deleteVocabularyDirect(id: string): Promise<void> {
    if (this.useInMemoryFallback) {
      if (this.inMemoryVocabularies) {
        this.inMemoryVocabularies = this.inMemoryVocabularies.filter(v => v.id !== id);
        try {
          localStorage.setItem("g_verb_vocabularies", JSON.stringify(this.inMemoryVocabularies));
        } catch (e) {}
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-data-changed"));
      }
      return;
    }

    try {
      await db.open();
      await db.vocabularies.delete(id);
      if (this.inMemoryVocabularies) {
        this.inMemoryVocabularies = this.inMemoryVocabularies.filter(v => v.id !== id);
        try {
          localStorage.setItem("g_verb_vocabularies", JSON.stringify(this.inMemoryVocabularies));
        } catch (e) {}
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-data-changed"));
      }
    } catch (e) {
      console.warn("Failed deleting vocabulary from DB", e);
      this.useInMemoryFallback = true;
      await this.deleteVocabularyDirect(id);
    }
  }

  public async deleteVocabulary(id: string): Promise<void> {
    const existingList = await this.getVocabularies();
    const prevItem = existingList.find(v => v.id === id) || null;
    const wordToDelete = prevItem ? prevItem.word : id;

    await this.deleteVocabularyDirect(id);

    // Always log deletion so history tab can undo it!
    await this.logVocabChange(
      wordToDelete,
      "vocab_delete",
      prevItem || {
        id,
        article: "none",
        word: wordToDelete,
        meaning: "",
        partOfSpeech: "noun",
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    );
  }

  public async getCustomVocabOrder(): Promise<string[]> {
    return (await this.getSetting<string[]>("vocabularies_custom_order")) || [];
  }

  public async saveCustomVocabOrder(order: string[]): Promise<void> {
    await this.saveSetting("vocabularies_custom_order", order);
  }

  public async resetVocabulariesToDefault(): Promise<VocabularyItem[]> {
    this.inMemoryVocabularies = [...this.defaultSampleVocabularies];
    try {
      localStorage.removeItem("g_verb_vocabularies");
    } catch (e) {}

    if (!this.useInMemoryFallback) {
      try {
        await db.vocabularies.clear();
        await db.vocabularies.bulkAdd(this.defaultSampleVocabularies);
      } catch (e) {
        console.warn("Error resetting vocabularies in DB", e);
      }
    }
    return [...this.defaultSampleVocabularies];
  }

  // ----------------------------------------------------
  // Vocabulary Categories / Tags System
  // ----------------------------------------------------
  private defaultVocabCategories: VocabularyCategory[] = [
    { id: "vcat_a1", name: "سطح A1", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { id: "vcat_a2", name: "سطح A2", color: "bg-blue-100 text-blue-800 border-blue-300" },
    { id: "vcat_b1", name: "سطح B1", color: "bg-amber-100 text-amber-800 border-amber-300" },
    { id: "vcat_b2", name: "سطح B2", color: "bg-purple-100 text-purple-800 border-purple-300" },
    { id: "vcat_travel", name: "سفر و گردشگری", color: "bg-teal-100 text-teal-800 border-teal-300" },
    { id: "vcat_food", name: "غذا و نوشیدنی", color: "bg-rose-100 text-rose-800 border-rose-300" },
    { id: "vcat_work", name: "کار و شغل", color: "bg-indigo-100 text-indigo-800 border-indigo-300" },
    { id: "vcat_daily", name: "زندگی روزمره", color: "bg-slate-100 text-slate-800 border-slate-300" }
  ];

  public async getVocabCategories(): Promise<VocabularyCategory[]> {
    if (this.useInMemoryFallback) {
      try {
        const local = localStorage.getItem("g_verb_vocab_categories");
        if (local) return JSON.parse(local);
      } catch (e) {}
      return [...this.defaultVocabCategories];
    }

    try {
      await db.open();
      const list = await db.vocabCategories.toArray();
      if (!list || list.length === 0) {
        await db.vocabCategories.bulkAdd(this.defaultVocabCategories);
        return [...this.defaultVocabCategories];
      }
      return list;
    } catch (e) {
      console.warn("Error getting vocab categories from DB", e);
      return [...this.defaultVocabCategories];
    }
  }

  public async saveVocabCategory(cat: VocabularyCategory): Promise<void> {
    if (this.useInMemoryFallback) {
      const current = await this.getVocabCategories();
      const idx = current.findIndex(c => c.id === cat.id);
      if (idx >= 0) current[idx] = cat;
      else current.push(cat);
      try {
        localStorage.setItem("g_verb_vocab_categories", JSON.stringify(current));
      } catch (e) {}
      return;
    }

    try {
      await db.vocabCategories.put(cat);
    } catch (e) {
      console.warn("Error saving vocab category to DB", e);
    }
  }

  public async deleteVocabCategory(id: string): Promise<void> {
    if (this.useInMemoryFallback) {
      const current = await this.getVocabCategories();
      const filtered = current.filter(c => c.id !== id);
      try {
        localStorage.setItem("g_verb_vocab_categories", JSON.stringify(filtered));
      } catch (e) {}
      return;
    }

    try {
      await db.vocabCategories.delete(id);
    } catch (e) {
      console.warn("Error deleting vocab category from DB", e);
    }
  }

  // ----------------------------------------------------
  // Synonym & Antonym Group System
  // ----------------------------------------------------
  private defaultSynonymAntonymGroups: SynonymAntonymGroup[] = [
    {
      id: "syn_group_1",
      title: "مترادف‌های سرعت و شتاب (Schnelligkeit)",
      type: "synonym",
      items: [
        { word: "schnell", meaning: "سریع / تند" },
        { word: "rasch", meaning: "سریع / شتابان" },
        { word: "flink", meaning: "چابک / فرز" },
        { word: "zügig", meaning: "روان و بدون معطلی" }
      ],
      notes: "واژگان مربوط به سرعت حرکتی و انجام کارها",
      createdAt: 1700000000000,
      updatedAt: 1700000000000
    },
    {
      id: "ant_group_1",
      title: "متضادهای دما و وضعیت هوا (Temperatur)",
      type: "antonym",
      items: [
        { word: "heiß", meaning: "داغ / بسیار گرم" },
        { word: "kalt", meaning: "سرد / خنک" },
        { word: "warm", meaning: "گرم و مطبوع" },
        { word: "kühl", meaning: "خنک" }
      ],
      notes: "جفت‌های متضاد توصیف دما",
      createdAt: 1700000001000,
      updatedAt: 1700000001000
    },
    {
      id: "syn_group_2",
      title: "مترادف‌های زیبایی (Schönheit)",
      type: "synonym",
      items: [
        { word: "schön", meaning: "زیبا / قشنگ" },
        { word: "hübsch", meaning: "جذاب / خوش‌تیپ" },
        { word: "attraktiv", meaning: "گیرایی / پرجاذبه" },
        { word: "wunderschön", meaning: "فوق‌العاده زیبا" }
      ],
      notes: "کلمات توصیف زیبایی ظاهری",
      createdAt: 1700000002000,
      updatedAt: 1700000002000
    },
    {
      id: "ant_group_2",
      title: "متضادهای سختی و آسانی (Schwierigkeit)",
      type: "antonym",
      items: [
        { word: "einfach / leicht", meaning: "ساده / آسان" },
        { word: "schwierig / schwer", meaning: "سخت / دشوار" }
      ],
      notes: "متضادهای درجه سختی تمرین‌ها و امتحانات",
      createdAt: 1700000003000,
      updatedAt: 1700000003000
    }
  ];

  public async getSynonymAntonymGroups(): Promise<SynonymAntonymGroup[]> {
    if (this.useInMemoryFallback) {
      try {
        const local = localStorage.getItem("g_verb_syn_ant_groups");
        if (local) return JSON.parse(local);
      } catch (e) {}
      return [...this.defaultSynonymAntonymGroups];
    }

    try {
      await db.open();
      const list = await db.synonymAntonymGroups.toArray();
      if (!list || list.length === 0) {
        await db.synonymAntonymGroups.bulkAdd(this.defaultSynonymAntonymGroups);
        return [...this.defaultSynonymAntonymGroups];
      }
      return list;
    } catch (e) {
      console.warn("Error fetching synonym/antonym groups from DB", e);
      return [...this.defaultSynonymAntonymGroups];
    }
  }

  public async saveSynonymAntonymGroup(group: SynonymAntonymGroup): Promise<void> {
    if (this.useInMemoryFallback) {
      const current = await this.getSynonymAntonymGroups();
      const idx = current.findIndex(g => g.id === group.id);
      if (idx >= 0) current[idx] = group;
      else current.unshift(group);
      try {
        localStorage.setItem("g_verb_syn_ant_groups", JSON.stringify(current));
      } catch (e) {}
      return;
    }

    try {
      await db.synonymAntonymGroups.put(group);
    } catch (e) {
      console.warn("Error saving synonym/antonym group to DB", e);
    }
  }

  public async deleteSynonymAntonymGroup(id: string): Promise<void> {
    try {
      const local = localStorage.getItem("g_verb_syn_ant_groups");
      if (local) {
        const parsed = JSON.parse(local);
        const filtered = parsed.filter((g: any) => g.id !== id);
        localStorage.setItem("g_verb_syn_ant_groups", JSON.stringify(filtered));
      }
    } catch (e) {}

    try {
      await db.open();
      await db.synonymAntonymGroups.delete(id);
    } catch (e) {
      console.warn("Error deleting synonym/antonym group from DB", e);
    }
  }

  // ----------------------------------------------------
  // Story Exercises & Saved Stories Persistence
  // ----------------------------------------------------
  public async getSavedStories(): Promise<SavedStory[]> {
    try {
      await db.open();
      const stories = await db.savedStories.orderBy("createdAt").reverse().toArray();
      if (stories && stories.length > 0) {
        this.inMemorySavedStories = stories;
        return stories;
      }
    } catch (e) {
      console.warn("Could not read savedStories from IndexedDB, using fallback", e);
    }
    const raw = localStorage.getItem("g_saved_stories");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.inMemorySavedStories = parsed;
        return parsed;
      } catch (err) {}
    }
    return this.inMemorySavedStories;
  }

  public async saveStory(story: SavedStory): Promise<void> {
    try {
      await db.open();
      await db.savedStories.put(story);
    } catch (e) {
      console.warn("Failed to put saved story in IndexedDB, using fallback", e);
    }
    const existing = this.inMemorySavedStories.filter((s) => s.id !== story.id);
    this.inMemorySavedStories = [story, ...existing];
    try {
      localStorage.setItem("g_saved_stories", JSON.stringify(this.inMemorySavedStories));
    } catch (e) {}

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("saved-stories-changed"));
    }
  }

  public async deleteStory(id: string): Promise<void> {
    try {
      await db.open();
      await db.savedStories.delete(id);
    } catch (e) {
      console.warn("Failed to delete story in IndexedDB, using fallback", e);
    }
    this.inMemorySavedStories = this.inMemorySavedStories.filter((s) => s.id !== id);
    try {
      localStorage.setItem("g_saved_stories", JSON.stringify(this.inMemorySavedStories));
    } catch (e) {}

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("saved-stories-changed"));
    }
  }

  public async deleteStories(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    try {
      await db.open();
      await db.savedStories.bulkDelete(ids);
    } catch (e) {
      console.warn("Failed to bulk delete stories in IndexedDB, using fallback", e);
    }
    this.inMemorySavedStories = this.inMemorySavedStories.filter((s) => !idSet.has(s.id));
    try {
      localStorage.setItem("g_saved_stories", JSON.stringify(this.inMemorySavedStories));
    } catch (e) {}

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("saved-stories-changed"));
    }
  }

  // ----------------------------------------------------
  // Full Application Data Export & Import (Backup & Sync)
  // ----------------------------------------------------
  public async exportFullBackupJSON(): Promise<string> {
    let overrides: UserOverride[] = [];
    let categories: Category[] = [];
    let vocabularies: VocabularyItem[] = [];
    let vocabCategories: VocabularyCategory[] = [];
    let synonymAntonymGroups: SynonymAntonymGroup[] = [];
    let savedStories: SavedStory[] = [];
    let settings: Array<{ key: string; value: any }> = [];

    try {
      await db.open();
      overrides = await db.overrides.toArray();
      categories = await db.categories.toArray();
      vocabularies = await db.vocabularies.toArray();
      vocabCategories = await db.vocabCategories.toArray();
      synonymAntonymGroups = await db.synonymAntonymGroups.toArray();
      savedStories = await db.savedStories.toArray();
      settings = await db.settings.toArray();
    } catch (e) {
      console.warn("Error reading IndexedDB for full export, using memory/fallback", e);
      overrides = Object.values(this.inMemoryOverrides);
      categories = this.inMemoryCategories;
      vocabularies = await this.getVocabularies();
      vocabCategories = await this.getVocabCategories();
      synonymAntonymGroups = await this.getSynonymAntonymGroups();
      savedStories = await this.getSavedStories();
    }

    // Ensure fallback data is pulled if IndexedDB was empty for vocab / groups / stories
    if (vocabularies.length === 0) {
      vocabularies = await this.getVocabularies();
    }
    if (vocabCategories.length === 0) {
      vocabCategories = await this.getVocabCategories();
    }
    if (synonymAntonymGroups.length === 0) {
      synonymAntonymGroups = await this.getSynonymAntonymGroups();
    }
    if (savedStories.length === 0) {
      savedStories = await this.getSavedStories();
    }

    let allVerbs: VerbItem[] = [];
    try {
      allVerbs = await this.getAllVerbs();
    } catch (e) {
      console.warn("Failed to get all verbs for backup:", e);
    }

    let appHistory: any[] = [];
    let vocabHistory: any[] = [];
    try {
      const ah = localStorage.getItem("g_verb_app_history");
      if (ah) appHistory = JSON.parse(ah);
      const vh = localStorage.getItem("g_verb_vocab_history");
      if (vh) vocabHistory = JSON.parse(vh);
    } catch (e) {}

    const backupPayload = {
      metadata: {
        appName: "GermanLanguageManager",
        version: "2.0",
        exportDate: new Date().toISOString(),
        timestamp: Date.now(),
        schemaVersion: 2,
        description: "Complete database backup including verbs with all conjugations, vocabulary bank with articles and examples, categories, tags, lexical network groups (Synonyms, Antonyms, Word Families, Semantic Fields, Idioms), and user preferences.",
        totalVerbs: allVerbs.length,
        totalVocabularies: vocabularies.length,
        totalVerbCategories: categories.length,
        totalVocabCategories: vocabCategories.length,
        totalLexicalNetworkGroups: synonymAntonymGroups.length,
        totalSavedStories: savedStories.length
      },
      data: {
        verbs: allVerbs,
        verbsCache: this.verbsCache,
        verbCategories: categories,
        overrides,
        vocabularies,
        vocabCategories,
        lexicalNetworkGroups: synonymAntonymGroups,
        synonymAntonymGroups,
        savedStories,
        customVerbOrder: await this.getCustomOrder(),
        customVocabOrder: await this.getCustomVocabOrder(),
        settings,
        appHistory,
        vocabHistory
      }
    };

    return JSON.stringify(backupPayload, null, 2);
  }

  public async importFullBackupJSON(jsonString: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(jsonString);

      // Support direct raw array of vocabulary items or verb items
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && parsed[0].word !== undefined) {
          await db.open();
          await db.vocabularies.clear();
          await db.vocabularies.bulkPut(parsed);
          this.inMemoryVocabularies = parsed;
          localStorage.setItem("g_verb_vocabularies", JSON.stringify(parsed));
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("vocab-data-changed"));
          }
          return true;
        }
      }

      const data = parsed.data || parsed; // Support both wrapped and direct json

      if (!data) throw new Error("Invalid backup JSON structure.");

      await db.open();

      // 1. Verbs Cache / Raw Conjugations
      if (data.verbsCache && typeof data.verbsCache === "object" && Object.keys(data.verbsCache).length > 0) {
        this.cacheJsonDatabase(data.verbsCache);
        await this.saveSetting("cached_base_json", JSON.stringify(data.verbsCache));
      } else if (Array.isArray(data.verbs) && data.verbs.length > 0) {
        const constructedCache: Record<string, TenseConjugations> = {};
        for (const verb of data.verbs) {
          if (verb.infinitive) {
            constructedCache[verb.infinitive.toLowerCase().trim()] = verb.conjugations || {};
          }
        }
        if (Object.keys(constructedCache).length > 0) {
          this.cacheJsonDatabase(constructedCache);
          await this.saveSetting("cached_base_json", JSON.stringify(constructedCache));
        }
      }

      // 2. Overrides
      if (Array.isArray(data.overrides)) {
        await db.overrides.clear();
        if (data.overrides.length > 0) {
          await db.overrides.bulkPut(data.overrides);
        }
        this.inMemoryOverrides = {};
        data.overrides.forEach((o: UserOverride) => {
          if (o.infinitive) this.inMemoryOverrides[o.infinitive.toLowerCase()] = o;
        });
      }

      // 3. Verb Categories
      const catList = data.verbCategories || data.categories;
      if (Array.isArray(catList) && catList.length > 0) {
        await db.categories.clear();
        await db.categories.bulkPut(catList);
        this.inMemoryCategories = catList;
      }

      // 4. Vocabularies
      if (Array.isArray(data.vocabularies)) {
        await db.vocabularies.clear();
        if (data.vocabularies.length > 0) {
          await db.vocabularies.bulkPut(data.vocabularies);
        }
        this.inMemoryVocabularies = data.vocabularies;
        localStorage.setItem("g_verb_vocabularies", JSON.stringify(data.vocabularies));
      }

      // 5. Vocab Categories
      if (Array.isArray(data.vocabCategories)) {
        await db.vocabCategories.clear();
        if (data.vocabCategories.length > 0) {
          await db.vocabCategories.bulkPut(data.vocabCategories);
        }
        localStorage.setItem("g_verb_vocab_categories", JSON.stringify(data.vocabCategories));
      }

      // 6. Lexical Networks Groups (Synonyms, Antonyms, Word Families, Semantic Fields, Idioms)
      const lexGroups = data.lexicalNetworkGroups || data.synonymAntonymGroups;
      if (Array.isArray(lexGroups)) {
        await db.synonymAntonymGroups.clear();
        if (lexGroups.length > 0) {
          await db.synonymAntonymGroups.bulkPut(lexGroups);
        }
        localStorage.setItem("g_verb_syn_ant_groups", JSON.stringify(lexGroups));
      }

      // 7. Settings
      if (Array.isArray(data.settings)) {
        await db.settings.clear();
        if (data.settings.length > 0) {
          await db.settings.bulkPut(data.settings);
        }
      }

      // 8. Custom verb order
      if (Array.isArray(data.customVerbOrder)) {
        await this.saveCustomOrder(data.customVerbOrder);
      }

      // 9. Custom vocab order
      if (Array.isArray(data.customVocabOrder)) {
        await this.saveCustomVocabOrder(data.customVocabOrder);
      }

      // 10. History logs
      if (Array.isArray(data.appHistory)) {
        localStorage.setItem("g_verb_app_history", JSON.stringify(data.appHistory));
      }
      if (Array.isArray(data.vocabHistory)) {
        localStorage.setItem("g_verb_vocab_history", JSON.stringify(data.vocabHistory));
      }

      // 11. Saved Stories
      if (Array.isArray(data.savedStories)) {
        await db.savedStories.clear();
        if (data.savedStories.length > 0) {
          await db.savedStories.bulkPut(data.savedStories);
        }
        this.inMemorySavedStories = data.savedStories;
        localStorage.setItem("g_saved_stories", JSON.stringify(data.savedStories));
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-data-changed"));
        window.dispatchEvent(new CustomEvent("app-data-changed"));
        window.dispatchEvent(new CustomEvent("vocab-categories-changed"));
        window.dispatchEvent(new CustomEvent("synonym-antonym-changed"));
        window.dispatchEvent(new CustomEvent("saved-stories-changed"));
      }

      return true;
    } catch (e) {
      console.error("Failed to import backup JSON:", e);
      throw e;
    }
  }
}


export const dbService = DatabaseService.getInstance();
