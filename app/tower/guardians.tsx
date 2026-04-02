import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playClickSound } from '../../lib/click-sound';
import {
  buildGuardianRows,
  getTowerProgressBackgroundSource,
  getTowerProgressState,
  TOWER_GUARDIAN_CARD_ART,
  TOWER_LEVEL_OVERVIEW_ORDER,
  type GuardianRow,
} from '../../lib/tower-progress';
import { COLORS } from '../../lib/theme';
import { alertMessage } from '../../lib/platform-dialog';
import { TowerScreenBackground } from '../components/tower/TowerScreenBackground';
import { GuardianBandCard } from '../components/tower/GuardianBandCard';
import { TowerConnector } from '../components/tower/TowerConnector';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export default function GuardianProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 12);
  const safeBottom = Math.max(insets.bottom, 16);
  const [, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusTick((n) => n + 1);
    }, [])
  );

  const state = getTowerProgressState();
  const rows = buildGuardianRows(state);

  const goSelect = () => {
    playClickSound();
    setTimeout(() => router.replace('/tower'), 20);
  };

  const onGuardianPress = (row: GuardianRow) => {
    if (row.status === 'locked') {
      alertMessage(
        'Sealed',
        `Clear all three towers at ${row.code} (tower bosses) to unlock this guardian.`
      );
      return;
    }
    playClickSound();
    setTimeout(() => {
      router.push(`/tower/guardian/${row.code}`);
    }, 20);
  };

  return (
    <TowerScreenBackground
      style={styles.flex}
      backgroundSource={getTowerProgressBackgroundSource('guardian')}
    >
      <View style={styles.screenInner}>
        <View style={styles.centerColumn}>
          <View style={[styles.topBar, { paddingTop: safeTop }]}>
            <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]} onPress={goSelect}>
              <Text style={styles.backBtnText}>← Towers</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={[styles.scroll, { paddingBottom: safeBottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.kicker}>Mastery track</Text>
            <Text style={styles.headline}>Guardian Gate</Text>
            <Text style={styles.lede}>
              Defeat a guardian to formally master a band. You can keep climbing each tower before facing them.
            </Text>

            <View style={styles.list}>
              {TOWER_LEVEL_OVERVIEW_ORDER.map((code, index) => {
                const row = rows.find((r) => r.code === code)!;
                const nextCode = TOWER_LEVEL_OVERVIEW_ORDER[index + 1];
                const nextRow = nextCode ? rows.find((r) => r.code === nextCode) : null;
                return (
                  <View key={row.id}>
                    <GuardianBandCard
                      row={row}
                      heroSource={TOWER_GUARDIAN_CARD_ART[row.code]}
                      onPress={() => onGuardianPress(row)}
                    />
                    {nextRow ? <TowerConnector variant={row.status === 'locked' && nextRow.status === 'locked' ? 'dim' : 'active'} /> : null}
                  </View>
                );
              })}
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
  scroll: { width: '100%', paddingTop: 22 },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.78)',
    backgroundColor: 'rgba(10, 14, 22, 0.9)',
  },
  backBtnPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(14, 20, 30, 0.95)',
    borderColor: 'rgba(224, 195, 122, 0.9)',
  },
  backBtnText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 0.35,
  },
  kicker: {
    fontFamily: FONT.body,
    fontSize: 10,
    color: '#A8CCFF',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headline: {
    fontFamily: FONT.display,
    fontSize: 26,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  lede: {
    fontFamily: FONT.body,
    fontSize: 13,
    color: '#B6C2D8',
    marginTop: 10,
    lineHeight: 20,
    marginBottom: 18,
    letterSpacing: 0.2,
  },
  list: { gap: 0 },
});
