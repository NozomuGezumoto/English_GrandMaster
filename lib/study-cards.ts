/**
 * 英文単語帳（ローカル保存）
 * AsyncStorage にデッキ・カードを保存。ログイン不要。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  StudyCard,
  StudyDeck,
  StudyCardStatus,
  StudyCardExpressionType,
} from '../types/study-card';

const STORAGE_KEY_DECKS = '@studyDecks';
const STORAGE_KEY_CARDS_PREFIX = '@studyCards_';
const MAX_TEXT_LENGTH = 2000;
const DEFAULT_DECK_NAME = 'Default';

function trimText(s: string): string {
  return s.trim().slice(0, MAX_TEXT_LENGTH);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// --- 内部ストレージ ---

async function loadDecks(): Promise<StudyDeck[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_DECKS);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveDecks(decks: StudyDeck[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_DECKS, JSON.stringify(decks));
}

async function loadCards(deckId: string): Promise<StudyCard[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_CARDS_PREFIX + deckId);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveCards(deckId: string, cards: StudyCard[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_CARDS_PREFIX + deckId, JSON.stringify(cards));
}

// --- Deck CRUD ---

export async function getStudyDecks(): Promise<StudyDeck[]> {
  let decks = await loadDecks();
  if (decks.length === 0) {
    const defaultDeck: StudyDeck = {
      id: generateId(),
      userId: '',
      name: DEFAULT_DECK_NAME,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveDecks([defaultDeck]);
    return [defaultDeck];
  }
  // Migrate old Japanese deck name to English
  let needsSave = false;
  decks = decks.map((d) => {
    if (d.name === 'デフォルト') {
      needsSave = true;
      return { ...d, name: DEFAULT_DECK_NAME };
    }
    return d;
  });
  if (needsSave) await saveDecks(decks);
  return decks.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createStudyDeck(name: string): Promise<StudyDeck> {
  const trimmedName = trimText(name) || DEFAULT_DECK_NAME;
  const deck: StudyDeck = {
    id: generateId(),
    userId: '',
    name: trimmedName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const decks = await loadDecks();
  decks.push(deck);
  await saveDecks(decks);
  return deck;
}

export async function updateStudyDeck(
  deckId: string,
  updates: { name?: string }
): Promise<void> {
  const decks = await loadDecks();
  const idx = decks.findIndex((d) => d.id === deckId);
  if (idx < 0) return;
  if (updates.name !== undefined) {
    decks[idx].name = trimText(updates.name) || DEFAULT_DECK_NAME;
  }
  decks[idx].updatedAt = Date.now();
  await saveDecks(decks);
}

export async function deleteStudyDeck(deckId: string): Promise<void> {
  const decks = await loadDecks();
  const filtered = decks.filter((d) => d.id !== deckId);
  if (filtered.length === decks.length) return; // not found
  await saveDecks(filtered);
  await AsyncStorage.removeItem(STORAGE_KEY_CARDS_PREFIX + deckId);
  await AsyncStorage.removeItem(STORAGE_KEY_REVIEW_ORDER_PREFIX + deckId);
}

// --- Card CRUD ---

export interface CreateStudyCardInput {
  deckId: string;
  englishText: string;
  japaneseNote?: string;
  expressionType?: StudyCardExpressionType | null;
}

export async function createStudyCard(input: CreateStudyCardInput): Promise<StudyCard> {
  const englishText = trimText(input.englishText);
  if (!englishText) throw new Error('Enter English text');

  const now = Date.now();
  const card: StudyCard = {
    id: generateId(),
    userId: '',
    deckId: input.deckId,
    englishText,
    japaneseNote: trimText(input.japaneseNote ?? ''),
    expressionType: input.expressionType ?? null,
    status: 'learning',
    autoPlayAudio: true,
    createdAt: now,
    updatedAt: now,
    lastReviewedAt: null,
    reviewCount: 0,
    masteredCount: 0,
  };

  const cards = await loadCards(input.deckId);
  cards.unshift(card);
  await saveCards(input.deckId, cards);
  return card;
}

/** 一括登録用 */
export interface BulkCreateItem {
  englishText: string;
  japaneseNote?: string;
  expressionType?: StudyCardExpressionType | null;
}

export async function createStudyCardsBulk(
  deckId: string,
  items: BulkCreateItem[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const cards = await loadCards(deckId);

  for (const item of items) {
    const englishText = trimText(item.englishText);
    if (!englishText) {
      skipped++;
      continue;
    }
    const card: StudyCard = {
      id: generateId(),
      userId: '',
      deckId,
      englishText,
      japaneseNote: trimText(item.japaneseNote ?? ''),
      expressionType: item.expressionType ?? null,
      status: 'learning',
      autoPlayAudio: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastReviewedAt: null,
      reviewCount: 0,
      masteredCount: 0,
    };
    cards.unshift(card);
    created++;
  }

  await saveCards(deckId, cards);
  return { created, skipped };
}

export async function getStudyCard(
  deckId: string,
  cardId: string
): Promise<StudyCard | null> {
  const cards = await loadCards(deckId);
  return cards.find((c) => c.id === cardId) ?? null;
}

export async function getStudyCards(
  deckId: string,
  options?: {
    status?: StudyCardStatus;
    statuses?: StudyCardStatus[];
    orderByCreated?: 'asc' | 'desc';
    limitCount?: number;
  }
): Promise<StudyCard[]> {
  let cards = await loadCards(deckId);
  const order = options?.orderByCreated === 'asc' ? 1 : -1;
  cards = [...cards].sort((a, b) => (a.createdAt - b.createdAt) * order);
  if (options?.status) {
    cards = cards.filter((c) => c.status === options.status);
  } else if (options?.statuses && options.statuses?.length) {
    cards = cards.filter((c) => options.statuses!.includes(c.status));
  }
  const limit = options?.limitCount ?? 1000;
  return cards.slice(0, limit);
}

export async function updateStudyCard(
  deckId: string,
  cardId: string,
  updates: Partial<{
    englishText: string;
    japaneseNote: string;
    expressionType: StudyCardExpressionType | null;
    status: StudyCardStatus;
    autoPlayAudio: boolean;
    lastReviewedAt: number | null;
    reviewCount: number;
    masteredCount: number;
  }>
): Promise<void> {
  const cards = await loadCards(deckId);
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return;

  if (updates.englishText !== undefined) {
    const t = trimText(updates.englishText);
    if (!t) throw new Error('Enter English text');
    cards[idx].englishText = t;
  }
  if (updates.japaneseNote !== undefined) cards[idx].japaneseNote = trimText(updates.japaneseNote);
  if (updates.expressionType !== undefined) cards[idx].expressionType = updates.expressionType;
  if (updates.status !== undefined) cards[idx].status = updates.status;
  if (updates.autoPlayAudio !== undefined) cards[idx].autoPlayAudio = updates.autoPlayAudio;
  if (updates.lastReviewedAt !== undefined) cards[idx].lastReviewedAt = updates.lastReviewedAt;
  if (updates.reviewCount !== undefined) cards[idx].reviewCount = updates.reviewCount;
  if (updates.masteredCount !== undefined) cards[idx].masteredCount = updates.masteredCount;

  cards[idx].updatedAt = Date.now();
  await saveCards(deckId, cards);
}

export async function deleteStudyCard(deckId: string, cardId: string): Promise<void> {
  const cards = await loadCards(deckId);
  const filtered = cards.filter((c) => c.id !== cardId);
  if (filtered.length === cards.length) return; // not found
  await saveCards(deckId, filtered);
}

/** リストから復習開始時に、リストの表示順を復習に渡すための一時保存 */
const STORAGE_KEY_REVIEW_ORDER_PREFIX = '@studyCards_reviewOrder_';

export async function setReviewOrder(deckId: string, cardIds: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_REVIEW_ORDER_PREFIX + deckId, JSON.stringify(cardIds));
}

export async function getReviewOrder(deckId: string): Promise<string[] | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_REVIEW_ORDER_PREFIX + deckId);
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export async function clearReviewOrder(deckId: string): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_REVIEW_ORDER_PREFIX + deckId);
}

export async function updateStudyCardAfterReview(
  deckId: string,
  cardId: string,
  newStatus: StudyCardStatus
): Promise<void> {
  const card = await getStudyCard(deckId, cardId);
  if (!card) return;

  await updateStudyCard(deckId, cardId, {
    status: newStatus,
    lastReviewedAt: Date.now(),
    reviewCount: card.reviewCount + 1,
    masteredCount: newStatus === 'mastered' ? card.masteredCount + 1 : card.masteredCount,
  });
}

/** 全デッキから指定品詞のカードを取得（デッキ横断） */
export async function getStudyCardsByExpressionType(
  expressionType: StudyCardExpressionType,
  options?: {
    status?: StudyCardStatus;
    statuses?: StudyCardStatus[];
    orderByCreated?: 'asc' | 'desc';
    limitCount?: number;
  }
): Promise<StudyCard[]> {
  const decks = await loadDecks();
  const allCards: StudyCard[] = [];
  for (const deck of decks) {
    const deckCards = await loadCards(deck.id);
    allCards.push(...deckCards.map((c) => ({ ...c, deckId: deck.id })));
  }
  let filtered = allCards.filter((c) => (c.expressionType ?? 'other') === expressionType);
  if (options?.status) {
    filtered = filtered.filter((c) => c.status === options.status);
  } else if (options?.statuses?.length) {
    filtered = filtered.filter((c) => options.statuses!.includes(c.status));
  }
  const order = options?.orderByCreated === 'asc' ? 1 : -1;
  filtered.sort((a, b) => (a.createdAt - b.createdAt) * order);
  const limit = options?.limitCount ?? 1000;
  return filtered.slice(0, limit);
}

/** 品詞ごとの復習中枚数を取得（コース選択用） */
export async function getStudyCardCountsByExpressionType(): Promise<
  { expressionType: StudyCardExpressionType; learning: number; total: number }[]
> {
  const decks = await loadDecks();
  const typeCounts = new Map<StudyCardExpressionType, { learning: number; total: number }>();
  const types: StudyCardExpressionType[] = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'idiom', 'grammar', 'sentence', 'other'];

  for (const t of types) {
    typeCounts.set(t, { learning: 0, total: 0 });
  }

  for (const deck of decks) {
    const deckCards = await loadCards(deck.id);
    for (const c of deckCards) {
      const type = c.expressionType ?? 'other';
      const prev = typeCounts.get(type) ?? { learning: 0, total: 0 };
      typeCounts.set(type, {
        learning: prev.learning + (c.status === 'learning' ? 1 : 0),
        total: prev.total + 1,
      });
    }
  }

  return types
    .map((t) => ({ expressionType: t, ...(typeCounts.get(t) ?? { learning: 0, total: 0 }) }))
    .filter((x) => x.total > 0 || x.learning > 0);
}

export async function getStudyCardCounts(
  deckId?: string
): Promise<{
  total: number;
  learning: number;
  mastered: number;
  archived: number;
  byDeck?: { deckId: string; deckName: string; total: number; learning: number }[];
}> {
  if (deckId) {
    const all = await getStudyCards(deckId, { limitCount: 1000 });
    return {
      total: all.length,
      learning: all.filter((c) => c.status === 'learning').length,
      mastered: all.filter((c) => c.status === 'mastered').length,
      archived: all.filter((c) => c.status === 'archived').length,
    };
  }

  const decks = await getStudyDecks();
  const byDeck: { deckId: string; deckName: string; total: number; learning: number }[] = [];
  let total = 0;
  let learning = 0;
  let mastered = 0;
  let archived = 0;

  for (const deck of decks) {
    const cards = await getStudyCards(deck.id, { limitCount: 1000 });
    const dLearning = cards.filter((c) => c.status === 'learning').length;
    byDeck.push({
      deckId: deck.id,
      deckName: deck.name,
      total: cards.length,
      learning: dLearning,
    });
    total += cards.length;
    learning += dLearning;
    mastered += cards.filter((c) => c.status === 'mastered').length;
    archived += cards.filter((c) => c.status === 'archived').length;
  }

  return { total, learning, mastered, archived, byDeck };
}

/** 品詞デモ用テストデッキを作成（Review by part of speech の表示確認用） */
const PARTS_OF_SPEECH_SAMPLES: { englishText: string; japaneseNote: string; expressionType: StudyCardExpressionType }[] = [
  { englishText: 'accuracy', japaneseNote: '正確さ', expressionType: 'noun' },
  { englishText: 'confidence', japaneseNote: '自信', expressionType: 'noun' },
  { englishText: 'database', japaneseNote: 'データベース', expressionType: 'noun' },
  { englishText: 'accelerate', japaneseNote: '加速する', expressionType: 'verb' },
  { englishText: 'achieve', japaneseNote: '達成する', expressionType: 'verb' },
  { englishText: 'allocate', japaneseNote: '割り当てる', expressionType: 'verb' },
  { englishText: 'accurate', japaneseNote: '正確な', expressionType: 'adjective' },
  { englishText: 'adequate', japaneseNote: '適切な', expressionType: 'adjective' },
  { englishText: 'available', japaneseNote: '利用可能な', expressionType: 'adjective' },
  { englishText: 'accurately', japaneseNote: '正確に', expressionType: 'adverb' },
  { englishText: 'actually', japaneseNote: '実際に', expressionType: 'adverb' },
  { englishText: 'already', japaneseNote: 'すでに', expressionType: 'adverb' },
  { englishText: 'as a matter of fact', japaneseNote: '実際のところ', expressionType: 'phrase' },
  { englishText: 'at the same time', japaneseNote: '同時に', expressionType: 'phrase' },
  { englishText: 'in charge of', japaneseNote: '〜を担当して', expressionType: 'phrase' },
  { englishText: 'break the ice', japaneseNote: '場を和ませる', expressionType: 'idiom' },
  { englishText: 'hit the books', japaneseNote: '勉強する', expressionType: 'idiom' },
  { englishText: 'piece of cake', japaneseNote: '簡単なこと', expressionType: 'idiom' },
  { englishText: 'would rather', japaneseNote: '〜したい（比較）', expressionType: 'grammar' },
  { englishText: 'used to', japaneseNote: '以前は〜だった', expressionType: 'grammar' },
  { englishText: 'Could you repeat that?', japaneseNote: 'もう一度言ってくれますか', expressionType: 'sentence' },
  { englishText: "I'd be happy to help.", japaneseNote: '喜んでお手伝いします', expressionType: 'sentence' },
  { englishText: 'etc.', japaneseNote: 'など', expressionType: 'other' },
  { englishText: 'e.g.', japaneseNote: '例えば', expressionType: 'other' },
];

export async function seedPartsOfSpeechDemoDeck(): Promise<void> {
  const deck = await createStudyDeck('Parts of Speech Demo');
  const items = PARTS_OF_SPEECH_SAMPLES.map(({ englishText, japaneseNote, expressionType }) => ({
    englishText,
    japaneseNote,
    expressionType,
  }));
  await createStudyCardsBulk(deck.id, items);
}
