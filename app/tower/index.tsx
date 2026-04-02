import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playClickSound } from '../../lib/click-sound';
import {
  countGuardiansMastered,
  getTowerProgressState,
  TOWER_LEVEL_ORDER,
  TOWER_TYPE_LABELS,
  TOWER_TYPES,
} from '../../lib/tower-progress';
import { COLORS } from '../../lib/theme';
import { TowerScreenBackground } from '../components/tower/TowerScreenBackground';
import { TowerPickCard } from '../components/tower/TowerPickCard';
import { GuardianGateCard } from '../components/tower/GuardianGateCard';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export default function TowerSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 12);
  const safeBottom = Math.max(insets.bottom, 16);

  const state = getTowerProgressState();
  const defeated = countGuardiansMastered(state);
  const total = TOWER_LEVEL_ORDER.length;

  const goHome = () => {
    playClickSound();
    setTimeout(() => router.replace('/(tabs)/battle'), 20);
  };

  return (
    <TowerScreenBackground style={styles.flex}>
      <View style={styles.screenInner}>
        <View style={styles.centerColumn}>
          <View style={[styles.topBar, { paddingTop: safeTop }]}>
            <Pressable style={({ pressed }) => [styles.homeBackBtn, pressed && styles.homeBackBtnPressed]} onPress={goHome}>
              <Text style={styles.homeBackBtnText}>← Home</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.headline}>Tower select</Text>

            <View style={styles.cardStack}>
              {TOWER_TYPES.map((t) => (
                <View key={t} style={styles.cardGap}>
                  <TowerPickCard
                    title={TOWER_TYPE_LABELS[t]}
                    onPress={() => {
                      playClickSound();
                      setTimeout(() => router.push(`/tower/${t}`), 20);
                    }}
                  />
                </View>
              ))}
              <View style={styles.cardGap}>
                <GuardianGateCard
                  defeatedCount={defeated}
                  total={total}
                  onPress={() => {
                    playClickSound();
                    setTimeout(() => router.push('/tower/guardians'), 20);
                  }}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </TowerScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenInner: { flex: 1, width: '100%', minHeight: 0 },
  centerColumn: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 20,
    minHeight: 0,
  },
  topBar: { paddingBottom: 20, width: '100%' },
  scrollFlex: { flex: 1, width: '100%', minHeight: 0 },
  scrollContent: { width: '100%', paddingTop: 22 },
  homeBackBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.78)',
    backgroundColor: 'rgba(10, 14, 22, 0.9)',
  },
  homeBackBtnPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(14, 20, 30, 0.95)',
    borderColor: 'rgba(224, 195, 122, 0.9)',
  },
  homeBackBtnText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 0.35,
  },
  headline: {
    fontFamily: FONT.display,
    fontSize: 28,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  cardStack: { width: '100%' },
  cardGap: { marginBottom: 14 },
});
