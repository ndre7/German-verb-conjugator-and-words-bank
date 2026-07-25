export enum Tense {
  PRASENS = "PRASENS",
  PERFEKT = "PERFEKT",
  PRATERITUM = "PRATERITUM",
  KONJUNKTIV2_PRATERITUM = "KONJUNKTIV2_PRATERITUM",
  FUTUR1 = "FUTUR1",
  PLUSQUAMPERFEKT = "PLUSQUAMPERFEKT",
  KONJUNKTIV1_PRASENS = "KONJUNKTIV1_PRASENS",
  FUTUR2 = "FUTUR2",
  IMPERATIV = "IMPERATIV"
}

export const TENSE_LABELS: Record<Tense, string> = {
  [Tense.PRASENS]: "Präsens",
  [Tense.PERFEKT]: "Perfekt",
  [Tense.PRATERITUM]: "Präteritum",
  [Tense.KONJUNKTIV2_PRATERITUM]: "Konjunktiv II (Präteritum)",
  [Tense.FUTUR1]: "Futur I",
  [Tense.PLUSQUAMPERFEKT]: "Plusquamperfekt (indikativ)",
  [Tense.KONJUNKTIV1_PRASENS]: "Konjunktiv I (Präsens)",
  [Tense.FUTUR2]: "Futur II",
  [Tense.IMPERATIV]: "Imperativ"
};

export const TENSE_ORDER: Tense[] = [
  Tense.PRASENS,
  Tense.PERFEKT,
  Tense.PRATERITUM,
  Tense.KONJUNKTIV2_PRATERITUM,
  Tense.FUTUR1,
  Tense.PLUSQUAMPERFEKT,
  Tense.KONJUNKTIV1_PRASENS,
  Tense.FUTUR2
];

export interface ConjugationPerson {
  S1: string[]; // ich
  S2: string[]; // du
  S3: string[]; // er/es/sie
  P1: string[]; // wir
  P2: string[]; // ihr
  P3: string[]; // sie/Sie
}

export type TenseConjugations = Record<string, ConjugationPerson>;

export interface VerbBaseJson {
  success: boolean;
  data: TenseConjugations;
}

export interface VerbItem {
  infinitive: string;
  hilfsverb: "haben" | "sein" | string;
  bedeutung: string;
  categories: string[];
  conjugations: TenseConjugations;
  sortOrder?: number;
  cellOverrides?: Record<string, string>;
}

export interface UserOverride {
  infinitive: string; // Primary key
  bedeutung?: string;
  hilfsverb?: string;
  categories?: string[]; // Overridden categories
  // Maps "TENSE_PERSON" (e.g., "PRASENS_S1") to string representation
  cellOverrides?: Record<string, string>;
  sortOrder?: number; // Custom sort index
  isDeleted?: boolean; // Support soft delete to completely hide default or custom verbs
}

export interface Category {
  id: string; // Primary key or slug
  name: string;
  color?: string;
}

export interface AppChangeLog {
  id: string;
  timestamp: number;
  verb: string;
  type: "cell_edit" | "field_edit" | "category_toggle" | "verb_delete" | "verb_add";
  descFa: string;
  descEn: string;
  descDe: string;
  previousOverride: UserOverride | null;
}

export interface VocabChangeLog {
  id: string;
  timestamp: number;
  word: string;
  type: "vocab_add" | "vocab_delete" | "vocab_edit";
  descFa: string;
  descEn: string;
  descDe: string;
  previousItem: VocabularyItem | null;
}

export type ArticleType = "der" | "die" | "das" | "none";

export type PartOfSpeech =
  | "noun"        // اسم
  | "verb_phrase" // عبارت فعلی
  | "adjective"   // صفت
  | "adverb"      // قید
  | "preposition" // حرف اضافه
  | "pronoun"     // ضمیر
  | "conjunction" // حرف ربط
  | "expression"; // اصطلاح / عبارت

export interface VocabularyItem {
  id: string;
  article: ArticleType;
  word: string;
  meaning: string;
  plural?: string;
  partOfSpeech: PartOfSpeech;
  example?: string;
  notes?: string;
  tags?: string[];
  synonyms?: string[];
  antonyms?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface VocabularyCategory {
  id: string;
  name: string;
  color?: string;
}

export type SynonymAntonymType = "synonym" | "antonym" | "word_family" | "semantic_field" | "idiom";

export interface SynonymAntonymGroup {
  id: string;
  title: string;
  type: SynonymAntonymType;
  items: {
    word: string;
    article?: ArticleType;
    meaning?: string;
    partOfSpeech?: PartOfSpeech;
  }[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

