import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { getTowerStageStepLabel, type TowerStage } from '../../../lib/tower-progress';
import { COLORS } from '../../../lib/theme';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

type Props = {
  stage: TowerStage;
  onPress: () => void;
  /** 例: "7/58" — 桶内で少なくとも1回正解した数 / そのステージに振り分けられた総数 */
  poolHint?: string;
};

export function StageCard({ stage, onPress, poolHint }: Props) {
  const locked = stage.status === 'locked';
  const cleared = stage.status === 'cleared';
  const tierLabel = getTowerStageStepLabel(stage.stageNumber);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        locked && styles.cardLocked,
        !locked && !cleared && styles.cardUnlocked,
        cleared && styles.cardCleared,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.glowLine, cleared && styles.glowLineCleared, locked && styles.glowLineLocked]} />
      <View style={styles.row}>
        <View style={[styles.numPlate, locked && styles.numPlateLocked]}>
          <Text style={[styles.num, locked && styles.textLocked]}>{stage.stageNumber}</Text>
        </View>
        <View style={styles.mid}>
          <Text style={[styles.tierTitle, locked && styles.textLocked]} numberOfLines={2}>
            {tierLabel}
          </Text>
          <Text
            style={[
              styles.status,
              locked && styles.statusLocked,
              cleared && styles.statusCleared,
              !locked && !cleared && styles.statusReady,
            ]}
          >
            {stage.status === 'locked' ? 'Sealed' : stage.status === 'unlocked' ? 'Ready' : 'Cleared'}
          </Text>
          {poolHint ? (
            <Text style={[styles.poolHint, locked && styles.poolHintLocked]} numberOfLines={1}>
              Progress {poolHint}
            </Text>
          ) : null}
        </View>
        <View style={[styles.chip, cleared && styles.chipCleared, locked && styles.chipLocked]}>
          <Text style={[styles.chipText, cleared && styles.chipTextCleared, locked && styles.chipTextLocked]}>
            {stage.status.toUpperCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.42)',
    backgroundColor: 'rgba(18, 26, 38, 0.7)',
    overflow: 'hidden',
    width: '100%',
  },
  cardLocked: {
    borderColor: 'rgba(42, 61, 90, 0.72)',
    backgroundColor: 'rgba(12, 16, 26, 0.7)',
  },
  cardUnlocked: {
    borderColor: 'rgba(143, 182, 255, 0.38)',
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardCleared: {
    borderColor: 'rgba(198, 167, 94, 0.72)',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.92,
  },
  glowLine: {
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(100, 140, 190, 0.16)',
  },
  glowLineCleared: {
    backgroundColor: 'rgba(198, 167, 94, 0.22)',
  },
  glowLineLocked: {
    backgroundColor: 'rgba(28, 36, 48, 0.65)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 14,
  },
  numPlate: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(198, 167, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numPlateLocked: {
    backgroundColor: 'rgba(40, 50, 68, 0.35)',
    borderColor: 'rgba(60, 72, 92, 0.55)',
  },
  num: {
    fontFamily: FONT.display,
    fontSize: 22,
    fontWeight: '700',
    color: '#DCC495',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  mid: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 5,
  },
  tierTitle: {
    fontFamily: FONT.display,
    fontSize: 14,
    fontWeight: '600',
    color: '#F2F6FF',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    lineHeight: 18,
  },
  status: {
    fontFamily: FONT.body,
    fontSize: 10,
    fontWeight: '600',
    color: '#8B9AB0',
    letterSpacing: 0.85,
    textTransform: 'uppercase',
  },
  statusLocked: {
    color: 'rgba(120, 132, 152, 0.88)',
  },
  statusReady: {
    color: 'rgba(140, 180, 255, 0.92)',
  },
  statusCleared: {
    color: 'rgba(200, 210, 224, 0.92)',
  },
  poolHint: {
    fontFamily: FONT.body,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(160, 184, 220, 0.95)',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  poolHintLocked: {
    color: 'rgba(100, 112, 132, 0.85)',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(143, 182, 255, 0.4)',
    backgroundColor: 'rgba(28, 42, 64, 0.78)',
    flexShrink: 0,
    alignSelf: 'center',
  },
  chipCleared: {
    borderColor: 'rgba(110, 200, 140, 0.42)',
    backgroundColor: 'rgba(18, 42, 32, 0.55)',
  },
  chipLocked: {
    borderColor: 'rgba(60, 70, 88, 0.65)',
    backgroundColor: 'rgba(12, 16, 24, 0.88)',
  },
  chipText: {
    fontFamily: FONT.body,
    fontSize: 9,
    fontWeight: '700',
    color: '#A4C4FF',
    letterSpacing: 1,
  },
  chipTextCleared: {
    color: 'rgba(160, 230, 180, 0.95)',
  },
  chipTextLocked: {
    color: '#9AA8BC',
  },
  textLocked: {
    color: 'rgba(138, 148, 168, 0.9)',
  },
});
