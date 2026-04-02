import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  type ImageSourcePropType,
  Platform,
} from 'react-native';
import type { TowerLevelRow } from '../../../lib/tower-progress';
import { COLORS } from '../../../lib/theme';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

type Props = {
  level: TowerLevelRow;
  guardianIcon: ImageSourcePropType;
  onPress: () => void;
};

type ListBadgeVariant = 'locked' | 'active' | 'cleared';

function listStatus(level: TowerLevelRow): { label: string; variant: ListBadgeVariant } {
  if (level.learningStatus === 'locked') return { label: 'Locked', variant: 'locked' };
  if (level.learningStatus === 'unlocked') return { label: 'Active', variant: 'active' };
  return { label: 'Cleared', variant: 'cleared' };
}

export function TowerLevelCard({ level, guardianIcon, onPress }: Props) {
  const learnLocked = level.learningStatus === 'locked';
  const learnCleared = level.learningStatus === 'cleared';
  const { label: badgeLabel, variant: badgeVariant } = listStatus(level);

  const total = Math.max(1, level.totalStages);
  const cleared = learnLocked ? 0 : Math.min(level.stagesCleared, total);
  const progressPct = Math.round((cleared / total) * 100);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        learnLocked && styles.cardLocked,
        !learnLocked && !learnCleared && styles.cardUnlocked,
        learnCleared && styles.cardCleared,
        pressed && !learnLocked && styles.cardPressed,
      ]}
    >
      <View style={[styles.glowLine, learnCleared && styles.glowLineStrong, learnLocked && styles.glowLineOff]} />
      <View style={styles.inner}>
        <View style={[styles.iconRing, learnLocked && styles.iconRingLocked, learnCleared && styles.iconRingCleared]}>
          <View style={styles.iconClip}>
            <Image
              source={guardianIcon}
              style={[styles.iconImage, learnLocked && styles.iconLocked]}
              resizeMode="cover"
            />
          </View>
        </View>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={styles.headlines}>
              <Text style={[styles.code, learnLocked && styles.mutedText]}>{level.code}</Text>
              <Text style={[styles.title, learnLocked && styles.mutedTextSoft]} numberOfLines={1}>
                {level.title}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                badgeVariant === 'locked' && styles.badgeLocked,
                badgeVariant === 'active' && styles.badgeActive,
                badgeVariant === 'cleared' && styles.badgeCleared,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  badgeVariant === 'locked' && styles.badgeTextLocked,
                  badgeVariant === 'active' && styles.badgeTextActive,
                  badgeVariant === 'cleared' && styles.badgeTextCleared,
                ]}
              >
                {badgeLabel}
              </Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, learnLocked && styles.progressTrackLocked]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPct}%` },
                  learnLocked && styles.progressFillLocked,
                  learnCleared && styles.progressFillCleared,
                ]}
              />
            </View>
            <Text style={[styles.progressFrac, learnLocked && styles.mutedTextSoft]}>
              {cleared}/{total}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.5)',
    backgroundColor: 'rgba(18, 26, 38, 0.7)',
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
  },
  cardLocked: {
    borderColor: 'rgba(42, 61, 90, 0.72)',
    backgroundColor: 'rgba(12, 16, 26, 0.7)',
  },
  cardUnlocked: {
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardCleared: {
    borderColor: 'rgba(198, 167, 94, 0.78)',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.92,
  },
  glowLine: {
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(100, 140, 190, 0.14)',
  },
  glowLineStrong: {
    backgroundColor: 'rgba(198, 167, 94, 0.22)',
  },
  glowLineOff: {
    backgroundColor: 'rgba(28, 36, 48, 0.65)',
  },
  inner: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 14,
    alignItems: 'center',
  },
  iconRing: {
    width: 64,
    height: 64,
    minWidth: 64,
    minHeight: 64,
    flexShrink: 0,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(198, 167, 94, 0.65)',
    backgroundColor: 'rgba(7, 11, 18, 0.9)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRingLocked: {
    borderColor: 'rgba(50, 60, 78, 0.9)',
    backgroundColor: 'rgba(5, 8, 14, 0.95)',
  },
  iconRingCleared: {
    borderColor: 'rgba(198, 167, 94, 0.88)',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  iconClip: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  iconImage: {
    width: 60,
    height: 60,
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as const) : {}),
  },
  iconLocked: {
    opacity: 0.35,
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headlines: {
    flex: 1,
    minWidth: 0,
  },
  code: {
    fontFamily: FONT.display,
    fontSize: 22,
    fontWeight: '700',
    color: '#DCC495',
    letterSpacing: 2,
  },
  title: {
    fontFamily: FONT.display,
    fontSize: 12,
    color: '#F2F6FF',
    letterSpacing: 0.7,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  badgeLocked: {
    borderColor: 'rgba(60, 70, 88, 0.75)',
    backgroundColor: 'rgba(12, 16, 24, 0.88)',
  },
  badgeActive: {
    borderColor: 'rgba(100, 160, 255, 0.45)',
    backgroundColor: 'rgba(24, 40, 72, 0.85)',
  },
  badgeCleared: {
    borderColor: 'rgba(198, 167, 94, 0.55)',
    backgroundColor: 'rgba(36, 32, 22, 0.75)',
  },
  badgeText: {
    fontFamily: FONT.body,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badgeTextLocked: {
    color: COLORS.muted,
  },
  badgeTextActive: {
    color: '#A4C4FF',
  },
  badgeTextCleared: {
    color: 'rgba(224, 198, 140, 0.95)',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressTrackLocked: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(143, 182, 255, 0.55)',
  },
  progressFillLocked: {
    backgroundColor: 'rgba(90, 100, 120, 0.35)',
  },
  progressFillCleared: {
    backgroundColor: 'rgba(214, 188, 130, 0.65)',
  },
  progressFrac: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: '600',
    color: '#AAB8CE',
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'right',
  },
  mutedText: {
    color: 'rgba(138, 148, 168, 0.92)',
  },
  mutedTextSoft: {
    color: 'rgba(122, 132, 152, 0.88)',
  },
});
