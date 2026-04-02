import { View, Text, StyleSheet, Pressable, Platform, type ImageSourcePropType } from 'react-native';
import type { TowerStage } from '../../../lib/tower-progress';
import { COLORS } from '../../../lib/theme';
import { TowerGuardianHeroVisual } from './TowerGuardianHeroVisual';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

function ctaLabel(status: TowerStage['status']): string {
  if (status === 'cleared') return 'Cleared';
  if (status === 'locked') return 'Sealed';
  return 'Challenge';
}

type Props = {
  stage: TowerStage;
  onPress: () => void;
  /** e.g. THE HARE (Grammar) or BOSS. */
  summitHeadline: string;
  heroSource?: ImageSourcePropType;
};

export function BossCard({ stage, onPress, summitHeadline, heroSource }: Props) {
  const locked = stage.status === 'locked';
  const cleared = stage.status === 'cleared';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        locked && styles.wrapLocked,
        !locked && !cleared && styles.wrapUnlocked,
        cleared && styles.wrapCleared,
        pressed && styles.wrapPressed,
      ]}
    >
      <TowerGuardianHeroVisual source={heroSource} locked={locked} variant="boss" />

      <View style={styles.meta}>
        <Text style={[styles.eyebrow, locked && styles.eyebrowLocked]}>Stage Boss</Text>
        <Text style={[styles.headline, locked && styles.headlineLocked]} numberOfLines={2}>
          {summitHeadline}
        </Text>
        <View
          style={[
            styles.cta,
            cleared && styles.ctaCleared,
            locked && styles.ctaLocked,
            !locked && !cleared && styles.ctaReady,
          ]}
        >
          <Text style={[styles.ctaText, locked && styles.ctaTextLocked, cleared && styles.ctaTextCleared]}>
            {ctaLabel(stage.status)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(198, 167, 94, 0.68)',
    /** #0A101E @ 0.7 — 帯一覧カード・StageCard と同程度の透過 */
    backgroundColor: 'rgba(10, 16, 30, 0.7)',
    overflow: 'hidden',
    marginTop: 8,
    alignSelf: 'stretch',
    marginHorizontal: -8,
  },
  wrapLocked: {
    borderColor: 'rgba(55, 65, 85, 0.88)',
  },
  wrapUnlocked: {
    borderColor: 'rgba(143, 182, 255, 0.58)',
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
  wrapCleared: {
    borderColor: 'rgba(198, 167, 94, 0.88)',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  wrapPressed: {
    opacity: 0.94,
  },
  meta: {
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    /** #131D34 @ 0.7 */
    backgroundColor: 'rgba(19, 29, 52, 0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(198, 167, 94, 0.32)',
  },
  eyebrow: {
    fontFamily: FONT.body,
    fontSize: 11,
    fontWeight: '700',
    color: '#A8CCFF',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  eyebrowLocked: {
    color: 'rgba(118, 138, 168, 0.82)',
  },
  headline: {
    fontFamily: FONT.display,
    fontSize: 30,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: 10,
  },
  headlineLocked: {
    color: 'rgba(108, 118, 138, 0.88)',
  },
  cta: {
    marginTop: 18,
    alignSelf: 'center',
    minWidth: 200,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaReady: {
    borderColor: 'rgba(143, 182, 255, 0.55)',
    backgroundColor: COLORS.towerCtaReady,
  },
  ctaCleared: {
    borderColor: 'rgba(198, 167, 94, 0.65)',
    backgroundColor: COLORS.towerCtaCleared,
  },
  ctaLocked: {
    borderColor: 'rgba(55, 65, 82, 0.85)',
    backgroundColor: COLORS.towerCtaLocked,
  },
  ctaText: {
    fontFamily: FONT.body,
    fontSize: 12,
    fontWeight: '800',
    color: '#A4C4FF',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  ctaTextCleared: {
    color: '#DCC495',
  },
  ctaTextLocked: {
    color: '#8A96AC',
  },
});
