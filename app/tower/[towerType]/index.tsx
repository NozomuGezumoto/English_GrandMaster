import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playClickSound } from '../../../lib/click-sound';
import {
  buildTowerLevelsForType,
  getTowerProgressBackgroundSource,
  getTowerProgressState,
  getTowerLevelListIcons,
  parseTowerTypeParam,
  TOWER_TYPE_LABELS,
  type TowerLevelRow,
} from '../../../lib/tower-progress';
import { COLORS } from '../../../lib/theme';
import { alertMessage } from '../../../lib/platform-dialog';
import { TowerScreenBackground } from '../../components/tower/TowerScreenBackground';
import { TowerLevelCard } from '../../components/tower/TowerLevelCard';
import { TowerConnector } from '../../components/tower/TowerConnector';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

function connectorVariant(lower: TowerLevelRow, upper: TowerLevelRow): 'dim' | 'active' {
  if (lower.learningStatus === 'locked' && upper.learningStatus === 'locked') return 'dim';
  return 'active';
}

export default function SingleTowerProgressScreen() {
  const { towerType: towerTypeParam } = useLocalSearchParams<{ towerType: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 12);
  const safeBottom = Math.max(insets.bottom, 16);

  const towerType = parseTowerTypeParam(towerTypeParam);
  const state = getTowerProgressState();

  const goSelect = () => {
    playClickSound();
    setTimeout(() => router.replace('/tower'), 20);
  };

  if (!towerType) {
    return (
      <TowerScreenBackground style={styles.flex} backgroundSource={getTowerProgressBackgroundSource(null)}>
        <View style={[styles.center, styles.centerFullWidth, { paddingTop: safeTop }]}>
          <Text style={styles.errTitle}>Unknown tower</Text>
          <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]} onPress={goSelect}>
            <Text style={styles.backBtnText}>← Tower select</Text>
          </Pressable>
        </View>
      </TowerScreenBackground>
    );
  }

  const levels = buildTowerLevelsForType(towerType, state);

  const onLevelPress = (level: TowerLevelRow) => {
    if (level.learningStatus === 'locked') {
      alertMessage('Sealed', 'Clear the previous band in this tower to unlock.');
      return;
    }
    router.push(`/tower/${towerType}/${level.code}`);
  };

  return (
    <TowerScreenBackground
      style={styles.flex}
      backgroundSource={getTowerProgressBackgroundSource(towerType)}
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
            contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.headline}>{TOWER_TYPE_LABELS[towerType]}</Text>

            <View style={styles.list}>
              {levels.map((level, index) => {
                const next = levels[index + 1];
                return (
                  <View key={level.id} style={styles.step}>
                    <TowerLevelCard
                      level={level}
                      guardianIcon={getTowerLevelListIcons(towerType)[level.code]}
                      onPress={() => onLevelPress(level)}
                    />
                    {next ? <TowerConnector variant={connectorVariant(level, next)} /> : null}
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
  scrollContent: { width: '100%', paddingTop: 22 },
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
  headline: {
    fontFamily: FONT.display,
    fontSize: 22,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  list: { gap: 0 },
  step: { marginBottom: 0 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  centerFullWidth: { width: '100%', alignSelf: 'stretch' },
  errTitle: {
    fontFamily: FONT.display,
    fontSize: 24,
    color: COLORS.gold,
    letterSpacing: 1,
  },
});
