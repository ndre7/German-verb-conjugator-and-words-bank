import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Dumbbell,
  Check,
  X,
  RotateCcw,
  Search,
  BarChart3,
  AlertCircle,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Star,
  Shuffle,
  Trash2,
  HelpCircle,
  History,
  Calendar,
  Filter,
  Heart,
} from "lucide-react";
import { dbService } from "../DatabaseService";
import {
  VerbItem,
  PracticeTense,
  ConjugationPracticeStat,
  ConjugationPerson,
  Tense,
  TENSE_LABELS,
  TENSE_ORDER,
  PracticeSession,
} from "../types";
import { translations, Locale } from "../translations";
import { isAnswerCorrect, extractCandidatesFromCell } from "../utils/answerNormalization";
import { sortBySearchRank } from "../utils/searchRanking";

interface ConjugationPracticeProps {
  locale: Locale;
  isRtl: boolean;
}

const ALL_PRACTICE_TENSES: PracticeTense[] = [
  "PRASENS",
  "PERFEKT",
  "PRATERITUM",
  "KONJUNKTIV2_PRATERITUM",
  "FUTUR1",
  "PLUSQUAMPERFEKT",
  "KONJUNKTIV1_PRASENS",
  "FUTUR2",
  "IMPERATIV",
];

const PERSON_KEYS: Array<keyof ConjugationPerson> = ["S1", "S2", "S3", "P1", "P2", "P3"];
const GERMAN_UMLAUTS = ["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"];

// Fisher-Yates array shuffle (never Math.random() - 0.5)
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function ConjugationPractice({ locale, isRtl }: ConjugationPracticeProps) {
  const t = translations[locale] || translations.en;

  // Primary Segmented Tab: Practice ("تمرین") vs Mistake Stats ("آمار اشتباهات") vs History ("تاریخچه")
  const [activeMainTab, setActiveMainTab] = useState<"practice" | "stats" | "history">("practice");

  // Practice Sessions History State
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [historyFilterOnlyFavorites, setHistoryFilterOnlyFavorites] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<PracticeSession | null>(null);
  const [showRePracticeModal, setShowRePracticeModal] = useState(false);
  const currentSessionIdRef = useRef<string>("");
  const currentSessionRef = useRef<PracticeSession | null>(null);
  const firstCheckMapRef = useRef<Map<string, boolean>>(new Map());

  // Stats search filter (200ms debounce)
  const [statsSearchQuery, setStatsSearchQuery] = useState("");
  const [debouncedStatsSearch, setDebouncedStatsSearch] = useState("");

  // Phase State: "setup" vs "practicing"
  const [practicePhase, setPracticePhase] = useState<"setup" | "practicing">("setup");

  // All loaded verbs from Database
  const [allVerbs, setAllVerbs] = useState<VerbItem[]>([]);
  const [loadingVerbs, setLoadingVerbs] = useState(true);

  // Setup Phase: Selected Verbs and Tenses
  const [practiceVerbList, setPracticeVerbList] = useState<string[]>([]);
  const [selectedTenses, setSelectedTenses] = useState<PracticeTense[]>([]);

  // Search Input & Suggestions
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Pre-Flight Modal State
  const [showPreFlightModal, setShowPreFlightModal] = useState(false);
  const [incompleteVerbsList, setIncompleteVerbsList] = useState<{ verb: VerbItem; tenses: PracticeTense[] }[]>([]);
  const [preFlightRemoveSet, setPreFlightRemoveSet] = useState<Set<string>>(new Set());

  // Practice Phase Grid State
  // Excluded cells: `${verb}|${tense}|${person}` that are empty in database
  const [excludedCells, setExcludedCells] = useState<Set<string>>(new Set());
  // userAnswers: verbKey -> cellKey -> value
  const [userAnswers, setUserAnswers] = useState<Record<string, Record<string, string>>>({});
  // cellResults: verbKey -> cellKey -> { isCorrect, checked, locked, lastCheckedAnswer }
  const [cellResults, setCellResults] = useState<
    Record<string, Record<string, { isCorrect: boolean; checked: boolean; locked?: boolean; lastCheckedAnswer?: string }>>
  >({});
  // Per-verb summary counters
  const [verbResultsSummary, setVerbResultsSummary] = useState<
    Record<string, { correct: number; wrong: number; totalChecked: number }>
  >({});
  // B7: Spoiler revealed cells state: Set of `${infinitive}|${tense}|${person}`
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());

  const revealCell = (cellKey: string) => {
    setRevealedCells((prev) => {
      const next = new Set(prev);
      next.add(cellKey);
      return next;
    });
  };

  // Focused cell ref for Umlaut buttons
  const focusedInputRef = useRef<{ verbKey: string; cellKey: string; inputEl: HTMLInputElement } | null>(null);

  // Statistics View State
  const [statsData, setStatsData] = useState<ConjugationPracticeStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [resetConfirmVerb, setResetConfirmVerb] = useState<string | null>(null);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);
  const umlautTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (umlautTimerRef.current) clearTimeout(umlautTimerRef.current);
    };
  }, []);

  const showToast = (msg: string | null, duration = 3500) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToastMessage(msg);
    if (msg) {
      toastTimer.current = setTimeout(() => {
        setToastMessage(null);
        toastTimer.current = null;
      }, duration);
    }
  };

  // 1. Load all verbs on mount
  useEffect(() => {
    const loadAll = async () => {
      setLoadingVerbs(true);
      try {
        const list = await dbService.getAllVerbs();
        setAllVerbs(list);
      } catch (e) {
        console.warn("Failed loading verbs for practice", e);
      } finally {
        setLoadingVerbs(false);
      }
    };
    loadAll();
  }, []);

  // 2. Load stats when switching to Stats tab
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const stats = await dbService.getAllConjugationStats();
      setStatsData(stats);
    } catch (e) {
      console.warn("Failed loading practice stats", e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (activeMainTab === "stats") {
      loadStats();
    } else if (activeMainTab === "history") {
      loadSessions();
    }
  }, [activeMainTab]);

  // Load practice sessions
  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await dbService.getAllPracticeSessions();
      setSessions(data);
    } catch (e) {
      console.warn("Failed loading practice sessions", e);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    const handleSessionsChanged = () => {
      loadSessions();
    };
    window.addEventListener("practice-sessions-changed", handleSessionsChanged);
    return () => window.removeEventListener("practice-sessions-changed", handleSessionsChanged);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentSessionRef.current && !currentSessionRef.current.completedAt) {
        currentSessionRef.current.completedAt = Date.now();
        void dbService.savePracticeSession({ ...currentSessionRef.current });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (currentSessionRef.current && !currentSessionRef.current.completedAt) {
        currentSessionRef.current.completedAt = Date.now();
        void dbService.savePracticeSession({ ...currentSessionRef.current });
      }
    };
  }, []);

  // Debounce stats search query (200ms)
  useEffect(() => {
    const tId = setTimeout(() => {
      setDebouncedStatsSearch(statsSearchQuery.trim());
    }, 200);
    return () => clearTimeout(tId);
  }, [statsSearchQuery]);

  // 3. Debounce search query (200ms)
  useEffect(() => {
    const tId = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setSuggestionIndex(-1);
    }, 200);
    return () => clearTimeout(tId);
  }, [searchQuery]);

  // Click outside listener for suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter suggestions
  const suggestions = useMemo(() => {
    if (!debouncedSearch) return [];
    const q = (debouncedSearch || "").toLowerCase().trim();
    const matched = allVerbs.filter(
      (v) =>
        (v.infinitive || "").toLowerCase().includes(q) ||
        (v.bedeutung && (v.bedeutung || "").toLowerCase().includes(q))
    );
    return sortBySearchRank(matched, q, (v) => ({
      primary: v.infinitive || "",
      secondary: v.bedeutung || "",
    })).slice(0, 8);
  }, [allVerbs, debouncedSearch]);

  // Add a verb to the practice list
  const handleAddVerb = (infinitive: string) => {
    const clean = infinitive.trim();
    if (!clean) return;
    if (practiceVerbList.includes(clean)) {
      showToast(t.practiceVerbAlreadyAdded || "This verb has already been added.");
      return;
    }
    if (practiceVerbList.length >= 80) {
      showToast(t.verbLimitReached || "Maximum 80 verbs allowed per practice.");
      return;
    }
    setPracticeVerbList((prev) => [...prev, clean]);
    setSearchQuery("");
    setShowSuggestions(false);
  };

  const handleRemoveVerb = (infinitive: string) => {
    setPracticeVerbList((prev) => prev.filter((v) => v !== infinitive));
  };

  // Quick-Add 1: All favorites
  const handleAddAllFavorites = () => {
    const favorites = allVerbs
      .filter((v) => v.categories && v.categories.includes("favorites"))
      .map((v) => v.infinitive);
    if (favorites.length === 0) {
      showToast(t.noFavoritesFound);
      return;
    }
    const combined = Array.from(new Set([...practiceVerbList, ...favorites]));
    if (combined.length > 80) {
      setPracticeVerbList(combined.slice(0, 80));
      showToast(t.verbLimitReached);
    } else {
      setPracticeVerbList(combined);
      showToast(
        (t.favoritesAddedToast || "{count} favorite verbs added.").replace("{count}", String(favorites.length))
      );
    }
  };

  // Quick-Add 2: 10 random verbs via Fisher-Yates
  const handleAddRandomTen = () => {
    if (allVerbs.length === 0) return;
    const available = allVerbs.filter((v) => !practiceVerbList.includes(v.infinitive));
    if (available.length < 10) {
      const shuffled = shuffleArray(available).map((v) => v.infinitive);
      const combined = [...practiceVerbList, ...shuffled].slice(0, 80);
      setPracticeVerbList(combined);
      showToast(t.randomTenInsufficient || "Fewer than 10 verbs available; added all available.");
      return;
    }
    const picked = shuffleArray(available).slice(0, 10).map((v) => v.infinitive);
    const combined = [...practiceVerbList, ...picked].slice(0, 80);
    setPracticeVerbList(combined);
    showToast(t.randomTenAddedToast);
  };

  // Tense selection toggle
  const handleToggleTense = (tense: PracticeTense) => {
    setSelectedTenses((prev) =>
      prev.includes(tense) ? prev.filter((t) => t !== tense) : [...prev, tense]
    );
  };

  const handleSelectAllTenses = () => {
    if (selectedTenses.length === ALL_PRACTICE_TENSES.length) {
      setSelectedTenses([]);
    } else {
      setSelectedTenses([...ALL_PRACTICE_TENSES]);
    }
  };

  // 4. Pre-Flight Check & Starting Practice
  const handleStartPracticePreFlight = () => {
    if (practiceVerbList.length === 0) {
      showToast(t.practiceNeedsVerbs || "Please select at least one verb.");
      return;
    }
    if (selectedTenses.length === 0) {
      showToast(t.practiceNeedsTenses || "Please select at least one tense.");
      return;
    }

    const verbMap = new Map<string, VerbItem>();
    for (const v of allVerbs) {
      if (v && v.infinitive) {
        verbMap.set((v.infinitive || "").toLowerCase().trim(), v);
      }
    }

    const incompleteList: { verb: VerbItem; tenses: PracticeTense[] }[] = [];

    for (const inf of practiceVerbList) {
      if (!inf) continue;
      const verb = verbMap.get((inf || "").toLowerCase().trim());
      if (!verb) continue;
      const incompleteForThisVerb: PracticeTense[] = [];

      for (const tense of selectedTenses) {
        let hasAnyData = false;
        for (const p of PERSON_KEYS) {
          const candidates = extractCandidatesFromCell(verb.conjugations?.[tense]?.[p]);
          if (candidates.length > 0) {
            hasAnyData = true;
            break;
          }
        }
        if (!hasAnyData) {
          incompleteForThisVerb.push(tense);
        }
      }

      if (incompleteForThisVerb.length > 0) {
        incompleteList.push({ verb, tenses: incompleteForThisVerb });
      }
    }

    if (incompleteList.length > 0) {
      setIncompleteVerbsList(incompleteList);
      // default: checked = will be removed
      setPreFlightRemoveSet(new Set(incompleteList.map((item) => item.verb.infinitive)));
      setShowPreFlightModal(true);
    } else {
      launchPracticeWithVerbs(practiceVerbList);
    }
  };

  const launchPracticeWithVerbs = (verbsToUse: string[], customTenses?: PracticeTense[]) => {
    const tensesToUse = (customTenses && customTenses.length > 0)
      ? customTenses
      : (selectedTenses.length > 0 ? selectedTenses : (["PRASENS"] as PracticeTense[]));
    setSelectedTenses(tensesToUse);

    const verbMap = new Map<string, VerbItem>();
    for (const v of allVerbs) {
      if (v && v.infinitive) {
        verbMap.set((v.infinitive || "").toLowerCase().trim(), v);
      }
    }

    // Build excluded cells set: any cell with 0 candidates is locked
    const excluded = new Set<string>();
    for (const inf of verbsToUse) {
      if (!inf) continue;
      const v = verbMap.get((inf || "").toLowerCase().trim());
      if (!v) continue;
      for (const tense of tensesToUse) {
        for (const p of PERSON_KEYS) {
          const candidates = extractCandidatesFromCell(v.conjugations?.[tense]?.[p]);
          if (candidates.length === 0) {
            excluded.add(`${(inf || "").toLowerCase().trim()}|${tense}|${p}`);
          }
        }
      }
    }

    setExcludedCells(excluded);
    setPracticeVerbList(verbsToUse);
    setUserAnswers({});
    setCellResults({});
    setVerbResultsSummary({});
    setRevealedCells(new Set());
    setShowPreFlightModal(false);

    // Calculate total valid cells for this session
    let totalCells = 0;
    for (const inf of verbsToUse) {
      if (!inf) continue;
      const v = verbMap.get((inf || "").toLowerCase().trim());
      if (!v) continue;
      for (const tense of tensesToUse) {
        for (const p of PERSON_KEYS) {
          const candidates = extractCandidatesFromCell(v.conjugations?.[tense]?.[p]);
          if (candidates.length > 0) {
            totalCells++;
          }
        }
      }
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    currentSessionIdRef.current = sessionId;
    firstCheckMapRef.current.clear();

    const initialSession: PracticeSession = {
      id: sessionId,
      startedAt: Date.now(),
      completedAt: 0,
      verbInfinitives: [...verbsToUse],
      tenses: [...tensesToUse],
      totalCells,
      correctCount: 0,
      wrongCount: 0,
      isFavorite: false,
    };
    currentSessionRef.current = initialSession;
    void dbService.savePracticeSession(initialSession);

    setPracticePhase("practicing");
  };

  // Pre-Flight Decision 1: Remove checked and start
  const handlePreFlightRemoveAndContinue = () => {
    const remaining = practiceVerbList.filter((inf) => !preFlightRemoveSet.has(inf));
    if (remaining.length === 0) {
      showToast(t.allVerbsRemovedToast);
      setShowPreFlightModal(false);
      return;
    }
    launchPracticeWithVerbs(remaining);
  };

  // Pre-Flight Decision 2: Continue with all
  const handlePreFlightContinueWithAll = () => {
    launchPracticeWithVerbs(practiceVerbList);
  };

  // Practice Phase: Cell Input Change
  const handleCellChange = (verbKey: string, cellKey: string, value: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [verbKey]: {
        ...(prev[verbKey] || {}),
        [cellKey]: value,
      },
    }));
  };

  // Insert Umlaut character into currently-focused cell
  const handleInsertUmlaut = (char: string) => {
    if (!focusedInputRef.current) return;
    const { verbKey, cellKey, inputEl } = focusedInputRef.current;
    if (!inputEl) return;
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;
    const oldVal = userAnswers[verbKey]?.[cellKey] || "";
    const newVal = oldVal.slice(0, start) + char + oldVal.slice(end);

    handleCellChange(verbKey, cellKey, newVal);

    if (umlautTimerRef.current) clearTimeout(umlautTimerRef.current);
    umlautTimerRef.current = setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.setSelectionRange(start + char.length, start + char.length);
      }
      umlautTimerRef.current = null;
    }, 0);
  };

  // Check answers for a single verb block
  const handleCheckVerbAnswers = async (verb: VerbItem) => {
    const verbKey = (verb?.infinitive || "").toLowerCase().trim();
    if (!verbKey) return;
    const currentVerbAnswers = userAnswers[verbKey] || {};
    const currentResults = { ...(cellResults[verbKey] || {}) };

    let correctCount = 0;
    let wrongCount = 0;
    let totalChecked = 0;

    for (const tense of orderedSelectedTenses) {
      for (const p of PERSON_KEYS) {
        const cellId = `${verbKey}|${tense}|${p}`;
        if (excludedCells.has(cellId)) continue; // locked empty cell

        const cellKey = `${tense}_${p}`;
        // If cell was already answered correctly, count as correct and do not re-evaluate or record
        if (currentResults[cellKey]?.isCorrect) {
          correctCount++;
          totalChecked++;
          continue;
        }

        const rawCandidates = verb.conjugations?.[tense]?.[p];
        const candidates = extractCandidatesFromCell(rawCandidates);
        if (candidates.length === 0) continue;

        const userInput = (currentVerbAnswers[cellKey] || "").trim();
        const isCorrect = isAnswerCorrect(userInput, candidates);

        const prevChecked = currentResults[cellKey]?.checked;
        const prevAnswer = currentResults[cellKey]?.lastCheckedAnswer;
        const isUnchangedAttempt = prevChecked && prevAnswer === userInput;

        if (isCorrect) {
          correctCount++;
          currentResults[cellKey] = {
            isCorrect: true,
            checked: true,
            locked: true,
            lastCheckedAnswer: userInput,
          };
          // Correct cells: DO NOT touch stats (never increment or decrement wrongCount)
        } else {
          wrongCount++;
          currentResults[cellKey] = {
            isCorrect: false,
            checked: true,
            locked: false,
            lastCheckedAnswer: userInput,
          };
          // Record wrong answer in Database statistics ONLY for wrong answers,
          // and prevent duplicate increments if Check is pressed again without changing input
          if (!isCorrect) {
            if (!isUnchangedAttempt) {
              await dbService.recordConjugationWrong(
                verb.infinitive,
                tense,
                p,
                userInput,
                candidates.join(" / ")
              );
            }
          }
        }

        // FIRST-check semantics: only the first check of each cell in the session counts
        if (!firstCheckMapRef.current.has(cellId)) {
          firstCheckMapRef.current.set(cellId, isCorrect);
        }

        totalChecked++;
      }
    }

    setCellResults((prev) => ({ ...prev, [verbKey]: currentResults }));
    const newSummary = {
      ...verbResultsSummary,
      [verbKey]: { correct: correctCount, wrong: wrongCount, totalChecked },
    };
    setVerbResultsSummary(newSummary);

    // Update PracticeSession record with FIRST-check semantics
    let sessionFirstCorrect = 0;
    let sessionFirstWrong = 0;
    for (const corr of firstCheckMapRef.current.values()) {
      if (corr) sessionFirstCorrect++;
      else sessionFirstWrong++;
    }

    if (currentSessionRef.current) {
      currentSessionRef.current.correctCount = sessionFirstCorrect;
      currentSessionRef.current.wrongCount = sessionFirstWrong;
      if (
        currentSessionRef.current.totalCells > 0 &&
        firstCheckMapRef.current.size >= currentSessionRef.current.totalCells
      ) {
        currentSessionRef.current.completedAt = Date.now();
      }
      await dbService.savePracticeSession({ ...currentSessionRef.current });
    }

    const toastTpl = t.practiceSummaryToast || "{correct} correct, {wrong} wrong";
    showToast(toastTpl.replace("{correct}", String(correctCount)).replace("{wrong}", String(wrongCount)));
  };

  // B6: Global check across ALL verbs in the current practice session
  const handleCheckAllAnswers = async () => {
    let globalCorrect = 0;
    let globalWrong = 0;
    let globalTotalChecked = 0;

    const nextCellResults = { ...cellResults };
    const nextVerbSummaries = { ...verbResultsSummary };

    for (const inf of practiceVerbList) {
      const verbKey = (inf || "").toLowerCase().trim();
      const verb = verbsMap.get(verbKey);
      if (!verb) continue;

      const currentVerbAnswers = userAnswers[verbKey] || {};
      const currentResults = { ...(nextCellResults[verbKey] || {}) };

      let verbCorrect = 0;
      let verbWrong = 0;
      let verbTotal = 0;

      for (const tense of orderedSelectedTenses) {
        for (const p of PERSON_KEYS) {
          const cellId = `${verbKey}|${tense}|${p}`;
          if (excludedCells.has(cellId)) continue; // locked empty cell

          const cellKey = `${tense}_${p}`;
          // If already answered correctly, keep correct and do not re-evaluate or record
          if (currentResults[cellKey]?.isCorrect) {
            verbCorrect++;
            verbTotal++;
            globalCorrect++;
            globalTotalChecked++;
            continue;
          }

          const rawCandidates = verb.conjugations?.[tense]?.[p];
          const candidates = extractCandidatesFromCell(rawCandidates);
          if (candidates.length === 0) continue;

          const userInput = (currentVerbAnswers[cellKey] || "").trim();
          const isCorrect = isAnswerCorrect(userInput, candidates);

          const prevChecked = currentResults[cellKey]?.checked;
          const prevAnswer = currentResults[cellKey]?.lastCheckedAnswer;
          const isUnchangedAttempt = prevChecked && prevAnswer === userInput;

          if (isCorrect) {
            verbCorrect++;
            globalCorrect++;
            currentResults[cellKey] = {
              isCorrect: true,
              checked: true,
              locked: true,
              lastCheckedAnswer: userInput,
            };
          } else {
            verbWrong++;
            globalWrong++;
            currentResults[cellKey] = {
              isCorrect: false,
              checked: true,
              locked: false,
              lastCheckedAnswer: userInput,
            };
            if (!isUnchangedAttempt) {
              await dbService.recordConjugationWrong(
                verb.infinitive,
                tense,
                p,
                userInput,
                candidates.join(" / ")
              );
            }
          }

          // First-check session semantics: only first check of cell in session counts
          if (!firstCheckMapRef.current.has(cellId)) {
            firstCheckMapRef.current.set(cellId, isCorrect);
          }

          verbTotal++;
          globalTotalChecked++;
        }
      }

      nextCellResults[verbKey] = currentResults;
      nextVerbSummaries[verbKey] = { correct: verbCorrect, wrong: verbWrong, totalChecked: verbTotal };
    }

    setCellResults(nextCellResults);
    setVerbResultsSummary(nextVerbSummaries);

    // Update PracticeSession record
    let sessionFirstCorrect = 0;
    let sessionFirstWrong = 0;
    for (const corr of firstCheckMapRef.current.values()) {
      if (corr) sessionFirstCorrect++;
      else sessionFirstWrong++;
    }

    if (currentSessionRef.current) {
      currentSessionRef.current.correctCount = sessionFirstCorrect;
      currentSessionRef.current.wrongCount = sessionFirstWrong;
      if (
        currentSessionRef.current.totalCells > 0 &&
        firstCheckMapRef.current.size >= currentSessionRef.current.totalCells
      ) {
        currentSessionRef.current.completedAt = Date.now();
      }
      await dbService.savePracticeSession({ ...currentSessionRef.current });
    }

    const toastTpl = t.sessionSummaryToast || "{correct} خانه درست، {wrong} خانه غلط از مجموع {total}";
    showToast(
      toastTpl
        .replace("{correct}", String(globalCorrect))
        .replace("{wrong}", String(globalWrong))
        .replace("{total}", String(globalTotalChecked))
    );
  };

  // Retry mistakes for a verb: clear wrong cells, keep correct cells locked
  const handleRetryMistakes = (verb: VerbItem) => {
    const verbKey = (verb?.infinitive || "").toLowerCase().trim();
    if (!verbKey) return;
    const currentResults = cellResults[verbKey] || {};
    const updatedAnswers = { ...(userAnswers[verbKey] || {}) };
    const updatedResults = { ...currentResults };
    const cellsToUnreveal: string[] = [];

    for (const [cellKey, res] of Object.entries(currentResults)) {
      if (!res.isCorrect) {
        updatedAnswers[cellKey] = "";
        delete updatedResults[cellKey];
        // cellKey is e.g. "PRASENS_S1" -> full tuple is `${verbKey}|${tense}|${person}`
        const parts = cellKey.split("_");
        if (parts.length >= 2) {
          const tense = parts.slice(0, -1).join("_");
          const person = parts[parts.length - 1];
          cellsToUnreveal.push(`${verbKey}|${tense}|${person}`);
        }
      }
    }

    if (cellsToUnreveal.length > 0) {
      setRevealedCells((prev) => {
        const next = new Set(prev);
        for (const k of cellsToUnreveal) {
          next.delete(k);
        }
        return next;
      });
    }

    setUserAnswers((prev) => ({ ...prev, [verbKey]: updatedAnswers }));
    setCellResults((prev) => ({ ...prev, [verbKey]: updatedResults }));
  };

  // Ordered list of selected tenses: TENSE_ORDER order, plus IMPERATIV last if selected
  const orderedSelectedTenses = useMemo(() => {
    const list: PracticeTense[] = [];
    for (const t of TENSE_ORDER) {
      if (selectedTenses.includes(t as PracticeTense)) {
        list.push(t as PracticeTense);
      }
    }
    if (selectedTenses.includes("IMPERATIV")) {
      list.push("IMPERATIV");
    }
    return list;
  }, [selectedTenses]);

  // Statistics View Grouping and Top-3 Highlighting
  const { groupedStats, topThreeIds } = useMemo(() => {
    const groups = new Map<string, ConjugationPracticeStat[]>();
    for (const s of statsData) {
      if (!s || !s.infinitive || (s.wrongCount || 0) <= 0) continue;
      const inf = (s.infinitive || "").toLowerCase().trim();
      const existing = groups.get(inf) || [];
      existing.push(s);
      groups.set(inf, existing);
    }

    // Sort verbs alphabetically
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Identify top 3 wrong cells deduplicated by (verb, tense, person) tuple across ENTIRE stats dataset
    const tupleMap = new Map<string, { id: string; tupleKey: string; wrongCount: number }>();
    for (const s of statsData) {
      if (!s || !s.infinitive || !s.tense || !s.person) continue;
      const verb = (s.infinitive || "").toLowerCase().trim();
      const tupleKey = `${verb}|${s.tense}|${s.person}`;
      const count = s.wrongCount || 0;
      if (count <= 0) continue;
      const existing = tupleMap.get(tupleKey);
      if (!existing || count > existing.wrongCount) {
        tupleMap.set(tupleKey, { id: s.id || tupleKey, tupleKey, wrongCount: count });
      }
    }

    const uniqueTuples = Array.from(tupleMap.values());
    const topThree = new Set<string>();

    if (uniqueTuples.length > 0) {
      // Check if all visible cells have the SAME wrongCount
      const counts = uniqueTuples.map((t) => t.wrongCount);
      const distinctCounts = new Set(counts);

      // Top-3 highlight: with all-equal counts → NO highlight. With distinct counts → exactly 3 cells (or fewer if <3 have >0).
      if (distinctCounts.size > 1) {
        uniqueTuples.sort((a, b) => b.wrongCount - a.wrongCount);
        const topSlice = uniqueTuples.slice(0, 3);
        for (const item of topSlice) {
          topThree.add(item.id);
          topThree.add(item.tupleKey);
        }
      }
    }

    return { groupedStats: sortedGroups, topThreeIds: topThree };
  }, [statsData]);

  // Reset stats confirmation
  const handleConfirmResetStats = async () => {
    if (!resetConfirmVerb) return;
    try {
      await dbService.resetConjugationStatsForVerb(resetConfirmVerb);
      setResetConfirmVerb(null);
      await loadStats();
      showToast(t.statsResetToast);
    } catch (e) {
      console.warn("Failed resetting stats", e);
    }
  };

  // Map of loaded verbs for quick lookup
  const verbsMap = useMemo(() => {
    const m = new Map<string, VerbItem>();
    for (const v of allVerbs) {
      if (v && v.infinitive) {
        m.set((v.infinitive || "").toLowerCase().trim(), v);
      }
    }
    return m;
  }, [allVerbs]);

  // Filtered stats for Search in Stats View (PART 4)
  const filteredGroupedStats = useMemo(() => {
    const query = debouncedStatsSearch.trim().toLowerCase();
    if (!query) return groupedStats;
    const filtered = groupedStats.filter(([infinitive]) => {
      const verbObj = verbsMap.get(infinitive);
      const infMatch = infinitive.toLowerCase().includes(query);
      const meaningMatch = verbObj?.bedeutung ? verbObj.bedeutung.toLowerCase().includes(query) : false;
      return infMatch || meaningMatch;
    });

    return sortBySearchRank(filtered, query, ([infinitive]) => {
      const verbObj = verbsMap.get(infinitive);
      return {
        primary: infinitive,
        secondary: verbObj?.bedeutung || "",
      };
    });
  }, [groupedStats, debouncedStatsSearch, verbsMap]);

  // Filtered practice sessions for History View
  const filteredSessions = useMemo(() => {
    if (historyFilterOnlyFavorites) {
      return sessions.filter((s) => s.isFavorite);
    }
    return sessions;
  }, [sessions, historyFilterOnlyFavorites]);

  return (
    <div className={`space-y-6 ${isRtl ? "text-right" : "text-left"}`}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="px-5 py-2.5 bg-amber-600 text-white rounded-2xl shadow-xl font-bold font-vazir text-xs sm:text-sm flex items-center gap-2 border border-amber-500">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Top Segmented Control: Practice Tab vs Stats Tab */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs font-vazir">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl">
            <Dumbbell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              {t.practiceConjugationTab}
            </h2>
            <p className="text-xs text-slate-500">
              {t.conjugationPracticeSubtitle}
            </p>
          </div>
        </div>

        {/* Segmented Control */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveMainTab("practice")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeMainTab === "practice"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t.practiceTabLabel}</span>
          </button>
          <button
            onClick={() => setActiveMainTab("stats")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeMainTab === "stats"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{t.statsTabLabel}</span>
          </button>
          <button
            onClick={() => setActiveMainTab("history")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeMainTab === "history"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{t.practiceHistoryTab || t.historyTabLabel || "تاریخچه تمرین‌ها"}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PRACTICE */}
      {activeMainTab === "practice" && (
        <>
          {practicePhase === "setup" ? (
            /* 4.1 SETUP PHASE */
            <div className="space-y-6 font-vazir">
              {/* Verb Selection Card */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm">
                    <Search className="w-4 h-4 text-amber-600" />
                    <span>
                      {(t.practiceListCount || "{count} / 80 verbs selected").replace("{count}", String(practiceVerbList.length))}
                    </span>
                  </div>

                  {/* Quick-add Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddAllFavorites}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                      <span>{t.favoritesQuickAdd}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddRandomTen}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t.randomTenQuickAdd}</span>
                    </button>
                    {practiceVerbList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPracticeVerbList([])}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t.clearVerbList || "پاک کردن"}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Search Input with Dropdown & Keyboard Navigation */}
                <div ref={searchContainerRef} className="relative">
                  <div className="relative">
                    <Search className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${isRtl ? "right-3.5" : "left-3.5"}`} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onKeyDown={(e) => {
                        if (!showSuggestions || suggestions.length === 0) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setSuggestionIndex((prev) => Math.max(prev - 1, -1));
                        } else if (e.key === "Enter" && suggestionIndex >= 0 && suggestions[suggestionIndex]) {
                          e.preventDefault();
                          handleAddVerb(suggestions[suggestionIndex].infinitive);
                        } else if (e.key === "Escape") {
                          setShowSuggestions(false);
                        }
                      }}
                      placeholder={t.searchVerbsPlaceholder}
                      className={`w-full py-2.5 ${isRtl ? "pr-10 pl-4" : "pl-10 pr-4"} bg-slate-50 border border-slate-200 rounded-2xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white`}
                    />
                  </div>

                  {/* Suggestions Dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full mt-1.5 inset-x-0 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {suggestions.map((item, idx) => (
                        <div
                          key={item.infinitive}
                          onClick={() => handleAddVerb(item.infinitive)}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            idx === suggestionIndex
                              ? "bg-amber-100 text-amber-950 font-bold"
                              : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold font-sans text-slate-900">{item.infinitive}</span>
                            <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-mono">
                              {item.hilfsverb || "haben"}
                            </span>
                          </div>
                          {item.bedeutung && (
                            <span className="text-xs text-slate-500 font-vazir">{item.bedeutung}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Verbs Chips */}
                {practiceVerbList.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1 max-h-48 overflow-y-auto p-1 bg-slate-50/60 rounded-2xl border border-slate-100">
                    {practiceVerbList.map((inf) => {
                      const verbObj = verbsMap.get((inf || "").toLowerCase().trim());
                      return (
                        <span
                          key={inf}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-amber-950 text-xs font-bold shadow-2xs group"
                        >
                          <span className="font-sans">{inf}</span>
                          {verbObj?.bedeutung && (
                            <span className="text-[11px] font-normal text-slate-400 font-vazir">
                              ({verbObj.bedeutung.slice(0, 15)})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveVerb(inf)}
                            className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    {t.practiceListEmpty}
                  </div>
                )}
              </div>

              {/* Tense Selection Card */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm">
                    <BookOpen className="w-4 h-4 text-amber-600" />
                    <span>
                      {t.selectTensesLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAllTenses}
                    className="text-xs font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                  >
                    {selectedTenses.length === ALL_PRACTICE_TENSES.length
                      ? t.deselectAllTenses
                      : t.selectAllTenses}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ALL_PRACTICE_TENSES.map((tense) => {
                    const isChecked = selectedTenses.includes(tense);
                    return (
                      <label
                        key={tense}
                        className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                          isChecked
                            ? "bg-amber-50/80 border-amber-300 text-amber-950 font-bold shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:border-amber-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTense(tense)}
                          className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 accent-amber-600 cursor-pointer"
                        />
                        <span className="text-xs font-sans">
                          {TENSE_LABELS[tense as Tense] || tense}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Start Practice Action */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleStartPracticePreFlight}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Dumbbell className="w-5 h-5" />
                  <span>{t.startPractice}</span>
                </button>
              </div>
            </div>
          ) : (
            /* 4.3 PRACTICE PHASE (Grid-Based UI) */
            <div className="space-y-6">
              {/* Header Bar: Stop practice & Umlaut Helper Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs font-vazir">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-700">
                    {t.quickUmlautsLabel}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {GERMAN_UMLAUTS.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault(); // prevent input blur
                          handleInsertUmlaut(ch);
                        }}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold font-sans cursor-pointer transition-colors"
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCheckAllAnswers}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0"
                  >
                    <Check className="w-4 h-4" />
                    <span>{t.checkAllAnswers || "بررسی کل تمرین"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (currentSessionRef.current) {
                        if (!currentSessionRef.current.completedAt) {
                          currentSessionRef.current.completedAt = Date.now();
                        }
                        await dbService.savePracticeSession({ ...currentSessionRef.current });
                        currentSessionRef.current = null;
                      }
                      currentSessionIdRef.current = "";
                      setPracticePhase("setup");
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-500" />
                    <span>{t.stopPractice}</span>
                  </button>
                </div>
              </div>

              {/* Stack of Verb Table Blocks */}
              <div className="space-y-8">
                {practiceVerbList.map((inf, vIdx) => {
                  const verbKey = (inf || "").toLowerCase().trim();
                  const verbObj = verbsMap.get(verbKey);
                  const summary = verbResultsSummary[verbKey];
                  const hasAnswersInVerb =
                    userAnswers[verbKey] &&
                    Object.values(userAnswers[verbKey]).some((v) => (v || "").trim().length > 0);

                  return (
                    <div
                      key={verbKey}
                      className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
                    >
                      {/* Verb Card Header */}
                      <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50/80 to-white border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full bg-amber-200/60 text-amber-900 font-mono text-xs font-bold flex items-center justify-center">
                            {vIdx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-xl font-black font-sans text-slate-950">{inf}</h3>
                              <span className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-800 font-mono font-bold">
                                {verbObj?.hilfsverb || "haben"}
                              </span>
                            </div>
                            {verbObj?.bedeutung && (
                              <p className="text-xs text-slate-500 font-vazir mt-0.5">
                                {verbObj.bedeutung}
                              </p>
                            )}
                          </div>
                        </div>

                        {summary && (
                          <div className="flex items-center gap-2 font-vazir text-xs">
                            <span className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                              {summary.correct} {t.correctCountLabel}
                            </span>
                            {summary.wrong > 0 && (
                              <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 font-bold">
                                {summary.wrong} {t.wrongCountLabel}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Interactive Grid Table */}
                      <div className="overflow-x-auto p-4 sm:p-6">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                              <th className="p-2.5 text-center min-w-[130px] font-sans">
                                {t.tenseCol || "Zeitform"}
                              </th>
                              <th className="p-2.5 text-center min-w-[110px] font-sans">{t.ichCol || "ich"}</th>
                              <th className="p-2.5 text-center min-w-[110px] font-sans">{t.duCol || "du"}</th>
                              <th className="p-2.5 text-center min-w-[110px] font-sans">{t.erCol || "er/es/sie"}</th>
                              <th className="p-2.5 text-center min-w-[110px] font-sans">{t.wirCol || "wir"}</th>
                              <th className="p-2.5 text-center min-w-[110px] font-sans">{t.ihrCol || "ihr"}</th>
                              <th className="p-2.5 text-center min-w-[110px] font-sans">{t.sieCol || "sie/Sie"}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {orderedSelectedTenses.map((tense) => (
                              <tr key={tense} className="hover:bg-slate-50/50">
                                <td className="p-2.5 font-bold font-sans text-slate-800 whitespace-nowrap bg-slate-50/30">
                                  {TENSE_LABELS[tense as Tense] || tense}
                                </td>
                                {PERSON_KEYS.map((p) => {
                                  const cellId = `${verbKey}|${tense}|${p}`;
                                  const cellKey = `${tense}_${p}`;
                                  const isLocked = excludedCells.has(cellId);
                                  const cellVal = userAnswers[verbKey]?.[cellKey] || "";
                                  const res = cellResults[verbKey]?.[cellKey];
                                  const rawCandidates = verbObj?.conjugations?.[tense]?.[p];
                                  const candidates = extractCandidatesFromCell(rawCandidates);

                                  let inputBorderClass = "border-slate-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500";
                                  let inputBgClass = "bg-white";

                                  if (res?.checked) {
                                    if (res.isCorrect) {
                                      inputBorderClass = "border-2 border-emerald-500";
                                      inputBgClass = "bg-emerald-50/30 text-emerald-950 font-bold";
                                    } else {
                                      inputBorderClass = "border-2 border-rose-500";
                                      inputBgClass = "bg-rose-50/40 text-rose-950 font-bold";
                                    }
                                  }

                                  return (
                                    <td key={p} className="p-1.5 align-top">
                                      {isLocked ? (
                                        <div
                                          title={
                                            tense === "IMPERATIV"
                                              ? (t.imperativeDisabledPersons || "No form in Imperative")
                                              : (t.emptyCellsWarning || "Empty in database")
                                          }
                                          className="w-full py-2 bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 rounded-xl text-center font-mono font-bold"
                                        >
                                          –
                                        </div>
                                      ) : (
                                        <div className="space-y-1">
                                          <input
                                            type="text"
                                            dir="ltr"
                                            value={cellVal}
                                            disabled={res?.isCorrect && res.locked}
                                            onFocus={(e) => {
                                              focusedInputRef.current = {
                                                verbKey,
                                                cellKey,
                                                inputEl: e.currentTarget,
                                              };
                                            }}
                                            onChange={(e) =>
                                              handleCellChange(verbKey, cellKey, e.target.value)
                                            }
                                            className={`w-full p-2 border rounded-xl font-sans text-xs transition-colors focus:outline-none ${inputBorderClass} ${inputBgClass} ${
                                              res?.isCorrect && res.locked ? "cursor-not-allowed opacity-90" : ""
                                            }`}
                                          />
                                          {res?.checked && !res.isCorrect && candidates.length > 0 && (
                                            <div className="text-center">
                                              {!revealedCells.has(cellId) ? (
                                                <button
                                                  type="button"
                                                  onClick={() => revealCell(cellId)}
                                                  className="mt-1 px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer font-vazir"
                                                >
                                                  {t.showCorrectAnswer || "نمایش جواب درست"}
                                                </button>
                                              ) : (
                                                <div className="mt-1 text-[11px] text-rose-700 leading-tight">
                                                  <span className="font-bold">{t.correctAnswer || "Correct"}: </span>
                                                  <span className="font-mono font-bold">{candidates.join(" / ")}</span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Verb Footer Actions */}
                      <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 font-vazir">
                        <div className="text-xs text-slate-500">
                          {summary && (
                            <span>
                              {summary.correct}/{summary.totalChecked} {t.scoreSummaryLabel}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {summary && summary.wrong > 0 && (
                            <button
                              type="button"
                              onClick={() => verbObj && handleRetryMistakes(verbObj)}
                              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{t.retryWrongAnswers}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={!hasAnswersInVerb}
                            onClick={() => verbObj && handleCheckVerbAnswers(verbObj)}
                            className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                              hasAnswersInVerb
                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            <Check className="w-4 h-4" />
                            <span>{t.checkAnswers}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: MISTAKE STATISTICS */}
      {activeMainTab === "stats" && (
        <div className="space-y-6">
          {loadingStats ? (
            <div className="p-12 text-center text-slate-400 font-vazir text-xs">
              {t.loadingStats}
            </div>
          ) : groupedStats.length === 0 ? (
            <div className="p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xs text-center space-y-3 font-vazir">
              <BarChart3 className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                {t.noStatsYet}
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {t.topWrongCellsHint}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Search in Stats View (PART 4) & Re-Practice Options */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs font-vazir">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search
                    className={`absolute ${isRtl ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`}
                  />
                  <input
                    type="text"
                    value={statsSearchQuery}
                    onChange={(e) => setStatsSearchQuery(e.target.value)}
                    placeholder={t.statsSearchPlaceholder || "جستجو در آمار افعال (مصدر یا معنی)..."}
                    className={`w-full py-2.5 ${isRtl ? "pr-10 pl-9" : "pl-10 pr-9"} bg-slate-50 border border-slate-200 focus:border-amber-500 rounded-2xl text-xs font-sans focus:outline-none transition-colors`}
                  />
                  {statsSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStatsSearchQuery("")}
                      className={`absolute ${isRtl ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Prominent Re-Practice Button in Stats Tab */}
                <button
                  type="button"
                  onClick={() => setShowRePracticeModal(true)}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-colors shadow-xs cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{t.rePracticeButton || "تمرین دوباره"}</span>
                </button>
              </div>

              {/* Empty state for search */}
              {filteredGroupedStats.length === 0 ? (
                <div className="p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xs text-center space-y-3 font-vazir">
                  <Search className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">
                    {t.statsSearchNoResults || "فعل با این عبارت یافت نشد."}
                  </p>
                </div>
              ) : (
                filteredGroupedStats.map(([infinitive, statList]) => {
                  const verbObj = verbsMap.get(infinitive);
                  const totalWrong = statList.reduce((acc, curr) => acc + curr.wrongCount, 0);

                  // Group stats by tense
                  const statsByTense = new Map<string, Record<string, ConjugationPracticeStat>>();
                  for (const s of statList) {
                    const m = statsByTense.get(s.tense) || {};
                    m[s.person] = s;
                    statsByTense.set(s.tense, m);
                  }

                  // Order tenses by TENSE_ORDER + IMPERATIV
                  const orderedTensesForStats: PracticeTense[] = [];
                  for (const t of TENSE_ORDER) {
                    if (statsByTense.has(t)) orderedTensesForStats.push(t as PracticeTense);
                  }
                  if (statsByTense.has("IMPERATIV")) orderedTensesForStats.push("IMPERATIV");

                  return (
                    <div
                      key={infinitive}
                      className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden"
                    >
                      {/* Header */}
                      <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-vazir">
                        <div className="flex items-center gap-3">
                          <h4 className="text-lg font-black font-sans text-slate-900">{infinitive}</h4>
                          <span className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-mono font-bold">
                            {verbObj?.hilfsverb || "–"}
                          </span>
                          <span className="text-xs text-slate-500 font-vazir">
                            {verbObj?.bedeutung || "–"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded-xl text-xs font-bold">
                            {t.totalWrongs || "مجموع اشتباهات"}: {totalWrong}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              launchPracticeWithVerbs([infinitive]);
                              setActiveMainTab("practice");
                            }}
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title={t.rePracticeTooltip || "Start a practice session with these verbs"}
                          >
                            <Dumbbell className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t.rePracticeBtn || "Re-Practice"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetConfirmVerb(infinitive)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                            title={t.resetStatsBtn || "بازنشانی آمار"}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Stats Table */}
                      <div className="overflow-x-auto p-4 sm:p-5">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                              <th className="p-2 text-center min-w-[130px] font-sans">{t.tenseCol || "Zeitform"}</th>
                              <th className="p-2 text-center min-w-[90px] font-sans">{t.ichCol || "ich"}</th>
                              <th className="p-2 text-center min-w-[90px] font-sans">{t.duCol || "du"}</th>
                              <th className="p-2 text-center min-w-[90px] font-sans">{t.erCol || "er/es/sie"}</th>
                              <th className="p-2 text-center min-w-[90px] font-sans">{t.wirCol || "wir"}</th>
                              <th className="p-2 text-center min-w-[90px] font-sans">{t.ihrCol || "ihr"}</th>
                              <th className="p-2 text-center min-w-[90px] font-sans">{t.sieCol || "sie/Sie"}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {orderedTensesForStats.map((tense) => {
                              const personMap = statsByTense.get(tense) || {};
                              return (
                                <tr key={tense} className="hover:bg-slate-50/50">
                                  <td className="p-2 font-bold font-sans text-slate-800 whitespace-nowrap bg-slate-50/30">
                                    {TENSE_LABELS[tense as Tense] || tense}
                                  </td>
                                  {PERSON_KEYS.map((p) => {
                                    const stat = personMap[p];
                                    const tupleKey = `${infinitive}|${tense}|${p}`;
                                    const isTopThree = (stat && topThreeIds.has(stat.id)) || topThreeIds.has(tupleKey);
                                    const count = stat ? stat.wrongCount : 0;

                                    return (
                                      <td
                                        key={p}
                                        className={`p-2 text-center font-mono text-xs ${
                                          isTopThree
                                            ? "bg-rose-200/60 font-black text-rose-950 rounded-lg"
                                            : count > 0
                                            ? "text-rose-700 font-bold"
                                            : "text-slate-300"
                                        }`}
                                      >
                                        {count > 0 ? count : "–"}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PRACTICE HISTORY */}
      {activeMainTab === "history" && (
        <div className="space-y-6 font-vazir">
          {/* History Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-800">
                {t.historyTabLabel || "Practice History"}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-mono">
                {filteredSessions.length}
              </span>
            </div>

            {/* Filter: All vs Favorites */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setHistoryFilterOnlyFavorites(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !historyFilterOnlyFavorites
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.filterAllSessions || "All Sessions"}
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilterOnlyFavorites(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  historyFilterOnlyFavorites
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                <span>{t.favoriteFilterLabel || "فقط نشان‌شده‌ها"}</span>
              </button>
            </div>
          </div>

          {loadingSessions ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              {t.loadingStats || "Loading..."}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xs text-center space-y-3">
              <History className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                {t.noSessionsYet || "هنوز هیچ تمرینی ثبت نشده است."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSessions.map((session) => {
                const dateMs = session.completedAt || session.startedAt || session.date || Date.now();
                const dateStr = new Date(dateMs).toLocaleString(
                  locale === "fa" ? "fa-IR" : locale === "de" ? "de-DE" : "en-US",
                  { dateStyle: "medium", timeStyle: "short" }
                );
                const verbs = session.verbInfinitives || session.verbList || [];
                const displayedVerbs = verbs.slice(0, 5).join("، ");
                const remainingVerbsCount = verbs.length - 5;
                const totalCells = session.totalCells || session.totalChecked || (session.correctCount + session.wrongCount);

                return (
                  <div
                    key={session.id}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 space-y-4 hover:border-amber-200 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="font-sans font-medium">{dateStr}</span>
                      </div>

                      {/* Score Summary Badges: correct, wrong, and total cells */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                          {session.correctCount} {t.sessionCorrectLabel || "پاسخ صحیح"}
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                          {session.wrongCount} {t.sessionWrongLabel || "غلط"}
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-mono">
                          {totalCells} {t.sessionTotalCells || "کل سلول‌ها"}
                        </span>
                      </div>
                    </div>

                    {/* Comma-separated verb infinitives (truncate to 5, show "…+N more" if more) */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-bold text-slate-500">{t.sessionVerbsLabel || "افعال"}:</span>
                      <span className="font-sans font-bold text-slate-800">{displayedVerbs || "–"}</span>
                      {remainingVerbsCount > 0 && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-sans font-medium">
                          …+{remainingVerbsCount}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={async () => {
                          await dbService.togglePracticeSessionFavorite(session.id);
                          await loadSessions();
                        }}
                        className={`p-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                          session.isFavorite
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                        }`}
                        title={session.isFavorite ? (t.sessionUnfavorite || "حذف نشان") : (t.sessionFavorite || "نشان کردن")}
                      >
                        <Heart className={`w-4 h-4 ${session.isFavorite ? "fill-rose-500 text-rose-500" : "text-slate-400"}`} />
                        <span>{session.isFavorite ? (t.sessionUnfavorite || "نشان‌شده") : (t.sessionFavorite || "نشان کردن")}</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSessionToDelete(session)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title={t.deleteSessionBtn || "Delete Session"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            launchPracticeWithVerbs(
                              session.verbInfinitives || session.verbList || [],
                              session.tenses || session.selectedTenses
                            );
                            setActiveMainTab("practice");
                          }}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{t.sessionRePractice || t.rePracticeButton || "تمرین دوباره"}</span>
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

      {/* 4.2 PRE-FLIGHT MODAL (Custom modal - NOT native confirm) */}
      {showPreFlightModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-vazir">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 border-b border-slate-100 pb-3">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-extrabold text-slate-900">
                {t.preFlightTitle || "برخی صرف‌ها کامل نیستند"}
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {t.preFlightDescription ||
                "صرف‌های این افعال تکمیل نیست. می‌توانید آن‌ها را از تمرین حذف کنید یا با همه ادامه دهید. خانه‌های خالی قفل خواهند شد و در نمره‌دهی و آمار لحاظ نمی‌شوند."}
            </p>

            {/* List of Affected Verbs with Checkbox */}
            <div className="max-h-52 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-2xl border border-slate-100">
              {incompleteVerbsList.map(({ verb, tenses }) => {
                const isChecked = preFlightRemoveSet.has(verb.infinitive);
                return (
                  <label
                    key={verb.infinitive}
                    className="flex items-start gap-3 p-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setPreFlightRemoveSet((prev) => {
                          const n = new Set(prev);
                          if (n.has(verb.infinitive)) n.delete(verb.infinitive);
                          else n.add(verb.infinitive);
                          return n;
                        });
                      }}
                      className="mt-0.5 w-4 h-4 text-amber-600 rounded focus:ring-amber-500 accent-amber-600"
                    />
                    <div className="flex-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-sans text-slate-900">{verb.infinitive}</span>
                        {verb.bedeutung && (
                          <span className="text-slate-400 font-vazir">({verb.bedeutung})</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                        <span className="font-bold text-amber-900 font-vazir">
                          {t.incompleteTensesLabel}{" "}
                        </span>
                        {tenses.map((tKey) => TENSE_LABELS[tKey as Tense] || tKey).join(", ")}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Decision Buttons ONLY (no backdrop dismiss) */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handlePreFlightContinueWithAll}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t.preFlightContinueWithAll || "ادامه با همه"}
              </button>
              <button
                type="button"
                onClick={handlePreFlightRemoveAndContinue}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t.preFlightRemoveAndContinue || "حذف موارد انتخابی و شروع"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Stats Confirmation Modal */}
      {resetConfirmVerb && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-vazir">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2.5 text-rose-600">
              <RotateCcw className="w-5 h-5" />
              <h3 className="text-sm font-extrabold text-slate-900">
                {t.resetStatsBtn || "بازنشانی آمار"}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t.resetStatsConfirm ||
                "آیا از حذف آمار اشتباهات این فعل اطمینان دارید؟"}
              {" ("}
              <span className="font-bold font-sans text-slate-900">{resetConfirmVerb}</span>
              {")"}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResetConfirmVerb(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t.cancelBtn || "انصراف"}
              </button>
              <button
                type="button"
                onClick={handleConfirmResetStats}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t.resetStatsBtn || "بازنشانی"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Practice Session Confirmation Modal */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-vazir">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2.5 text-rose-600">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-sm font-extrabold text-slate-900">
                {t.deleteSessionBtn || "حذف جلسه تمرین"}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t.deleteSessionConfirm || "آیا از حذف این جلسه تمرین اطمینان دارید؟"}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t.cancelBtn || "انصراف"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (sessionToDelete) {
                    await dbService.deletePracticeSession(sessionToDelete.id);
                    setSessionToDelete(null);
                    await loadSessions();
                    showToast(t.sessionDeleted || t.sessionDeletedToast || "Practice session deleted.");
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t.deleteSessionBtn || "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-Practice Modal in Stats View */}
      {showRePracticeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-vazir">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-amber-600">
                <RotateCcw className="w-5 h-5" />
                <h3 className="text-sm font-extrabold text-slate-900">
                  {t.rePracticeModalTitle || "انتخاب نوع تمرین دوباره"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRePracticeModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowRePracticeModal(false);
                  const verbsWithMistakes = groupedStats.map(([inf]) => inf);
                  if (verbsWithMistakes.length > 0) {
                    launchPracticeWithVerbs(verbsWithMistakes);
                    setActiveMainTab("practice");
                  } else {
                    showToast(t.statsSearchNoResults);
                  }
                }}
                className="w-full p-3.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Dumbbell className="w-4 h-4" />
                <span>{t.rePracticeWrongOnly || "تمرین صرف‌های غلط"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowRePracticeModal(false);
                  const allInf = allVerbs.slice(0, 80).map((v) => v.infinitive);
                  if (allInf.length > 0) {
                    launchPracticeWithVerbs(allInf);
                    setActiveMainTab("practice");
                  }
                }}
                className="w-full p-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>{t.rePracticeAll || "تمرین کل صرف‌ها"}</span>
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRePracticeModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t.cancelBtn || "انصراف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
