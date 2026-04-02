import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { COLORS } from '../../../lib/theme';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

type Props = {
  defeatedCount: number;
  total: number;
  onPress: () => void;
};

export function GuardianGateCard({ defeatedCount, total, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.goldLine} />
      <View style={styles.inner}>
        <Text style={styles.title}>Guardian Gate</Text>
        <Text style={styles.progress}>
          {defeatedCount} / {total} Guardians defeated
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.65)',
    backgroundColor: 'rgba(14, 20, 34, 0.88)',
    overflow: 'hidden',
    width: '100%',
  },
  cardPressed: {
    opacity: 0.9,
  },
  goldLine: {
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(198, 167, 94, 0.28)',
  },
  inner: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  title: {
    fontFamily: FONT.display,
    fontSize: 18,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progress: {
    fontFamily: FONT.body,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.cyan,
    marginTop: 10,
    letterSpacing: 0.3,
  },
});
