import { View, Image, StyleSheet, type ImageSourcePropType } from 'react-native';

/**
 * Treats guardian art as a cropped visual (not a full “card” frame).
 * Wide viewport + oversized `cover` + upward shift hides typical footer typography on source PNGs
 * (e.g. THE HARE / Choice Guardian / A2) so the creature reads as the hero.
 */
export type TowerGuardianHeroVariant = 'boss' | 'gate';

type Props = {
  source?: ImageSourcePropType;
  locked?: boolean;
  variant: TowerGuardianHeroVariant;
  /** Optional warm tint when mastered (Gate list). */
  masteredVeil?: boolean;
};

/** width ÷ height of the visible band — wider = more cinematic, less “tall card floating”. */
const BAND_ASPECT: Record<TowerGuardianHeroVariant, number> = {
  /** Slightly wider vs height than before → boss card a bit shorter. */
  boss: 1.44,
  gate: 1.22,
};

/** Image is larger than the band and shifted so the upper/center subject dominates; bottom is clipped. */
const CROP = {
  widthPct: 118,
  heightPct: 148,
  topPct: -12,
  leftPct: -7,
} as const;

export function TowerGuardianHeroVisual({ source, locked, variant, masteredVeil }: Props) {
  return (
    <View style={[styles.shell, { aspectRatio: BAND_ASPECT[variant] }]}>
      {source ? (
        <Image
          source={source}
          resizeMode="cover"
          style={styles.croppedImage}
        />
      ) : (
        <View style={styles.fallback} />
      )}
      {locked ? <View style={styles.veilLocked} pointerEvents="none" /> : null}
      {!locked && masteredVeil ? <View style={styles.veilMastered} pointerEvents="none" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    backgroundColor: '#03050a',
    overflow: 'hidden',
    position: 'relative',
  },
  croppedImage: {
    position: 'absolute',
    width: `${CROP.widthPct}%`,
    height: `${CROP.heightPct}%`,
    top: `${CROP.topPct}%`,
    left: `${CROP.leftPct}%`,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080c18',
  },
  veilLocked: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 4, 10, 0.58)',
  },
  veilMastered: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 14, 8, 0.28)',
  },
});
