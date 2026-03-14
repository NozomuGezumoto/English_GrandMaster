/**
 * GitHub風 学習ヒートマップ
 * 学習量に応じて4段階の色で表示
 * 月は左右ボタンで切り替え
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { COLORS } from '../../lib/theme';
import { formatStudySeconds } from '../../lib/study-history';
import type { DayStudyDetail } from '../../lib/study-time-today';

export type { DayStudyDetail };

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 学習量に応じた色（4段階・差をはっきり） */
const COLORS_HEATMAP = {
  none: '#2C2C2C',   // 未学習
  light: '#8B6B28',  // 少し（暗めで差をつける）
  normal: '#C8A858', // 普通（中間をはっきり）
  heavy: '#F5E090',  // 多い（明るく差を強調）
} as const;

type StudyLevel = 'none' | 'light' | 'normal' | 'heavy';

interface StudyCalendarHeatmapProps {
  year: number;
  /** dateStr -> studySeconds */
  dailyData: Record<string, number>;
  /** dateStr -> 日別詳細（タップ時に内訳表示）。省略時は studySeconds のみ表示 */
  dailyDataWithCounts?: Record<string, DayStudyDetail>;
  /** 目標時間（分）。0なら固定しきい値を使用 */
  targetMinutes: number;
  cellSize?: number;
  gap?: number;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function StudyCalendarHeatmap({
  year,
  dailyData,
  dailyDataWithCounts,
  targetMinutes,
  cellSize = 10,
  gap = 2,
}: StudyCalendarHeatmapProps) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const targetSeconds = targetMinutes > 0 ? targetMinutes * 60 : 0;

  /** 学習量に応じたレベルを算出 */
  const getStudyLevel = (dateStr: string): StudyLevel => {
    const sec = dailyData[dateStr] ?? 0;
    if (sec <= 0) return 'none';
    // 目標がある場合は目標ベース、ない場合は固定しきい値（10分/30分/1h）
    const t1 = targetSeconds > 0 ? targetSeconds / 3 : 600;
    const t2 = targetSeconds > 0 ? targetSeconds : 1800;
    if (sec < t1) return 'light';
    if (sec < t2) return 'normal';
    return 'heavy';
  };

  const getCellColor = (dateStr: string | null): string => {
    if (!dateStr) return 'transparent';
    return COLORS_HEATMAP[getStudyLevel(dateStr)];
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = Array(7).fill(null);
  let col = firstDow;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    row[col] = dateStr;
    col++;
    if (col >= 7) {
      rows.push(row);
      row = Array(7).fill(null);
      col = 0;
    }
  }
  if (row.some((x) => x !== null)) rows.push(row);

  const canGoPrev = month > 1;
  const canGoNext = month < 12;

  const handleCellPress = (dateStr: string | null) => {
    if (!dateStr) return;
    const detail = dailyDataWithCounts?.[dateStr];
    const sec = detail?.studySeconds ?? dailyData[dateStr] ?? 0;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateLabel = `${MONTH_LABELS[m - 1]} ${d}, ${y}`;
    let message: string;
    if (detail) {
      message = [
        `Study time: ${sec > 0 ? formatStudySeconds(sec) : '0s'}`,
        '',
        `Flashcards: ${detail.flashcards ?? 0}`,
        `Dictation: ${detail.dictation ?? 0}`,
        `Battles: ${detail.battles ?? 0}`,
      ].join('\n');
    } else {
      message = sec > 0 ? formatStudySeconds(sec) : 'No study';
    }
    Alert.alert(dateLabel, message, [{ text: 'OK' }]);
  };

  return (
    <View style={styles.container}>
      {/* 月選択 */}
      <View style={styles.monthSelector}>
        <TouchableOpacity
          style={[styles.monthNav, !canGoPrev && styles.monthNavDisabled]}
          onPress={() => canGoPrev && setMonth(month - 1)}
          disabled={!canGoPrev}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.monthNavText, !canGoPrev && styles.monthNavTextDisabled]}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthSelectorLabel}>{MONTH_LABELS[month - 1]}</Text>
        <TouchableOpacity
          style={[styles.monthNav, !canGoNext && styles.monthNavDisabled]}
          onPress={() => canGoNext && setMonth(month + 1)}
          disabled={!canGoNext}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.monthNavText, !canGoNext && styles.monthNavTextDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.headerRow, { marginLeft: 0 }]}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={[styles.dayLabel, { width: cellSize + gap, fontSize: cellSize >= 28 ? 12 : 11 }]}>{d}</Text>
        ))}
      </View>
      <View style={styles.monthBlock}>
        <View style={styles.monthGrid}>
          {rows.map((r, ri) => (
            <View key={ri} style={styles.weekRow}>
              {r.map((dateStr, ci) => (
                <TouchableOpacity
                  key={ci}
                  onPress={() => dateStr && handleCellPress(dateStr)}
                  disabled={!dateStr}
                  activeOpacity={0.7}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      margin: gap / 2,
                      backgroundColor: dateStr ? getCellColor(dateStr) : 'transparent',
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendCell, { width: Math.min(18, cellSize * 0.6), height: Math.min(18, cellSize * 0.6), backgroundColor: COLORS_HEATMAP.none }]} />
          <Text style={styles.legendText}>No study</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendCell, { width: Math.min(18, cellSize * 0.6), height: Math.min(18, cellSize * 0.6), backgroundColor: COLORS_HEATMAP.light }]} />
          <Text style={styles.legendText}>Under goal</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendCell, { width: Math.min(18, cellSize * 0.6), height: Math.min(18, cellSize * 0.6), backgroundColor: COLORS_HEATMAP.normal }]} />
          <Text style={styles.legendText}>Goal met</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendCell, { width: Math.min(18, cellSize * 0.6), height: Math.min(18, cellSize * 0.6), backgroundColor: COLORS_HEATMAP.heavy }]} />
          <Text style={styles.legendText}>Best day</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  monthNav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavDisabled: {
    opacity: 0.4,
  },
  monthNavText: {
    fontSize: 20,
    color: COLORS.gold,
    fontWeight: '700',
  },
  monthNavTextDisabled: {
    color: COLORS.muted,
  },
  monthSelectorLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 48,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dayLabel: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
  },
  monthBlock: {
    alignItems: 'center',
    marginBottom: 16,
  },
  monthGrid: {
    alignItems: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  cell: {
    borderRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendCell: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.muted,
  },
});
