import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

type Props = {
  title: string;
  onPress: () => void;
};

export function TowerPickCard({ title, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.glowLine} />
      <View style={styles.inner}>
        <Text style={styles.title}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.5)',
    backgroundColor: 'rgba(18, 26, 38, 0.94)',
    overflow: 'hidden',
    width: '100%',
  },
  cardPressed: {
    opacity: 0.9,
    borderColor: 'rgba(224, 195, 122, 0.65)',
  },
  glowLine: {
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(100, 140, 190, 0.14)',
  },
  inner: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  title: {
    fontFamily: FONT.display,
    fontSize: 17,
    fontWeight: '700',
    color: '#DCC495',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
