/**
 * Card List画面
 * deckId はクエリパラメータで受け取る。
 */

import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import { getStudyCards } from '../../lib/study-cards';
import { STATUS_LABELS, EXPRESSION_TYPE_LABELS, type StudyCard, type StudyCardStatus } from '../../types/study-card';
import { COLORS } from '../../lib/theme';

const STATUS_OPTIONS: (StudyCardStatus | 'all')[] = ['all', 'learning', 'mastered', 'archived'];

function StudyCardListItem({
  card,
  deckId,
  onPress,
}: {
  card: StudyCard;
  deckId: string;
  onPress: () => void;
}) {
  const statusLabel = STATUS_LABELS[card.status];
  const typeLabel = card.expressionType ? EXPRESSION_TYPE_LABELS[card.expressionType] : null;
  const japanesePreview = card.japaneseNote ? card.japaneseNote.slice(0, 40) + (card.japaneseNote.length > 40 ? '…' : '') : null;

  return (
    <TouchableOpacity style={styles.cardItem} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.cardEnglish} numberOfLines={2}>{card.englishText}</Text>
      {japanesePreview ? (
        <Text style={styles.cardJapanese} numberOfLines={1}>{japanesePreview}</Text>
      ) : null}
      <View style={styles.cardMeta}>
        {typeLabel ? (
          <Text style={styles.cardType}>{typeLabel}</Text>
        ) : null}
        <View style={[styles.statusBadge, card.status === 'learning' && styles.statusLearning]}>
          <Text style={[styles.statusText, card.status === 'learning' && styles.statusTextLearning]}>
            {statusLabel}
          </Text>
        </View>
        {card.lastReviewedAt ? (
          <Text style={styles.cardDate}>
            Reviewed: {new Date(card.lastReviewedAt).toLocaleDateString('en-US')}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function StudyCardsListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<StudyCardStatus | 'all'>('all');

  const load = useCallback(() => {
    if (!deckId) {
      setCards([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getStudyCards(deckId, { orderByCreated: 'desc', limitCount: 500 })
      .then((list) => setCards(list))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [deckId]);

  useEffect(() => {
    if (!deckId) router.replace('/study-cards');
  }, [deckId, router]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const filtered =
    filterStatus === 'all'
      ? cards
      : cards.filter((c) => c.status === filterStatus);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Card List</Text>

      <View style={styles.filterRow}>
        {STATUS_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
            onPress={() => setFilterStatus(s)}
          >
            <Text style={[styles.filterChipText, filterStatus === s && styles.filterChipTextActive]}>
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.gold} style={styles.loader} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No cards</Text>
          <Text style={styles.emptySub}>Add new cards to get started</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <StudyCardListItem
              card={item}
              deckId={deckId!}
              onPress={() => router.push(`/study-cards/${item.id}?deckId=${deckId}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
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
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.gold,
  },
  filterChipText: {
    fontSize: 13,
    color: COLORS.text,
  },
  filterChipTextActive: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
  listContent: {
    paddingBottom: 24,
  },
  cardItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardEnglish: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 24,
  },
  cardJapanese: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  cardType: {
    fontSize: 11,
    color: COLORS.muted,
    backgroundColor: COLORS.background,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  statusLearning: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  statusTextLearning: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  cardDate: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
