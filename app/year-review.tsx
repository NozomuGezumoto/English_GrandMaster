/**
 * 年間学習記録画面
 * 指定年の Total study time, Battles, Flashcards, Dictation, Best day を表示
 */

import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getAvailableYears,
  formatStudySeconds,
  type YearStudySummary,
} from '../lib/study-history';
import {
  getYearStudyDataMerged,
  getYearDailyStudyDataWithCounts,
} from '../lib/study-time-today';
import { getStudyTimeTarget } from '../lib/study-time-target';
import { StudyCalendarHeatmap } from './components/StudyCalendarHeatmap';
import { COLORS } from '../lib/theme';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function YearReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ year?: string }>();
  const initialYear = params.year ? parseInt(params.year, 10) : new Date().getFullYear();

  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<YearStudySummary | null>(null);
  const [dailyData, setDailyData] = useState<Record<string, number>>({});
  const [dailyDataWithCounts, setDailyDataWithCounts] = useState<Record<string, { studySeconds: number; flashcards: number; dictation: number; battles: number }>>({});
  const [targetMinutes, setTargetMinutes] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, years, dailyWithCounts, target] = await Promise.all([
        getYearStudyDataMerged(year),
        getAvailableYears(),
        getYearDailyStudyDataWithCounts(year),
        getStudyTimeTarget(),
      ]);
      setData(summary);
      setDailyDataWithCounts(dailyWithCounts);
      setDailyData(Object.fromEntries(Object.entries(dailyWithCounts).map(([d, v]) => [d, v.studySeconds])));
      setTargetMinutes(target.mode === 'daily' ? target.minutes : 0);
      const currentYear = new Date().getFullYear();
      // 記録がなくても過去数年は閲覧できるように、直近3年分を常に含める
      const recentYears = [currentYear, currentYear - 1, currentYear - 2];
      const merged = [...new Set([...recentYears, year, ...years])].sort((a, b) => b - a);
      setAvailableYears(merged);
    } catch (e) {
      console.error('[YearReview] load error:', e);
      setData(null);
      const currentYear = new Date().getFullYear();
      setAvailableYears([currentYear, currentYear - 1, currentYear - 2]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${y}/${m}/${d}`;
  };

  const currentYear = new Date().getFullYear();
  const yearIndex = availableYears.indexOf(year);
  // availableYears は新しい順 [2026, 2025, 2024...]。‹=過去(右へ)、›=未来(左へ)
  const canGoToOlder = yearIndex >= 0 && yearIndex < availableYears.length - 1;  // idx+1
  const canGoToNewer = yearIndex > 0;  // idx-1

  const { width } = useWindowDimensions();
  const gap = 4;
  // カード内幅 = 画面 - スクロール左右パディング - カード左右パディング
  const contentWidth = width - 40 - 40;
  const cellSize = Math.max(20, Math.floor((contentWidth - 6 * gap - 24) / 7));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Learning Record</Text>
      </View>

      {/* 年選択 */}
      <View style={styles.yearSelector}>
        <TouchableOpacity
          style={[styles.yearNav, !canGoToOlder && styles.yearNavDisabled]}
          onPress={() => {
            const idx = availableYears.indexOf(year);
            if (idx >= 0 && idx < availableYears.length - 1) setYear(availableYears[idx + 1]);
          }}
          disabled={!canGoToOlder}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.yearNavText, !canGoToOlder && styles.yearNavTextDisabled]}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.yearLabel}>{year}</Text>
        <TouchableOpacity
          style={[styles.yearNav, !canGoToNewer && styles.yearNavDisabled]}
          onPress={() => {
            const idx = availableYears.indexOf(year);
            if (idx > 0) setYear(availableYears[idx - 1]);
          }}
          disabled={!canGoToNewer}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.yearNavText, !canGoToNewer && styles.yearNavTextDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      ) : data ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* サマリーカード */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Total</Text>
            <View style={styles.mainStat}>
              <Text style={styles.mainStatLabel}>Study time</Text>
              <Text style={styles.mainStatValue}>{formatStudySeconds(data.totalStudySeconds)}</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Battles</Text>
                <Text style={styles.miniStatValue}>{data.totalBattles}</Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Dictation</Text>
                <Text style={styles.miniStatValue}>{data.totalDictation}</Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Flashcards</Text>
                <Text style={styles.miniStatValue}>{data.totalFlashcards}</Text>
              </View>
            </View>
          </View>

          {/* ヒートマップ（GitHub風）・月別 Best day 込み */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Calendar</Text>
            <StudyCalendarHeatmap
              year={year}
              dailyData={dailyData}
              dailyDataWithCounts={dailyDataWithCounts}
              targetMinutes={targetMinutes}
              cellSize={cellSize}
              gap={gap}
            />
          </View>
        </ScrollView>
      ) : (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Failed to load data</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: COLORS.gold,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.gold,
  },
  yearSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 20,
  },
  yearNav: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearNavDisabled: {
    opacity: 0.4,
  },
  yearNavText: {
    fontSize: 24,
    color: COLORS.gold,
    fontWeight: '700',
  },
  yearNavTextDisabled: {
    color: COLORS.muted,
  },
  yearLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    minWidth: 80,
    textAlign: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
    marginBottom: 12,
  },
  mainStat: {
    marginBottom: 16,
  },
  mainStatLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
  },
  mainStatValue: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.gold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  miniStat: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  miniStatLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 4,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  bestDayDate: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  bestDayValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.gold,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  monthLabel: {
    fontSize: 14,
    color: COLORS.text,
    width: 40,
  },
  monthValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
    flex: 1,
  },
  monthDays: {
    fontSize: 12,
    color: COLORS.muted,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.muted,
  },
});
