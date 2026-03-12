/**
 * 英文単語帳トップ画面
 * デッキ一覧表示。各デッキに追加・復習・一覧ボタン
 */

import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { getStudyDecks, getStudyCardCounts, getStudyCardCountsByExpressionType, createStudyDeck } from '../../lib/study-cards';
import { EXPRESSION_TYPE_LABELS } from '../../types/study-card';
import { COLORS } from '../../lib/theme';

export default function StudyCardsTop() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [decks, setDecks] = useState<{ id: string; name: string; total: number; learning: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCounts, setTotalCounts] = useState<{ total: number; learning: number; mastered: number; archived: number } | null>(null);
  const [expressionTypeCounts, setExpressionTypeCounts] = useState<
    { expressionType: string; learning: number; total: number }[]
  >([]);
  const [createModal, setCreateModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deckList, counts, exprCounts] = await Promise.all([
        getStudyDecks(),
        getStudyCardCounts(),
        getStudyCardCountsByExpressionType(),
      ]);
      setExpressionTypeCounts(exprCounts);
      setTotalCounts({
        total: counts.total,
        learning: counts.learning,
        mastered: counts.mastered,
        archived: counts.archived,
      });
      if (counts.byDeck && counts.byDeck.length > 0) {
        setDecks(counts.byDeck.map((d) => ({ id: d.deckId, name: d.deckName, total: d.total, learning: d.learning })));
      } else {
        setDecks(deckList.map((d) => ({ id: d.id, name: d.name, total: 0, learning: 0 })));
      }
    } catch {
      setDecks([]);
      setTotalCounts(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleCreateDeck = async () => {
    const name = newDeckName.trim() || 'New deck';
    setCreateModal(false);
    setNewDeckName('');
    try {
      await createStudyDeck(name);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create deck');
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 16 }]} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Flashcards</Text>
      <Text style={styles.subtitle}>Manage cards by deck</Text>

      {totalCounts !== null && (
        <View style={styles.totalStats}>
          <Text style={styles.totalLabel}>All decks</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalValue}>{totalCounts.total}</Text>
            <Text style={styles.totalUnit}>cards</Text>
            <Text style={[styles.totalValue, { color: COLORS.gold, marginLeft: 16 }]}>{totalCounts.learning}</Text>
            <Text style={styles.totalUnit}>learning</Text>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.gold} style={styles.loader} />
      ) : (
        <>
          {expressionTypeCounts.length > 0 && (
            <View style={styles.courseSection}>
              <Text style={styles.courseSectionTitle}>Review by part of speech</Text>
              <View style={styles.courseList}>
                {expressionTypeCounts.map(({ expressionType, learning, total }) => (
                  <TouchableOpacity
                    key={expressionType}
                    style={styles.courseCard}
                    onPress={() => router.push(`/study-cards/review?expressionType=${expressionType}`)}
                  >
                    <Text style={styles.courseLabel}>{EXPRESSION_TYPE_LABELS[expressionType as keyof typeof EXPRESSION_TYPE_LABELS] ?? expressionType} ({total})</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <View style={styles.deckList}>
            {decks.map((deck) => (
              <View key={deck.id} style={styles.deckCard}>
                <Text style={styles.deckName}>{deck.name} ({deck.total})</Text>
                <View style={styles.deckActions}>
                  <TouchableOpacity
                    style={styles.deckActionBtn}
                    onPress={() => router.push(`/study-cards/create?deckId=${deck.id}`)}
                  >
                    <Text style={styles.deckActionText}>Add</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deckActionBtn}
                    onPress={() => router.push(`/study-cards/bulk?deckId=${deck.id}`)}
                  >
                    <Text style={styles.deckActionText}>Bulk</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deckActionBtn, styles.deckActionPrimary]}
                    onPress={() => router.push(`/study-cards/review?deckId=${deck.id}`)}
                  >
                    <Text style={[styles.deckActionText, styles.deckActionTextGold]}>Review</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deckActionBtn}
                    onPress={() => router.push(`/study-cards/list?deckId=${deck.id}`)}
                  >
                    <Text style={styles.deckActionText}>List</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.addDeckButton}
            onPress={() => setCreateModal(true)}
          >
            <Text style={styles.addDeckButtonText}>+ Add deck</Text>
          </TouchableOpacity>
        </>
      )}

      {createModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New deck</Text>
            <TextInput
              style={styles.modalInput}
              value={newDeckName}
              onChangeText={setNewDeckName}
              placeholder="Deck name"
              placeholderTextColor={COLORS.muted}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => { setCreateModal(false); setNewDeckName(''); }}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleCreateDeck}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextGold]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
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
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.gold,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 20,
  },
  totalStats: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  totalUnit: {
    fontSize: 14,
    color: COLORS.muted,
    marginLeft: 4,
  },
  loader: {
    marginTop: 40,
  },
  courseSection: {
    marginBottom: 24,
  },
  courseSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
    marginBottom: 12,
  },
  courseList: {
    gap: 10,
  },
  courseCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  courseLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  courseStats: {
    fontSize: 13,
    color: COLORS.muted,
  },
  deckList: {
    gap: 12,
    marginBottom: 24,
  },
  deckCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deckName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  deckStats: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 12,
  },
  deckActions: {
    flexDirection: 'row',
    gap: 8,
  },
  deckActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deckActionPrimary: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.primary,
  },
  deckActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  deckActionTextGold: {
    color: COLORS.gold,
  },
  addDeckButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  addDeckButtonText: {
    fontSize: 16,
    color: COLORS.muted,
    fontWeight: '600',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.gold,
  },
  modalBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalBtnTextGold: {
    color: COLORS.gold,
  },
});
