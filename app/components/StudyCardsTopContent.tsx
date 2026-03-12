/**
 * 英文単語帳トップの共通コンテンツ（統計・ボタン）
 * Study タブ内と /study-cards の両方で使用
 */

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS } from '../../lib/theme';

export interface StudyCardsCounts {
  total: number;
  learning: number;
  mastered: number;
  archived: number;
}

interface StudyCardsTopContentProps {
  counts: StudyCardsCounts | null;
  loading: boolean;
  onAdd: () => void;
  onReview: () => void;
  onList: () => void;
}

export function StudyCardsTopContent({
  counts,
  loading,
  onAdd,
  onReview,
  onList,
}: StudyCardsTopContentProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Flashcards</Text>
      <Text style={styles.subtitle}>Review English cards</Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.gold} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : counts ? (
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{counts.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: COLORS.gold }]}>{counts.learning}</Text>
            <Text style={styles.statLabel}>Learning</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{counts.mastered}</Text>
            <Text style={styles.statLabel}>Mastered</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{counts.archived}</Text>
            <Text style={styles.statLabel}>Archived</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.buttonColumn}>
        <TouchableOpacity style={styles.primaryButton} onPress={onAdd}>
          <Text style={styles.primaryButtonText}>Add New</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onReview}>
          <Text style={styles.secondaryButtonText}>Review</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onList}>
          <Text style={styles.secondaryButtonText}>View List</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: COLORS.background,
    minHeight: 300,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.gold,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.muted,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 32,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  buttonColumn: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  primaryButtonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
});
