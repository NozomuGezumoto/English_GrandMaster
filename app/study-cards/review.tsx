/**
 * 復習モード選択 + 復習画面
 * モード選択後、カード表面→裏面→状態更新の流れ
 */

import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { getStudyCards, getStudyCardsByExpressionType, updateStudyCardAfterReview, getReviewOrder, clearReviewOrder } from '../../lib/study-cards';
import { recordStudyReview } from '../../lib/study-reviews-today';
import { addStudyTimeToday } from '../../lib/study-time-today';
import { ensureAudioModeForSpeech } from '../../lib/audio-mode';
import * as Speech from 'expo-speech';
import type { StudyCard, StudyCardReviewDirection, StudyCardStatus } from '../../types/study-card';
import { STATUS_LABELS } from '../../types/study-card';
import { COLORS } from '../../lib/theme';

const DIRECTION_LABELS: Record<StudyCardReviewDirection, string> = {
  en_to_ja: 'See English, recall meaning',
  ja_to_en: 'See note, recall English',
};

export default function StudyCardsReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { deckId, expressionType, fromList } = useLocalSearchParams<{ deckId?: string; expressionType?: string; fromList?: string }>();
  const [step, setStep] = useState<'statusSelect' | 'select' | 'review'>('statusSelect');
  const [direction, setDirection] = useState<StudyCardReviewDirection | null>(null);
  const [allCards, setAllCards] = useState<StudyCard[]>([]);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const lastPlayedIdRef = useRef<string | null>(null);
  const cardShownAtRef = useRef<number>(0);

  useEffect(() => {
    if (!deckId && !expressionType) {
      router.replace('/study-cards');
      return;
    }
    setLoading(true);
    const load = expressionType
      ? getStudyCardsByExpressionType(expressionType as import('../../types/study-card').StudyCardExpressionType, {
          statuses: ['learning', 'mastered', 'archived'],
          orderByCreated: 'desc',
          limitCount: 500,
        })
      : deckId
        ? getStudyCards(deckId, { statuses: ['learning', 'mastered', 'archived'], orderByCreated: 'desc', limitCount: 500 })
        : Promise.resolve([]);
    load
      .then(async (list) => {
        if (deckId && fromList === '1') {
          const orderIds = await getReviewOrder(deckId);
          await clearReviewOrder(deckId);
          if (orderIds?.length) {
            const byId = new Map(list.map((c) => [c.id, c]));
            const ordered = orderIds.map((id) => byId.get(id)).filter(Boolean) as StudyCard[];
            if (ordered.length > 0) {
              setAllCards(ordered);
              setCards(ordered);
              setStep('select');
              setLoading(false);
              return;
            }
          }
        }
        setAllCards(list);
        setLoading(false);
      })
      .catch(() => {
        setAllCards([]);
        setLoading(false);
      });
  }, [deckId, expressionType, fromList]);

  const reviewCardId = step === 'review' && cards[currentIndex] ? cards[currentIndex].id : null;
  useEffect(() => {
    if (reviewCardId) {
      cardShownAtRef.current = Date.now();
    }
  }, [reviewCardId]);

  const countByStatus = (s: StudyCardStatus) => allCards.filter((c) => c.status === s).length;

  const handleSelectStatus = (filter: StudyCardStatus | 'all') => {
    const filtered =
      filter === 'all' ? allCards : allCards.filter((c) => c.status === filter);
    setCards(filtered);
    setStep('select');
    setDirection(null);
  };

  const handleSelectDirection = (dir: StudyCardReviewDirection) => {
    setDirection(dir);
    setStep('review');
    setCurrentIndex(0);
    setShowBack(false);
  };

  const handleBackFromDirection = () => {
    if (fromList === '1') {
      router.back();
    } else {
      setStep('statusSelect');
      setDirection(null);
    }
  };

  if (step === 'statusSelect') {
    const learningCount = countByStatus('learning');
    const masteredCount = countByStatus('mastered');
    const archivedCount = countByStatus('archived');
    const totalCount = allCards.length;

    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Review</Text>
        <Text style={styles.subtitle}>Choose which cards to review</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.gold} style={styles.loader} />
        ) : totalCount === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No cards</Text>
            <Text style={styles.emptySub}>Add cards to get started</Text>
          </View>
        ) : (
          <View style={styles.directionRow}>
            <TouchableOpacity
              style={[styles.directionCard, learningCount === 0 && styles.directionCardDisabled]}
              onPress={() => learningCount > 0 && handleSelectStatus('learning')}
              disabled={learningCount === 0}
            >
              <Text style={styles.directionCardText}>{STATUS_LABELS.learning} ({learningCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.directionCard, masteredCount === 0 && styles.directionCardDisabled]}
              onPress={() => masteredCount > 0 && handleSelectStatus('mastered')}
              disabled={masteredCount === 0}
            >
              <Text style={styles.directionCardText}>{STATUS_LABELS.mastered} ({masteredCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.directionCard, archivedCount === 0 && styles.directionCardDisabled]}
              onPress={() => archivedCount > 0 && handleSelectStatus('archived')}
              disabled={archivedCount === 0}
            >
              <Text style={styles.directionCardText}>{STATUS_LABELS.archived} ({archivedCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.directionCard} onPress={() => handleSelectStatus('all')}>
              <Text style={styles.directionCardText}>All ({totalCount})</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (step === 'select') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackFromDirection}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Review</Text>
        <Text style={styles.subtitle}>Choose direction</Text>

        {cards.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No cards in this selection</Text>
          </View>
        ) : (
          <View style={styles.directionRow}>
            <TouchableOpacity style={styles.directionCard} onPress={() => handleSelectDirection('en_to_ja')}>
              <Text style={styles.directionCardText}>{DIRECTION_LABELS.en_to_ja}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.directionCard} onPress={() => handleSelectDirection('ja_to_en')}>
              <Text style={styles.directionCardText}>{DIRECTION_LABELS.ja_to_en}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  const card = cards[currentIndex];

  // 全て復習完了（最後のカードの状態更新後に表示）
  if (currentIndex >= cards.length && cards.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Done</Text>
        <Text style={styles.subtitle}>Reviewed {cards.length} cards</Text>
        <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
          <Text style={styles.doneButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const recordCardTime = () => {
    const elapsedSec = Math.floor((Date.now() - cardShownAtRef.current) / 1000);
    if (elapsedSec > 0) {
      addStudyTimeToday('flashcards', elapsedSec);
    }
  };

  return (
    <StudyReviewCard
      card={card}
      direction={direction!}
      showBack={showBack}
      currentIndex={currentIndex}
      totalCount={cards.length}
      lastPlayedIdRef={lastPlayedIdRef}
      onFlip={() => setShowBack(true)}
      onFlipBack={() => setShowBack(false)}
      onStatus={(status) => {
        const dId = deckId ?? card.deckId;
        if (!dId) return;
        recordStudyReview(card.englishText);
        recordCardTime();
        updateStudyCardAfterReview(dId, card.id, status).then(() => {
          setShowBack(false);
          setCurrentIndex((i) => i + 1);
        });
      }}
      onBack={() => router.back()}
      onNext={() => {
        recordStudyReview(card.englishText);
        recordCardTime();
        setShowBack(false);
        setCurrentIndex((i) => i + 1);
      }}
    />
  );
}

function StudyReviewCard({
  card,
  direction,
  showBack,
  currentIndex,
  totalCount,
  lastPlayedIdRef,
  onFlip,
  onFlipBack,
  onStatus,
  onBack,
  onNext,
}: {
  card: StudyCard;
  direction: StudyCardReviewDirection;
  showBack: boolean;
  currentIndex: number;
  totalCount: number;
  lastPlayedIdRef: React.MutableRefObject<string | null>;
  onFlip: () => void;
  onFlipBack: () => void;
  onStatus: (s: StudyCardStatus) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isEnToJa = direction === 'en_to_ja';

  // en_to_ja: 表面=英文→自動再生。裏面=日本語メモ
  // ja_to_en: 表面=日本語メモ。裏面=英文→裏返したら自動再生
  const englishIsShown = isEnToJa ? !showBack : showBack;
  useEffect(() => {
    if (englishIsShown && card.autoPlayAudio) {
      if (lastPlayedIdRef.current === card.id) return;
      lastPlayedIdRef.current = card.id;
      ensureAudioModeForSpeech().then(() => {
        Speech.speak(card.englishText, {
          language: 'en-US',
          onDone: () => {},
          onError: () => {},
        });
      });
    }
    if (!englishIsShown) lastPlayedIdRef.current = null;
  }, [card.id, card.englishText, englishIsShown, card.autoPlayAudio]);

  const frontText = isEnToJa ? card.englishText : card.japaneseNote || '(No note)';
  const backText = isEnToJa ? card.japaneseNote || '(No note)' : card.englishText;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <Text style={styles.progress}>{currentIndex + 1} / {totalCount}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <TouchableOpacity
        style={styles.cardArea}
        onPress={() => (showBack ? onFlipBack() : onFlip())}
        activeOpacity={0.8}
      >
        <Text style={styles.cardText}>{showBack ? backText : frontText}</Text>
        <Text style={styles.tapHint}>
          {showBack
            ? (isEnToJa ? 'Tap to show English' : 'Tap to show question')
            : 'Tap to show answer'}
        </Text>
      </TouchableOpacity>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={onBack}>
          <Text style={styles.navButtonText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navButton, styles.navButtonNext, currentIndex >= totalCount - 1 && styles.navButtonLast]}
          onPress={onNext}
        >
          <Text style={styles.navButtonText}>
            {currentIndex >= totalCount - 1 ? 'Done →' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>

      {showBack && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => onStatus('learning')}>
            <Text style={styles.actionText}>Still learning</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionMastered]}
            onPress={() => onStatus('mastered')}
          >
            <Text style={[styles.actionText, styles.actionTextGold]}>Got it</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionArchived]}
            onPress={() => onStatus('archived')}
          >
            <Text style={styles.actionText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {showBack && (
        <TouchableOpacity
          style={styles.playButton}
          onPress={() => {
            ensureAudioModeForSpeech().then(() => {
              Speech.speak(card.englishText, { language: 'en-US' });
            });
          }}
        >
          <Text style={styles.playButtonText}>🔊 Play</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginBottom: 16,
  },
  backText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.gold,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 24,
  },
  loader: {
    marginTop: 40,
  },
  empty: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.muted,
  },
  emptySub: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 8,
  },
  directionRow: {
    gap: 16,
  },
  directionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  directionCardDisabled: {
    opacity: 0.5,
  },
  directionCardText: {
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
  },
  doneButton: {
    marginTop: 32,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  doneButtonText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerSpacer: {
    flex: 1,
    minWidth: 60,
  },
  progress: {
    fontSize: 14,
    color: COLORS.muted,
  },
  disabledText: {
    color: COLORS.muted,
    opacity: 0.5,
  },
  navRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  navButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navButtonNext: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.primary,
  },
  navButtonLast: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.primary,
  },
  navButtonDisabled: {
    opacity: 0.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  navButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.gold,
  },
  cardArea: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 28,
    minHeight: 180,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardText: {
    fontSize: 20,
    lineHeight: 30,
    color: COLORS.text,
    textAlign: 'center',
  },
  tapHint: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 12,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    minWidth: 90,
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionMastered: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.primary,
  },
  actionArchived: {
    opacity: 0.8,
  },
  actionText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  actionTextGold: {
    color: COLORS.gold,
  },
  playButton: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  playButtonText: {
    fontSize: 14,
    color: COLORS.gold,
  },
});
