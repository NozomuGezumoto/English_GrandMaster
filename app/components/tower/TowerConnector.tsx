import { View, StyleSheet } from 'react-native';
import { COLORS } from '../../../lib/theme';

type Props = {
  variant?: 'default' | 'dim' | 'active';
};

export function TowerConnector({ variant = 'default' }: Props) {
  const dim = variant === 'dim';
  const active = variant === 'active';
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.line,
          dim && styles.lineDim,
          active && styles.lineActive,
        ]}
      />
      <View style={[styles.node, dim && styles.nodeDim, active && styles.nodeActive]} />
      <View style={[styles.spark, active && styles.sparkActive]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
  },
  line: {
    width: 2,
    flex: 1,
    maxHeight: 22,
    backgroundColor: COLORS.border,
    borderRadius: 1,
  },
  lineDim: {
    backgroundColor: 'rgba(42, 61, 90, 0.45)',
  },
  lineActive: {
    backgroundColor: 'rgba(120, 160, 210, 0.42)',
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  node: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.22)',
  },
  nodeDim: {
    backgroundColor: 'rgba(30, 40, 55, 0.9)',
    borderColor: 'rgba(80, 90, 110, 0.4)',
  },
  nodeActive: {
    backgroundColor: 'rgba(143, 182, 255, 0.25)',
    borderColor: COLORS.cyan,
  },
  spark: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    top: 10,
    opacity: 0,
  },
  sparkActive: {
    opacity: 0.45,
    backgroundColor: COLORS.cyan,
  },
});
