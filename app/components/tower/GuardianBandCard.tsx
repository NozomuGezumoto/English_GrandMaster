import { View, Text, StyleSheet, Pressable, type ImageSourcePropType, Platform } from 'react-native';
import type { GuardianRow } from '../../../lib/tower-progress';
import { COLORS } from '../../../lib/theme';
import { TowerGuardianHeroVisual } from './TowerGuardianHeroVisual';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

type Props = {
  row: GuardianRow;
  heroSource: ImageSourcePropType;
  onPress: () => void;
};

function ctaLabel(s: GuardianRow['status']): string {
  if (s === 'mastered') return 'Mastered';
  if (s === 'unlocked') return 'Challenge';
  return 'Sealed';
}

export function GuardianBandCard({ row, heroSource, onPress }: Props) {
  const locked = row.status === 'locked';
  const mastered = row.status === 'mastered';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        locked && styles.cardLocked,
        row.status === 'unlocked' && styles.cardOpen,
        mastered && styles.cardMastered,
        pressed && styles.cardPressed,
      ]}
    >
      <TowerGuardianHeroVisual
        source={heroSource}
        locked={locked}
        variant="gate"
        masteredVeil={mastered}
      />

      <View style={styles.meta}>
        <View style={styles.metaTop}>
          <Text style={[styles.fieldLabel, styles.labelCenter, locked && styles.textMuted]}>
            STAGE BOSS
          </Text>
          <View style={styles.levelCenterWrap}>
            <View style={styles.levelInline}>
              <Text style={[styles.fieldLabel, locked && styles.textMuted]}>LEVEL </Text>
              <Text style={[styles.levelValue, locked && styles.textMuted]}>{row.code}</Text>
            </View>
          </View>
        </View>
        <View style={styles.bossBlock}>
          <Text style={[styles.fieldLabel, styles.labelCenter, locked && styles.textMuted]}>
            BOSS NAME
          </Text>
          <Text
            style={[styles.guardianName, locked && styles.textMutedSoft]}
            numberOfLines={2}
          >
            {row.guardianName}
          </Text>
        </View>
        <View
          style={[
            styles.cta,
            locked && styles.ctaLocked,
            row.status === 'unlocked' && styles.ctaOpen,
            mastered && styles.ctaMastered,
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              locked && styles.ctaTextLocked,
              mastered && styles.ctaTextMastered,
            ]}
          >
            {ctaLabel(row.status)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(198, 167, 94, 0.5)',
    /** 帯一覧・StageCard・BossCard と同じ透過 */
    backgroundColor: 'rgba(10, 16, 30, 0.7)',
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    marginHorizontal: -10,
  },
  cardLocked: {
    borderColor: 'rgba(42, 61, 90, 0.75)',
  },
  cardOpen: {
    borderColor: 'rgba(143, 182, 255, 0.5)',
  },
  cardMastered: {
    borderColor: 'rgba(198, 167, 94, 0.85)',
  },
  cardPressed: {
    opacity: 0.94,
  },
  meta: {
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(19, 29, 52, 0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(198, 167, 94, 0.32)',
    alignItems: 'stretch',
  },
  metaTop: {
    width: '100%',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198, 167, 94, 0.2)',
    alignItems: 'center',
  },
  labelCenter: {
    textAlign: 'center',
    width: '100%',
  },
  levelCenterWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
  levelInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: FONT.body,
    fontSize: 10,
    fontWeight: '700',
    color: '#A8CCFF',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  levelValue: {
    fontFamily: FONT.display,
    fontSize: 24,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 2,
  },
  bossBlock: {
    width: '100%',
    marginBottom: 6,
    alignItems: 'center',
  },
  guardianName: {
    fontFamily: FONT.display,
    fontSize: 22,
    fontWeight: '700',
    color: '#D9E6FF',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 8,
    textAlign: 'center',
    width: '100%',
  },
  cta: {
    marginTop: 16,
    alignSelf: 'center',
    minWidth: 200,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLocked: {
    borderColor: 'rgba(55, 65, 82, 0.85)',
    backgroundColor: COLORS.towerCtaLocked,
  },
  ctaOpen: {
    borderColor: 'rgba(143, 182, 255, 0.55)',
    backgroundColor: COLORS.towerCtaReady,
  },
  ctaMastered: {
    borderColor: 'rgba(198, 167, 94, 0.65)',
    backgroundColor: COLORS.towerCtaCleared,
  },
  ctaText: {
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: '800',
    color: '#A4C4FF',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  ctaTextLocked: {
    color: '#8A96AC',
  },
  ctaTextMastered: {
    color: '#DCC495',
  },
  textMuted: {
    color: 'rgba(138, 148, 168, 0.9)',
  },
  textMutedSoft: {
    color: 'rgba(122, 132, 152, 0.88)',
  },
});
