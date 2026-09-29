import Dexie, { type Table } from "dexie";
import { Tense, type UserOverride, type Category, type TenseConjugations, type VerbItem, type ConjugationPerson, type AppChangeLog, type VocabChangeLog, type VocabularyItem, type ArticleType, type PartOfSpeech, type VocabularyCategory, type SynonymAntonymGroup, type SavedStory, normalizePluralField, type ConjugationPracticeStat, type PracticeTense, type PracticeSession } from "./types";
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
  conjugationPracticeStats!: Table<ConjugationPracticeStat, string>;
  practiceSessions!: Table<PracticeSession, string>;

  constructor() {
    super("GermanVerbManagerDB");
    this.version(1).stores({
      overrides: "infinitive, sortOrder",
      categories: "id, name",
      settings: "key",
    });
    this.version(2).stores({
      vocabularies: "id, word, article, partOfSpeech"
    });
    this.version(3).stores({
      vocabCategories: "id, name",
      synonymAntonymGroups: "id, title, type"
    });
    this.version(4).stores({
      savedStories: "id, title, createdAt, cefrLevel"
    });
    this.version(5).stores({
      overrides: "infinitive, sortOrder",
      categories: "id, name",
      settings: "key",
      vocabularies: "id, word, article, partOfSpeech",
      vocabCategories: "id, name",
      synonymAntonymGroups: "id, title, type",
      savedStories: "id, title, createdAt, cefrLevel",
      conjugationPracticeStats: "id, infinitive, tense, person, wrongCount",
      practiceSessions: "id, startedAt, completedAt, isFavorite",
    });
  }
}

export const db = new VerbConjugationDatabase();

// ----------------------------------------------------
// Identity & Parsing Canonical Helpers
// ----------------------------------------------------
export function canonicalVerbKey(infinitive: string): string {
  return (infinitive || "").trim().toLowerCase();
}

const VALID_PERSONS: Array<keyof ConjugationPerson> = ["S1", "S2", "S3", "P1", "P2", "P3"];

export function parseCellOverrideKey(cellKey: string): { tense: string; person: keyof ConjugationPerson } | null {
  if (!cellKey) return null;
  const lastUnderscore = cellKey.lastIndexOf("_");
  if (lastUnderscore <= 0 || lastUnderscore >= cellKey.length - 1) return null;

  const tense = cellKey.substring(0, lastUnderscore);
  const personStr = cellKey.substring(lastUnderscore + 1);

  if (!VALID_PERSONS.includes(personStr as keyof ConjugationPerson)) {
    return null;
  }

  return {
    tense,
    person: personStr as keyof ConjugationPerson
  };
}

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
  private inMemoryConjugationStats: ConjugationPracticeStat[] = [];
  private inMemoryPracticeSessions: PracticeSession[] = [];
  // In-memory seed-guard flags to prevent double-seeding race conditions
  private categoriesSeeded: boolean = false;
  private vocabulariesSeeded: boolean = false;
  private vocabCategoriesSeeded: boolean = false;
  private synonymAntonymGroupsSeeded: boolean = false;
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
   * Ensures the IndexedDB connection is open.
   * If an upgrade or schema error occurs (e.g. broken primary key in user's existing DB),
   * defensively resets (deletes and re-opens) the database so the application recovers gracefully.
   */
  public async ensureDbOpen(): Promise<boolean> {
    if (this.useInMemoryFallback) return false;
    try {
      await db.open();
      return true;
    } catch (e) {
      console.warn("[DB] Upgrade failed - resetting local database", e);
      try {
        await db.delete();
      } catch (e2) {
        console.warn("[DB] Failed to delete corrupted database", e2);
      }
      try {
        await db.open();
        this.useInMemoryFallback = false;
        return true;
      } catch (e3) {
        console.warn("[DB] Re-open failed after reset, activating in-memory fallback", e3);
        this.useInMemoryFallback = true;
        return false;
      }
    }
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

    // 2. Check IndexedDB as authoritative persistent layer if not in fallback mode
    if (!this.useInMemoryFallback) {
      try {
        const isOpen = await this.ensureDbOpen();
        if (isOpen) {
          const setting = await db.settings.get(key);
          if (setting !== undefined && setting !== null) {
            this.inMemorySettings[key] = setting.value;
            // Synchronize localStorage secondary cache
            try {
              if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem(`g_verb_setting_${key}`, JSON.stringify(setting.value));
              }
            } catch (e) {}
            return setting.value as T;
          } else {
            // Explicitly absent in IndexedDB: clean any stale secondary cache to prevent resurrecting deleted keys
            this.inMemorySettings[key] = null;
            try {
              if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.removeItem(`g_verb_setting_${key}`);
              }
            } catch (e) {}
            return null;
          }
        }
      } catch (e) {
        console.warn(`IndexedDB read failed for key ${key}, falling back to secondary cache`, e);
        this.useInMemoryFallback = true;
      }
    }

    // 3. Fallback: check localStorage when in fallback mode or after IndexedDB failure
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
        const isOpen = await this.ensureDbOpen();
        if (isOpen) {
          await db.settings.put({ key, value });
        }
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
        const isOpen = await this.ensureDbOpen();
        if (isOpen) {
          await db.settings.delete(key);
        }
      } catch (e) {
        console.warn(`IndexedDB delete failed for key ${key}`, e);
      }
    }
  }

  /**
   * Loads the base database into cache.
   */
  public async loadDatabase(customJsonContent?: string): Promise<Record<string, TenseConjugations>> {
    // Attempt to open/verify IndexedDB connection with defensive recovery
    if (!this.useInMemoryFallback) {
      try {
        await db.open();
      } catch (e) {
        console.warn("[DB] Upgrade failed - resetting local database", e);
        try { await db.delete(); } catch (e2) {}
        try {
          await db.open();
        } catch (e3) {
          this.useInMemoryFallback = true;
        }
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
      infinitivesSet.add(canonicalVerbKey(inf));
    }
    
    // 1. Get all overrides in one single fast transaction and add their infinitives
    const overridesMap = new Map<string, UserOverride>();
    if (this.useInMemoryFallback) {
      for (const [k, v] of Object.entries(this.inMemoryOverrides)) {
        const key = canonicalVerbKey(v.infinitive || k);
        overridesMap.set(key, v);
        infinitivesSet.add(key);
      }
    } else {
      try {
        const list = await db.overrides.toArray();
        for (const item of list) {
          const key = canonicalVerbKey(item.infinitive);
          overridesMap.set(key, item);
          infinitivesSet.add(key);
        }
      } catch (dbErr) {
        console.warn("Failed to bulk get overrides from IndexedDB, using fallback.", dbErr);
        this.useInMemoryFallback = true;
        for (const [k, v] of Object.entries(this.inMemoryOverrides)) {
          const key = canonicalVerbKey(v.infinitive || k);
          overridesMap.set(key, v);
          infinitivesSet.add(key);
        }
      }
    }

    const infinitives = Array.from(infinitivesSet);
    const verbs: VerbItem[] = [];
    const tenses = Object.values(Tense);

    for (const inf of infinitives) {
      const key = canonicalVerbKey(inf);
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
            const parsed = parseCellOverrideKey(cellKey);
            if (parsed) {
              const { tense, person } = parsed;
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
        categories = this.autoDetectCategories(key, mergedConjugations);
      }

      verbs.push({
        infinitive: key,
        hilfsverb,
        bedeutung,
        categories,
        conjugations: mergedConjugations,
        sortOrder,
        cellOverrides: override?.cellOverrides
      });
    }

    return verbs;
  }

  /**
   * Fetches a single verb, merging the base cache with IndexedDB manual overrides
   */
  public async getVerb(infinitive: string): Promise<VerbItem | null> {
    const key = canonicalVerbKey(infinitive);
    if (!key) return null;
    const baseConjugations = this.verbsCache[key];

    // Get user-specific override from IndexedDB with safe fallback
    let override: UserOverride | undefined = undefined;
    if (this.useInMemoryFallback) {
      override = this.inMemoryOverrides[key];
    } else {
      try {
        await db.open();
        override = await db.overrides.get(key);
        // If not found directly, check for legacy non-canonical record
        if (!override) {
          const list = await db.overrides.toArray();
          const legacy = list.find(o => canonicalVerbKey(o.infinitive) === key);
          if (legacy) {
            override = { ...legacy, infinitive: key };
            try {
              if (legacy.infinitive !== key) {
                await db.overrides.delete(legacy.infinitive);
              }
              await db.overrides.put(override);
            } catch (e) {}
          }
        }
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
          const parsed = parseCellOverrideKey(cellKey);
          if (parsed) {
            const { tense, person } = parsed;
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
      categories = this.autoDetectCategories(key, mergedConjugations);
    }

    return {
      infinitive: key,
      hilfsverb,
      bedeutung,
      categories,
      conjugations: mergedConjugations,
      sortOrder,
      cellOverrides: override?.cellOverrides
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
    const rawInf = (verbData.infinitive || "").trim();
    if (!rawInf) return;
    const key = canonicalVerbKey(rawInf);

    // 1. Save override with isDeleted: false and canonical infinitive
    await this.saveOverride(key, {
      infinitive: key,
      bedeutung: verbData.bedeutung || "",
      hilfsverb: verbData.hilfsverb || "haben",
      categories: verbData.categories && verbData.categories.length > 0 ? verbData.categories : ["regular"],
      cellOverrides: verbData.cellOverrides || {},
      isDeleted: false
    });

    // 2. Prepend this verb to customOrder so it appears at the very top of Page 1!
    const currentOrder = await this.getCustomOrder();
    const updatedOrder = [key, ...currentOrder.filter(k => canonicalVerbKey(k) !== key)];
    await this.saveCustomOrder(updatedOrder);
  }

  public async transferVocabVerbToVerbTable(item: VocabularyItem): Promise<boolean> {
    const inf = (item.word || "").toLowerCase().trim();
    if (!inf) return false;
    // duplicate check against existing verbs:
    const all = await this.getAllVerbs();
    if (all.some(v => (v.infinitive || "").toLowerCase().trim() === inf)) return false;
    await this.addVerb({
      infinitive: item.word.trim(),
      bedeutung: item.meaning || "",
      hilfsverb: "haben",
      categories: ["regular"],
      cellOverrides: {}
    });
    return true;
  }

  /**
   * Save a cell override or field override to IndexedDB or fallback
   */
  public async saveOverride(infinitive: string, fields: Partial<UserOverride>): Promise<void> {
    const key = canonicalVerbKey(infinitive);
    let existing: UserOverride | undefined = undefined;

    if (this.useInMemoryFallback) {
      existing = this.inMemoryOverrides[key];
    } else {
      try {
        await db.open();
        existing = await db.overrides.get(key);
        if (!existing) {
          const all = await db.overrides.toArray();
          const legacy = all.find(o => canonicalVerbKey(o.infinitive) === key);
          if (legacy) {
            existing = legacy;
            if (legacy.infinitive !== key) {
              try {
                await db.overrides.delete(legacy.infinitive);
              } catch (e) {}
            }
          }
        }
      } catch (dbErr) {
        console.warn("Database get failed, switching to fallback", dbErr);
        this.useInMemoryFallback = true;
        existing = this.inMemoryOverrides[key];
      }
    }

    const previousOverride = existing ? JSON.parse(JSON.stringify(existing)) : null;
    const baseExisting = existing || { infinitive: key, cellOverrides: {} };

    const updated: UserOverride = {
      ...baseExisting,
      ...fields,
      infinitive: key, // Enforce canonical identity as primary key
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
      updated.isDeleted !== undefined
    );

    if (this.useInMemoryFallback) {
      if (existing && existing.infinitive && existing.infinitive !== key) {
        delete this.inMemoryOverrides[existing.infinitive];
      }
      if (!hasCellOverrides && !hasOtherOverrides) {
        delete this.inMemoryOverrides[key];
      } else {
        this.inMemoryOverrides[key] = updated;
      }
    } else {
      try {
        if (existing && existing.infinitive && existing.infinitive !== key) {
          await db.overrides.delete(existing.infinitive);
        }
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
    } else if (fields.infinitive !== undefined) {
      descEn = `Renamed verb "${capitalizedVerb}" to "${fields.infinitive}"`;
      descFa = `نام فعل "${capitalizedVerb}" به "${fields.infinitive}" تغییر یافت`;
      descDe = `Verb "${capitalizedVerb}" in "${fields.infinitive}" umbenannt`;
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
      previousOverride,
      fields
    };

    const currentLogs = await this.getChangeLogs();
    const updatedLogs = [newLog, ...currentLogs].slice(0, 15);
    await this.saveSetting("change_history_log", updatedLogs);
  }

  public async undoChange(logId: string): Promise<void> {
    const logs = await this.getChangeLogs();
    const targetLog = logs.find(l => l.id === logId);
    if (!targetLog) return;

    const key = canonicalVerbKey(targetLog.verb);

    if (targetLog.fields && targetLog.fields.infinitive) {
      const newKey = canonicalVerbKey(targetLog.fields.infinitive);
      if (newKey !== key) {
        // 1. Remove or revert the renamed target
        const prevDest = (targetLog.fields as any).previousDestOverride;
        if (prevDest) {
          if (!this.useInMemoryFallback) {
            try {
              await db.open();
              await db.overrides.put(prevDest);
            } catch (e) {
              this.inMemoryOverrides[newKey] = prevDest;
            }
          } else {
            this.inMemoryOverrides[newKey] = prevDest;
          }
        } else {
          if (!this.useInMemoryFallback) {
            try {
              await db.open();
              await db.overrides.delete(newKey);
            } catch (e) {
              delete this.inMemoryOverrides[newKey];
            }
          } else {
            delete this.inMemoryOverrides[newKey];
          }
        }

        // 2. Restore customOrder
        const customOrder = await this.getCustomOrder();
        const updatedOrder = customOrder.map(k => (canonicalVerbKey(k) === newKey ? key : k));
        await this.saveCustomOrder(updatedOrder);
      }
    }

    // Restore old key override
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
      const restoredOverride = {
        ...targetLog.previousOverride,
        infinitive: key
      };
      if (!this.useInMemoryFallback) {
        try {
          await db.open();
          await db.overrides.put(restoredOverride);
        } catch (e) {
          this.inMemoryOverrides[key] = restoredOverride;
        }
      } else {
        this.inMemoryOverrides[key] = restoredOverride;
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
    previousItem: VocabularyItem | null,
    itemId?: string
  ): Promise<void> {
    let descEn = "";
    let descFa = "";
    let descDe = "";

    const displayWord = (word || "").trim();

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

    const resolvedItemId = itemId || previousItem?.id;

    const newLog: VocabChangeLog = {
      id: "vlog_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now(),
      itemId: resolvedItemId,
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
      if (targetLog.itemId) {
        await this.deleteVocabularyDirect(targetLog.itemId);
      } else {
        // Fallback for legacy logs without itemId: check for unique match
        const allVocabs = await this.getVocabularies();
        const matches = allVocabs.filter(v => (v.word || "").toLowerCase().trim() === (targetLog.word || "").toLowerCase().trim());
        if (matches.length === 1) {
          await this.deleteVocabularyDirect(matches[0].id);
        } else if (matches.length > 1) {
          console.warn(`Ambiguous vocabulary undo target for word "${targetLog.word}": multiple records share this spelling. Aborting deletion to avoid deleting wrong record.`);
        }
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
    const oldKey = canonicalVerbKey(oldInfinitive);
    const newKey = canonicalVerbKey(newInfinitive);
    if (!newKey || oldKey === newKey) return;

    // 1. Conflict detection: check if target verb already exists
    const existingTarget = await this.getVerb(newKey);
    if (existingTarget) {
      throw new Error(`Cannot rename "${oldInfinitive}" to "${newInfinitive}": a verb with that name already exists.`);
    }

    // 2. Fetch full current source verb (including base conjugations and any existing overrides)
    const sourceVerb = await this.getVerb(oldKey);
    if (!sourceVerb) {
      throw new Error(`Cannot rename "${oldInfinitive}": verb not found.`);
    }

    const isBaseVerb = !!this.verbsCache[oldKey];

    // Fetch existing raw override if any
    let existingOldOverride: UserOverride | undefined = undefined;
    if (this.useInMemoryFallback) {
      existingOldOverride = this.inMemoryOverrides[oldKey];
    } else {
      try {
        await db.open();
        existingOldOverride = await db.overrides.get(oldKey);
      } catch (e) {
        existingOldOverride = this.inMemoryOverrides[oldKey];
      }
    }

    // Clone all conjugations from sourceVerb into cellOverrides so that base data is fully preserved
    const clonedCellOverrides: Record<string, string> = {};
    if (sourceVerb.conjugations) {
      for (const [tense, persons] of Object.entries(sourceVerb.conjugations)) {
        if (persons && typeof persons === "object") {
          for (const [person, forms] of Object.entries(persons)) {
            if (Array.isArray(forms) && forms.length > 0) {
              clonedCellOverrides[`${tense}_${person}`] = forms.join(" ");
            }
          }
        }
      }
    }

    // If source had manual cellOverrides, ensure they take precedence
    if (existingOldOverride?.cellOverrides) {
      Object.assign(clonedCellOverrides, existingOldOverride.cellOverrides);
    }

    const newOverride: UserOverride = {
      infinitive: newKey,
      hilfsverb: sourceVerb.hilfsverb || "haben",
      bedeutung: sourceVerb.bedeutung || "",
      categories: sourceVerb.categories && sourceVerb.categories.length > 0 ? sourceVerb.categories : ["regular"],
      cellOverrides: clonedCellOverrides,
      sortOrder: sourceVerb.sortOrder ?? 9999,
      isDeleted: false
    };

    // 3. Atomically update storage:
    // If base verb: tombstone oldKey so it no longer appears under oldKey.
    // If custom verb: delete oldKey.
    if (this.useInMemoryFallback) {
      if (isBaseVerb) {
        this.inMemoryOverrides[oldKey] = {
          infinitive: oldKey,
          isDeleted: true
        };
      } else {
        delete this.inMemoryOverrides[oldKey];
      }
      this.inMemoryOverrides[newKey] = newOverride;
    } else {
      try {
        await db.open();
        await db.transaction("rw", db.overrides, async () => {
          if (isBaseVerb) {
            await db.overrides.put({
              infinitive: oldKey,
              isDeleted: true
            });
          } else {
            await db.overrides.delete(oldKey);
          }
          await db.overrides.put(newOverride);
        });
      } catch (e) {
        console.warn("Transaction failed during rename, applying to fallback memory", e);
        this.useInMemoryFallback = true;
        if (isBaseVerb) {
          this.inMemoryOverrides[oldKey] = {
            infinitive: oldKey,
            isDeleted: true
          };
        } else {
          delete this.inMemoryOverrides[oldKey];
        }
        this.inMemoryOverrides[newKey] = newOverride;
      }
    }

    // 4. Update verbs_custom_order
    const customOrder = await this.getCustomOrder();
    const updatedOrder = customOrder.map((k) => (canonicalVerbKey(k) === oldKey ? newKey : k));
    if (!updatedOrder.some((k) => canonicalVerbKey(k) === newKey)) {
      updatedOrder.unshift(newKey);
    }
    await this.saveCustomOrder(updatedOrder);

    // 5. Log the change for History undo
    await this.logChange(oldKey, "field_edit", existingOldOverride || null, {
      infinitive: newKey
    });
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

  private async ensureDbInitialized(): Promise<boolean> {
    const isInit = await this.getSetting<boolean>("db_initialized");
    return !!isInit;
  }

  /**
   * Retrieve all categories from DB or memory, seeded with defaults only on initial run
   */
  public async getCategories(): Promise<Category[]> {
    if (this.useInMemoryFallback) {
      return [...this.inMemoryCategories];
    }
    try {
      await db.open();
      const isInit = await this.ensureDbInitialized();
      const list = await db.categories.toArray();
      if (!this.categoriesSeeded && !isInit && list.length === 0) {
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
          await db.categories.bulkPut(defaults);
          this.categoriesSeeded = true;
        } catch (addErr) {
          console.warn("Failed to save default categories to DB", addErr);
        }
        await this.saveSetting("db_initialized", true);
        return defaults;
      }
      this.categoriesSeeded = true;
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
   * Delete a category and remove it from any verb overrides and vocabulary tags within a single transaction
   */
  public async deleteCategory(id: string): Promise<void> {
    if (this.useInMemoryFallback) {
      this.inMemoryCategories = this.inMemoryCategories.filter(c => c.id !== id);
      for (const [key, ov] of Object.entries(this.inMemoryOverrides)) {
        if (ov.categories && ov.categories.includes(id)) {
          ov.categories = ov.categories.filter(c => c !== id);
        }
      }
      if (this.inMemoryVocabularies) {
        for (const voc of this.inMemoryVocabularies) {
          if (voc.tags && voc.tags.includes(id)) {
            voc.tags = voc.tags.filter(t => t !== id);
          }
        }
      }
      return;
    }
    try {
      await db.open();
      await db.transaction("rw", db.categories, db.overrides, db.vocabularies, async () => {
        await db.categories.delete(id);

        // Clean up verb overrides referencing this category
        const overrides = await db.overrides.toArray();
        for (const ov of overrides) {
          if (ov.categories && ov.categories.includes(id)) {
            const updatedCats = ov.categories.filter(c => c !== id);
            await db.overrides.update(ov.infinitive, { categories: updatedCats });
          }
        }

        // Clean up vocabulary tags referencing this category
        const vocabs = await db.vocabularies.toArray();
        for (const voc of vocabs) {
          if (voc.tags && voc.tags.includes(id)) {
            const updatedTags = voc.tags.filter(t => t !== id);
            await db.vocabularies.update(voc.id, { tags: updatedTags });
          }
        }
      });

      // Keep in-memory cache in sync
      this.inMemoryCategories = this.inMemoryCategories.filter(c => c.id !== id);
      for (const [key, ov] of Object.entries(this.inMemoryOverrides)) {
        if (ov.categories && ov.categories.includes(id)) {
          ov.categories = ov.categories.filter(c => c !== id);
        }
      }
      if (this.inMemoryVocabularies) {
        for (const voc of this.inMemoryVocabularies) {
          if (voc.tags && voc.tags.includes(id)) {
            voc.tags = voc.tags.filter(t => t !== id);
          }
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
      if (this.inMemoryVocabularies) {
        for (const voc of this.inMemoryVocabularies) {
          if (voc.tags && voc.tags.includes(id)) {
            voc.tags = voc.tags.filter(t => t !== id);
          }
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
        // Note: conjugationPracticeStats are independent of the verb database and MUST survive a DB reset.
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
    const result: VocabularyItem[] = [];

    for (const item of list) {
      if (!item || !item.id) continue;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
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
        if (!this.inMemoryVocabularies) {
          const isInit = await this.ensureDbInitialized();
          if (!isInit) {
            this.inMemoryVocabularies = [...this.defaultSampleVocabularies];
            await this.saveSetting("db_initialized", true);
          } else {
            this.inMemoryVocabularies = [];
          }
        }
      }
      this.inMemoryVocabularies = this.deduplicateVocabularies(this.inMemoryVocabularies);
      return [...this.inMemoryVocabularies];
    }

    try {
      await db.open();
      const isInit = await this.ensureDbInitialized();
      const list = await db.vocabularies.toArray();
      if (!this.vocabulariesSeeded && !isInit && (!list || list.length === 0)) {
        // Seed default sample vocabularies only on first initialization
        await db.vocabularies.bulkPut(this.defaultSampleVocabularies);
        this.vocabulariesSeeded = true;
        this.inMemoryVocabularies = [...this.defaultSampleVocabularies];
        await this.saveSetting("db_initialized", true);
        return [...this.defaultSampleVocabularies];
      }
      this.vocabulariesSeeded = true;
      const cleanList = this.deduplicateVocabularies(list || []);
      this.inMemoryVocabularies = cleanList;
      return cleanList;
    } catch (e) {
      console.warn("IndexedDB vocabularies fetch failed, falling back to memory", e);
      this.useInMemoryFallback = true;
      if (!this.inMemoryVocabularies) {
        const isInit = await this.ensureDbInitialized();
        if (!isInit) {
          this.inMemoryVocabularies = [...this.defaultSampleVocabularies];
          await this.saveSetting("db_initialized", true);
        } else {
          this.inMemoryVocabularies = [];
        }
      }
      this.inMemoryVocabularies = this.deduplicateVocabularies(this.inMemoryVocabularies);
      return [...this.inMemoryVocabularies];
    }
  }

  public async saveVocabularyDirect(item: VocabularyItem): Promise<void> {
    const now = Date.now();
    const preparedItem: VocabularyItem = {
      ...item,
      plural: normalizePluralField(item.plural),
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

    // Log change with explicit itemId for precise undo targeting
    await this.logVocabChange(
      item.word,
      isNew ? "vocab_add" : "vocab_edit",
      prevItem,
      item.id
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
      },
      id
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
        await db.vocabularies.bulkPut(this.defaultSampleVocabularies);
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
      const isInit = await this.ensureDbInitialized();
      if (!isInit) {
        await this.saveSetting("db_initialized", true);
        return [...this.defaultVocabCategories];
      }
      return [];
    }

    try {
      await db.open();
      const isInit = await this.ensureDbInitialized();
      const list = await db.vocabCategories.toArray();
      if (!this.vocabCategoriesSeeded && !isInit && (!list || list.length === 0)) {
        await db.vocabCategories.bulkPut(this.defaultVocabCategories);
        this.vocabCategoriesSeeded = true;
        await this.saveSetting("db_initialized", true);
        return [...this.defaultVocabCategories];
      }
      this.vocabCategoriesSeeded = true;
      return list || [];
    } catch (e) {
      console.warn("Error getting vocab categories from DB", e);
      return [];
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

      // Clean up tags referencing this category from all vocabulary items
      const vocabs = await this.getVocabularies();
      let changed = false;
      for (const voc of vocabs) {
        if (voc.tags && voc.tags.includes(id)) {
          voc.tags = voc.tags.filter(t => t !== id);
          changed = true;
        }
      }
      if (changed) {
        this.inMemoryVocabularies = vocabs;
        try {
          localStorage.setItem("g_verb_vocabularies", JSON.stringify(vocabs));
        } catch (e) {}
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-data-changed"));
      }
      return;
    }

    try {
      await db.open();
      await db.transaction("rw", [db.vocabCategories, db.vocabularies], async () => {
        await db.vocabCategories.delete(id);
        const vocabs = await db.vocabularies.toArray();
        for (const voc of vocabs) {
          if (voc.tags && voc.tags.includes(id)) {
            const updatedTags = voc.tags.filter(t => t !== id);
            await db.vocabularies.update(voc.id, { tags: updatedTags });
          }
        }
      });

      // Synchronize in-memory cache and localStorage
      if (this.inMemoryVocabularies) {
        for (const voc of this.inMemoryVocabularies) {
          if (voc.tags && voc.tags.includes(id)) {
            voc.tags = voc.tags.filter(t => t !== id);
          }
        }
        try {
          localStorage.setItem("g_verb_vocabularies", JSON.stringify(this.inMemoryVocabularies));
        } catch (e) {}
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-data-changed"));
      }
    } catch (e) {
      console.warn("Error deleting vocab category from DB", e);
      this.useInMemoryFallback = true;
      await this.deleteVocabCategory(id);
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
      const isInit = await this.ensureDbInitialized();
      if (!isInit) {
        await this.saveSetting("db_initialized", true);
        return [...this.defaultSynonymAntonymGroups];
      }
      return [];
    }

    try {
      await db.open();
      const isInit = await this.ensureDbInitialized();
      const list = await db.synonymAntonymGroups.toArray();
      if (!this.synonymAntonymGroupsSeeded && !isInit && (!list || list.length === 0)) {
        await db.synonymAntonymGroups.bulkPut(this.defaultSynonymAntonymGroups);
        this.synonymAntonymGroupsSeeded = true;
        await this.saveSetting("db_initialized", true);
        return [...this.defaultSynonymAntonymGroups];
      }
      this.synonymAntonymGroupsSeeded = true;
      return list || [];
    } catch (e) {
      console.warn("Error fetching synonym/antonym groups from DB", e);
      return [];
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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("synonym-antonym-changed"));
      }
      return;
    }

    try {
      await db.synonymAntonymGroups.put(group);
    } catch (e) {
      console.warn("Error saving synonym/antonym group to DB", e);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("synonym-antonym-changed"));
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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("synonym-antonym-changed"));
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
  // Conjugation Practice Mistake Stats
  // ----------------------------------------------------
  public async recordConjugationWrong(
    infinitive: string,
    tense: PracticeTense,
    person: "S1" | "S2" | "S3" | "P1" | "P2" | "P3",
    userAnswer: string,
    correctAnswer: string
  ): Promise<void> {
    const cleanInf = (infinitive || "").toLowerCase().trim();
    if (!cleanInf) return;
    const id = `${cleanInf}|${tense}|${person}`;

    let existing: ConjugationPracticeStat | undefined;
    try {
      await db.open();
      existing = await db.conjugationPracticeStats.get(id);
    } catch (e) {
      console.warn("Could not read practice stat from IndexedDB, checking fallback", e);
    }
    if (!existing) {
      existing = this.inMemoryConjugationStats.find((s) => s.id === id);
    }

    const statItem: ConjugationPracticeStat = {
      id,
      infinitive: cleanInf,
      tense,
      person,
      wrongCount: (existing?.wrongCount || 0) + 1,
      lastWrongAt: Date.now(),
      lastUserAnswer: userAnswer,
      lastCorrectAnswer: correctAnswer,
    };

    try {
      await db.open();
      await db.conjugationPracticeStats.put(statItem);
    } catch (e) {
      console.warn("Failed to put practice stat in IndexedDB, using fallback", e);
    }

    this.inMemoryConjugationStats = [
      statItem,
      ...this.inMemoryConjugationStats.filter((s) => s.id !== id),
    ];
    try {
      localStorage.setItem("g_conjugation_practice_stats", JSON.stringify(this.inMemoryConjugationStats));
    } catch (e) {}
  }

  public async getConjugationStatsForVerb(infinitive: string): Promise<ConjugationPracticeStat[]> {
    const cleanInf = (infinitive || "").toLowerCase().trim();
    if (!cleanInf) return [];
    try {
      await db.open();
      // Try indexed query first
      try {
        const stats = await db.conjugationPracticeStats.where("infinitive").equals(cleanInf).toArray();
        if (stats && stats.length > 0) return stats.filter((s) => (s.wrongCount || 0) > 0);
      } catch (idxErr) {
        // Fallback to scanning/filtering if index is upgrading
        const all = await db.conjugationPracticeStats.toArray();
        const filtered = all.filter((s) => (s.infinitive || "").toLowerCase().trim() === cleanInf && (s.wrongCount || 0) > 0);
        if (filtered && filtered.length > 0) return filtered;
      }
    } catch (e) {
      console.warn("Could not read practice stats for verb from IndexedDB, using fallback", e);
    }
    return this.inMemoryConjugationStats.filter((s) => (s.infinitive || "").toLowerCase().trim() === cleanInf && (s.wrongCount || 0) > 0);
  }

  public async getAllConjugationStats(): Promise<ConjugationPracticeStat[]> {
    try {
      await db.open();
      const stats = await db.conjugationPracticeStats.toArray();
      if (stats && stats.length > 0) {
        const filtered = stats.filter((s) => (s.wrongCount || 0) > 0);
        this.inMemoryConjugationStats = filtered;
        return filtered;
      }
    } catch (e) {
      console.warn("Could not read all practice stats from IndexedDB, using fallback", e);
    }
    const raw = typeof window !== "undefined" ? localStorage.getItem("g_conjugation_practice_stats") : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const filtered = Array.isArray(parsed) ? parsed.filter((s: ConjugationPracticeStat) => (s.wrongCount || 0) > 0) : [];
        this.inMemoryConjugationStats = filtered;
        return filtered;
      } catch (e) {}
    }
    return this.inMemoryConjugationStats.filter((s) => (s.wrongCount || 0) > 0);
  }

  public async resetConjugationStatsForVerb(infinitive: string): Promise<void> {
    const cleanInf = (infinitive || "").toLowerCase().trim();
    if (!cleanInf) return;
    try {
      await db.open();
      let matching: ConjugationPracticeStat[] = [];
      try {
        matching = await db.conjugationPracticeStats.where("infinitive").equals(cleanInf).toArray();
      } catch (idxErr) {
        const all = await db.conjugationPracticeStats.toArray();
        matching = all.filter((s) => (s.infinitive || "").toLowerCase().trim() === cleanInf);
      }
      const ids = matching.map((m) => m.id);
      if (ids.length > 0) {
        await db.conjugationPracticeStats.bulkDelete(ids);
      }
    } catch (e) {
      console.warn("Failed to reset practice stats in IndexedDB, using fallback", e);
    }
    this.inMemoryConjugationStats = this.inMemoryConjugationStats.filter((s) => (s.infinitive || "").toLowerCase().trim() !== cleanInf);
    try {
      localStorage.setItem("g_conjugation_practice_stats", JSON.stringify(this.inMemoryConjugationStats));
    } catch (e) {}
  }

  // ----------------------------------------------------
  // Conjugation Practice Sessions History
  // ----------------------------------------------------
  private normalizeSessionRecord(s: any): PracticeSession {
    const startedAt = s.startedAt || s.date || Date.now();
    const completedAt = s.completedAt !== undefined ? s.completedAt : (s.date || startedAt);
    const verbInfinitives = Array.isArray(s.verbInfinitives)
      ? s.verbInfinitives
      : Array.isArray(s.verbList)
      ? s.verbList
      : [];
    const tenses = Array.isArray(s.tenses)
      ? s.tenses
      : Array.isArray(s.selectedTenses)
      ? s.selectedTenses
      : (["PRASENS"] as PracticeTense[]);
    const correctCount = typeof s.correctCount === "number" ? s.correctCount : 0;
    const wrongCount = typeof s.wrongCount === "number" ? s.wrongCount : 0;
    const totalCells = typeof s.totalCells === "number"
      ? s.totalCells
      : typeof s.totalChecked === "number"
      ? s.totalChecked
      : correctCount + wrongCount;

    return {
      id: s.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      startedAt,
      completedAt,
      verbInfinitives,
      tenses,
      totalCells,
      correctCount,
      wrongCount,
      isFavorite: !!s.isFavorite,
      date: s.date || startedAt,
      verbList: verbInfinitives,
      selectedTenses: tenses,
      totalChecked: totalCells,
    };
  }

  public async savePracticeSession(session: PracticeSession): Promise<void> {
    if (!session || !session.id) return;
    const normalized = this.normalizeSessionRecord(session);
    try {
      await db.open();
      await db.practiceSessions.put(normalized);
    } catch (e) {
      console.warn("Failed to put practice session in IndexedDB, using fallback", e);
    }

    this.inMemoryPracticeSessions = [
      normalized,
      ...this.inMemoryPracticeSessions.filter((s) => s.id !== normalized.id),
    ].sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt));

    try {
      localStorage.setItem("g_conjugation_practice_sessions", JSON.stringify(this.inMemoryPracticeSessions));
    } catch (e) {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("practice-sessions-changed"));
    }
  }

  public async getAllPracticeSessions(): Promise<PracticeSession[]> {
    try {
      await db.open();
      const rawSessions = await db.practiceSessions.toArray();
      if (rawSessions && rawSessions.length > 0) {
        const sessions = rawSessions.map((s) => this.normalizeSessionRecord(s));
        sessions.sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt));
        this.inMemoryPracticeSessions = sessions;
        return sessions;
      }
    } catch (e) {
      console.warn("Could not read practice sessions from IndexedDB, using fallback", e);
    }
    const raw = typeof window !== "undefined" ? localStorage.getItem("g_conjugation_practice_sessions") : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sessions = parsed.map((s) => this.normalizeSessionRecord(s));
          sessions.sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt));
          this.inMemoryPracticeSessions = sessions;
          return sessions;
        }
      } catch (e) {}
    }
    return this.inMemoryPracticeSessions;
  }

  public async togglePracticeSessionFavorite(id: string): Promise<void> {
    if (!id) return;
    const all = await this.getAllPracticeSessions();
    const target = all.find((s) => s.id === id);
    if (!target) return;
    const updated: PracticeSession = {
      ...target,
      isFavorite: !target.isFavorite,
    };
    await this.savePracticeSession(updated);
  }

  public async deletePracticeSession(id: string): Promise<void> {
    if (!id) return;
    try {
      await db.open();
      await db.practiceSessions.delete(id);
    } catch (e) {
      console.warn("Failed to delete practice session from IndexedDB, using fallback", e);
    }
    this.inMemoryPracticeSessions = this.inMemoryPracticeSessions.filter((s) => s.id !== id);
    try {
      localStorage.setItem("g_conjugation_practice_sessions", JSON.stringify(this.inMemoryPracticeSessions));
    } catch (e) {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("practice-sessions-changed"));
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
    let conjugationPracticeStats: ConjugationPracticeStat[] = [];
    let practiceSessions: PracticeSession[] = [];
    let settings: Array<{ key: string; value: any }> = [];

    // Retrieve authoritative snapshot from active storage layer
    if (this.useInMemoryFallback) {
      overrides = Object.values(this.inMemoryOverrides);
      categories = [...this.inMemoryCategories];
      vocabularies = await this.getVocabularies();
      vocabCategories = await this.getVocabCategories();
      synonymAntonymGroups = await this.getSynonymAntonymGroups();
      savedStories = await this.getSavedStories();
      conjugationPracticeStats = await this.getAllConjugationStats();

      // Reconstruct settings from inMemorySettings and localStorage fallbacks
      const settingsMap = new Map<string, any>();
      for (const [k, v] of Object.entries(this.inMemorySettings)) {
        if (v !== undefined && v !== null) {
          settingsMap.set(k, v);
        }
      }
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          for (let i = 0; i < window.localStorage.length; i++) {
            const lsKey = window.localStorage.key(i);
            if (lsKey && lsKey.startsWith("g_verb_setting_")) {
              const settingKey = lsKey.substring("g_verb_setting_".length);
              if (!settingsMap.has(settingKey)) {
                try {
                  const val = JSON.parse(window.localStorage.getItem(lsKey) || "null");
                  if (val !== null) settingsMap.set(settingKey, val);
                } catch (e) {}
              }
            }
          }
        }
      } catch (e) {}

      settings = Array.from(settingsMap.entries()).map(([key, value]) => ({ key, value }));
    } else {
      try {
        await db.open();
        overrides = await db.overrides.toArray();
        categories = await db.categories.toArray();
        vocabularies = await db.vocabularies.toArray();
        vocabCategories = await db.vocabCategories.toArray();
        synonymAntonymGroups = await db.synonymAntonymGroups.toArray();
        savedStories = await db.savedStories.toArray();
        settings = await db.settings.toArray();

        // Overlay any in-memory settings that might be newer
        const settingsMap = new Map<string, any>(settings.map(s => [s.key, s.value]));
        for (const [k, v] of Object.entries(this.inMemorySettings)) {
          if (v !== undefined && v !== null) {
            settingsMap.set(k, v);
          }
        }
        settings = Array.from(settingsMap.entries()).map(([key, value]) => ({ key, value }));
      } catch (e) {
        console.warn("Error reading IndexedDB for full export, using memory/fallback", e);
        this.useInMemoryFallback = true;
        overrides = Object.values(this.inMemoryOverrides);
        categories = [...this.inMemoryCategories];
        vocabularies = await this.getVocabularies();
        vocabCategories = await this.getVocabCategories();
        synonymAntonymGroups = await this.getSynonymAntonymGroups();
        savedStories = await this.getSavedStories();

        const settingsMap = new Map<string, any>();
        for (const [k, v] of Object.entries(this.inMemorySettings)) {
          if (v !== undefined && v !== null) {
            settingsMap.set(k, v);
          }
        }
        settings = Array.from(settingsMap.entries()).map(([key, value]) => ({ key, value }));
      }
    }

    let allVerbs: VerbItem[] = [];
    try {
      allVerbs = await this.getAllVerbs();
    } catch (e) {
      console.warn("Failed to get all verbs for backup:", e);
    }

    try {
      conjugationPracticeStats = await this.getAllConjugationStats();
    } catch (e) {
      console.warn("Failed to get conjugation practice stats for backup:", e);
    }

    try {
      practiceSessions = await this.getAllPracticeSessions();
    } catch (e) {
      console.warn("Failed to get practice sessions for backup:", e);
    }

    // Retrieve authoritative change histories through their actual service APIs
    const appHistory = await this.getChangeLogs();
    const vocabHistory = await this.getVocabChangeLogs();

    // Ensure settings snapshot includes history entries
    const ensureSetting = (k: string, val: any) => {
      const idx = settings.findIndex(s => s.key === k);
      if (idx >= 0) {
        settings[idx] = { key: k, value: val };
      } else {
        settings.push({ key: k, value: val });
      }
    };
    ensureSetting("change_history_log", appHistory);
    ensureSetting("vocab_change_history_log", vocabHistory);

    // Normalize overrides infinitives to canonical lowercase
    const canonicalOverrides = overrides.map(o => ({
      ...o,
      infinitive: canonicalVerbKey(o.infinitive)
    }));

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
        totalSavedStories: savedStories.length,
        totalPracticeStats: conjugationPracticeStats.length,
        totalPracticeSessions: practiceSessions.length
      },
      data: {
        verbs: allVerbs,
        verbsCache: this.verbsCache,
        verbCategories: categories,
        overrides: canonicalOverrides,
        vocabularies,
        vocabCategories,
        lexicalNetworkGroups: synonymAntonymGroups,
        synonymAntonymGroups,
        savedStories,
        conjugationPracticeStats,
        practiceSessions,
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

      // Support direct raw array of vocabulary items
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && parsed[0].word !== undefined) {
          const validVocabs: VocabularyItem[] = parsed.filter(item => item && typeof item === "object" && item.id && item.word);
          if (!this.useInMemoryFallback) {
            await db.open();
            await db.transaction("rw", db.vocabularies, async () => {
              await db.vocabularies.clear();
              if (validVocabs.length > 0) {
                await db.vocabularies.bulkPut(validVocabs);
              }
            });
          }
          this.inMemoryVocabularies = validVocabs;
          try {
            localStorage.setItem("g_verb_vocabularies", JSON.stringify(validVocabs));
          } catch (e) {}
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("vocab-data-changed"));
          }
          return true;
        }
      }

      const data = parsed.data || parsed; // Support both wrapped and direct json
      if (!data || typeof data !== "object") {
        throw new Error("Invalid backup JSON structure.");
      }

      // Pre-validation and normalization before making any state mutations
      let overridesToPut: UserOverride[] | null = null;
      if (Array.isArray(data.overrides)) {
        overridesToPut = data.overrides.map((o: any) => ({
          ...o,
          infinitive: canonicalVerbKey(o.infinitive || "")
        })).filter((o: any) => !!o.infinitive);
      }

      const categoriesToPut: Category[] | null = data.verbCategories !== undefined
        ? (Array.isArray(data.verbCategories) ? data.verbCategories : [])
        : data.categories !== undefined
        ? (Array.isArray(data.categories) ? data.categories : [])
        : null;

      const vocabulariesToPut: VocabularyItem[] | null = data.vocabularies !== undefined
        ? (Array.isArray(data.vocabularies) ? data.vocabularies : [])
        : null;

      const vocabCategoriesToPut: VocabularyCategory[] | null = data.vocabCategories !== undefined
        ? (Array.isArray(data.vocabCategories) ? data.vocabCategories : [])
        : null;

      const synAntToPut: SynonymAntonymGroup[] | null = data.lexicalNetworkGroups !== undefined
        ? (Array.isArray(data.lexicalNetworkGroups) ? data.lexicalNetworkGroups : [])
        : data.synonymAntonymGroups !== undefined
        ? (Array.isArray(data.synonymAntonymGroups) ? data.synonymAntonymGroups : [])
        : null;

      const storiesToPut: SavedStory[] | null = data.savedStories !== undefined
        ? (Array.isArray(data.savedStories) ? data.savedStories : [])
        : null;

      const practiceStatsToPut: ConjugationPracticeStat[] | null = data.conjugationPracticeStats !== undefined
        ? (Array.isArray(data.conjugationPracticeStats) ? data.conjugationPracticeStats : [])
        : null;

      const practiceSessionsToPut: PracticeSession[] | null = data.practiceSessions !== undefined
        ? (Array.isArray(data.practiceSessions) ? data.practiceSessions : [])
        : null;

      // Settings normalization: harmonize history and custom orders into settings table records
      let settingsToPut: Array<{ key: string; value: any }> | null = null;
      if (Array.isArray(data.settings)) {
        const sMap = new Map<string, any>();
        for (const s of data.settings) {
          if (s && s.key) sMap.set(s.key, s.value);
        }
        if (Array.isArray(data.appHistory) && !sMap.has("change_history_log")) {
          sMap.set("change_history_log", data.appHistory);
        }
        if (Array.isArray(data.vocabHistory) && !sMap.has("vocab_change_history_log")) {
          sMap.set("vocab_change_history_log", data.vocabHistory);
        }
        if (Array.isArray(data.customVerbOrder) && !sMap.has("verbs_custom_order")) {
          sMap.set("verbs_custom_order", data.customVerbOrder.map(canonicalVerbKey));
        }
        if (Array.isArray(data.customVocabOrder) && !sMap.has("vocabularies_custom_order")) {
          sMap.set("vocabularies_custom_order", data.customVocabOrder);
        }
        sMap.set("db_initialized", true);
        settingsToPut = Array.from(sMap.entries()).map(([key, value]) => ({ key, value }));
      } else {
        const sMap = new Map<string, any>();
        if (Array.isArray(data.appHistory)) {
          sMap.set("change_history_log", data.appHistory);
        }
        if (Array.isArray(data.vocabHistory)) {
          sMap.set("vocab_change_history_log", data.vocabHistory);
        }
        if (Array.isArray(data.customVerbOrder)) {
          sMap.set("verbs_custom_order", data.customVerbOrder.map(canonicalVerbKey));
        }
        if (Array.isArray(data.customVocabOrder)) {
          sMap.set("vocabularies_custom_order", data.customVocabOrder);
        }
        sMap.set("db_initialized", true);
        settingsToPut = Array.from(sMap.entries()).map(([key, value]) => ({ key, value }));
      }

      // Execute single atomic multi-table transaction across all persistent IndexedDB tables
      if (!this.useInMemoryFallback) {
        await db.open();
        await db.transaction(
          "rw",
          [
            db.overrides,
            db.categories,
            db.vocabularies,
            db.vocabCategories,
            db.synonymAntonymGroups,
            db.settings,
            db.savedStories,
            db.conjugationPracticeStats,
            db.practiceSessions
          ],
          async () => {
            if (overridesToPut !== null) {
              await db.overrides.clear();
              if (overridesToPut.length > 0) {
                await db.overrides.bulkPut(overridesToPut);
              }
            }
            if (categoriesToPut !== null) {
              await db.categories.clear();
              if (categoriesToPut.length > 0) {
                await db.categories.bulkPut(categoriesToPut);
              }
            }
            if (vocabulariesToPut !== null) {
              await db.vocabularies.clear();
              if (vocabulariesToPut.length > 0) {
                await db.vocabularies.bulkPut(vocabulariesToPut);
              }
            }
            if (vocabCategoriesToPut !== null) {
              await db.vocabCategories.clear();
              if (vocabCategoriesToPut.length > 0) {
                await db.vocabCategories.bulkPut(vocabCategoriesToPut);
              }
            }
            if (synAntToPut !== null) {
              await db.synonymAntonymGroups.clear();
              if (synAntToPut.length > 0) {
                await db.synonymAntonymGroups.bulkPut(synAntToPut);
              }
            }
            if (settingsToPut !== null) {
              await db.settings.clear();
              if (settingsToPut.length > 0) {
                await db.settings.bulkPut(settingsToPut);
              }
            }
            if (storiesToPut !== null) {
              await db.savedStories.clear();
              if (storiesToPut.length > 0) {
                await db.savedStories.bulkPut(storiesToPut);
              }
            }
            if (practiceStatsToPut !== null) {
              await db.conjugationPracticeStats.clear();
              if (practiceStatsToPut.length > 0) {
                await db.conjugationPracticeStats.bulkPut(practiceStatsToPut);
              }
            }
            if (practiceSessionsToPut !== null) {
              await db.practiceSessions.clear();
              if (practiceSessionsToPut.length > 0) {
                await db.practiceSessions.bulkPut(practiceSessionsToPut);
              }
            }
          }
        );
      }

      // ONLY after atomic transaction succeeds: synchronize memory caches & localStorage
      if (overridesToPut !== null) {
        this.inMemoryOverrides = {};
        for (const o of overridesToPut) {
          if (o.infinitive) {
            this.inMemoryOverrides[canonicalVerbKey(o.infinitive)] = o;
          }
        }
      }

      if (categoriesToPut !== null) {
        this.inMemoryCategories = categoriesToPut;
      }

      if (vocabulariesToPut !== null) {
        this.inMemoryVocabularies = vocabulariesToPut;
        try {
          localStorage.setItem("g_verb_vocabularies", JSON.stringify(vocabulariesToPut));
        } catch (e) {}
      }

      if (vocabCategoriesToPut !== null) {
        try {
          localStorage.setItem("g_verb_vocab_categories", JSON.stringify(vocabCategoriesToPut));
        } catch (e) {}
      }

      if (synAntToPut !== null) {
        try {
          localStorage.setItem("g_verb_syn_ant_groups", JSON.stringify(synAntToPut));
        } catch (e) {}
      }

      if (storiesToPut !== null) {
        this.inMemorySavedStories = storiesToPut;
        try {
          localStorage.setItem("g_saved_stories", JSON.stringify(storiesToPut));
        } catch (e) {}
      }

      if (practiceStatsToPut !== null) {
        this.inMemoryConjugationStats = practiceStatsToPut;
        try {
          localStorage.setItem("g_conjugation_practice_stats", JSON.stringify(practiceStatsToPut));
        } catch (e) {}
      }

      if (practiceSessionsToPut !== null) {
        this.inMemoryPracticeSessions = practiceSessionsToPut;
        try {
          localStorage.setItem("g_conjugation_practice_sessions", JSON.stringify(practiceSessionsToPut));
        } catch (e) {}
      }

      // Synchronize settings memory and localStorage to prevent old cached settings from shadowing
      if (settingsToPut !== null) {
        // 1. Wipe inMemorySettings
        this.inMemorySettings = {};

        // 2. Clear stale localStorage settings keys
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            const keysToRemove: string[] = [];
            for (let i = 0; i < window.localStorage.length; i++) {
              const k = window.localStorage.key(i);
              if (k && k.startsWith("g_verb_setting_")) {
                keysToRemove.push(k);
              }
            }
            for (const k of keysToRemove) {
              window.localStorage.removeItem(k);
            }
          }
        } catch (e) {}

        // 3. Populate new settings
        for (const s of settingsToPut) {
          this.inMemorySettings[s.key] = s.value;
          try {
            if (typeof window !== "undefined" && window.localStorage) {
              window.localStorage.setItem(`g_verb_setting_${s.key}`, JSON.stringify(s.value));
            }
          } catch (e) {}
        }
      }

      // Verbs Cache / Raw Conjugations
      if (data.verbsCache && typeof data.verbsCache === "object" && Object.keys(data.verbsCache).length > 0) {
        this.cacheJsonDatabase(data.verbsCache);
        await this.saveSetting("cached_base_json", JSON.stringify(data.verbsCache));
      } else if (Array.isArray(data.verbs) && data.verbs.length > 0) {
        const constructedCache: Record<string, TenseConjugations> = {};
        for (const verb of data.verbs) {
          if (verb.infinitive) {
            constructedCache[canonicalVerbKey(verb.infinitive)] = verb.conjugations || {};
          }
        }
        if (Object.keys(constructedCache).length > 0) {
          this.cacheJsonDatabase(constructedCache);
          await this.saveSetting("cached_base_json", JSON.stringify(constructedCache));
        }
      }

      // Dispatch global change events
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
