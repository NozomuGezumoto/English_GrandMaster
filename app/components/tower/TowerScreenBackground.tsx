import type { ReactNode } from 'react';
import {
  ImageBackground,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { COLORS } from '../../../lib/theme';

/** Default trial backdrop — candidate art; readability via overlays (UI-forward). */
const TOWER_HERO = require('../../../assets/tower/trial-tower.png');

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Per-tower art (e.g. Grammar Tower). Omit for default. */
  backgroundSource?: ImageSourcePropType;
};

/**
 * Background sits slightly back (image opacity); uniform black + navy veils (no banding).
 * Keeps black-navy / gold / cyan mood while prioritizing foreground UI.
 */
export function TowerScreenBackground({ children, style, backgroundSource }: Props) {
  return (
    <ImageBackground
      source={backgroundSource ?? TOWER_HERO}
      style={[styles.root, style]}
      imageStyle={styles.image}
      resizeMode="cover"
    >
      <View style={styles.blackVeil} pointerEvents="none" />
      <View style={styles.navyVeil} pointerEvents="none" />
      <View style={styles.contentShell}>{children}</View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  image: {
    width: '100%',
    height: '100%',
    opacity: 0.78,
  },
  blackVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  navyVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 7, 12, 0.48)',
  },
  contentShell: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
});
