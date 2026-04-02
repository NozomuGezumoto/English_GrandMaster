import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playClickSound } from '../../../../lib/click-sound';
import {
  buildTowerStagesForLevel,
  getTowerBossHeroSource,
  getTowerProgressBackgroundSource,
  getTowerProgressState,
  getTowerStageMasteredCount,
  isLearningLevelUnlocked,
  parseLevelCodeParam,
  parseTowerTypeParam,
  getTowerBossSummitHeadline,
  TOWER_LEVEL_TITLES,
  TOWER_TYPE_LABELS,
  type TowerStage,
} from '../../../../lib/tower-progress';
import { COLORS } from '../../../../lib/theme';
import { alertMessage } from '../../../../lib/platform-dialog';
import { getTowerStagePoolStats } from '../../../../lib/tower-questions';
import { TowerScreenBackground } from '../../../components/tower/TowerScreenBackground';
import { StageCard } from '../../../components/tower/StageCard';
import { BossCard } from '../../../components/tower/BossCard';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export default function TowerLevelDetailScreen() {
  const { towerType: towerTypeParam, levelCode: levelCodeParam } = useLocalSearchParams<{
    towerType: string;
    levelCode: string;
  }>();
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

  const towerType = parseTowerTypeParam(towerTypeParam);
  const code = parseLevelCodeParam(levelCodeParam);
  const state = getTowerProgressState();

  const goToTowerProgress = () => {
    if (towerType) router.replace(`/tower/${towerType}`);
    else router.replace('/tower');
  };

  const goToSelect = () => router.replace('/tower');

  if (!towerType || !code) {
    return (
      <TowerScreenBackground
        style={styles.flex}
        backgroundSource={getTowerProgressBackgroundSource(towerType)}
      >
        <View style={[styles.center, styles.centerFullWidth, { paddingTop: safeTop }]}>
          <Text style={styles.errTitle}>Unknown route</Text>
          <Pressable
            style={({ pressed }) => [styles.towerBackBtn, styles.errBtn, pressed && styles.towerBackBtnPressed]}
            onPress={goToSelect}
          >
            <Text style={styles.towerBackBtnText}>← Tower select</Text>
          </Pressable>
        </View>
      </TowerScreenBackground>
    );
  }

  if (!isLearningLevelUnlocked(towerType, code, state)) {
    return (
      <TowerScreenBackground
        style={styles.flex}
        backgroundSource={getTowerProgressBackgroundSource(towerType, code)}
      >
        <View style={[styles.center, styles.centerFullWidth, { paddingTop: safeTop }]}>
          <Text style={styles.errTitle}>Sealed</Text>
          <Text style={styles.errBody}>Clear the previous band in this tower first.</Text>
          <Pressable
            style={({ pressed }) => [styles.towerBackBtn, styles.errBtn, pressed && styles.towerBackBtnPressed]}
            onPress={goToTowerProgress}
          >
            <Text style={styles.towerBackBtnText}>← Back</Text>
          </Pressable>
        </View>
      </TowerScreenBackground>
    );
  }

  const row = state.byTower[towerType][code];
  const stages = buildTowerStagesForLevel(towerType, code, state);
  const floors = stages.filter((s) => !s.isBoss);
  const floorsDesc = [...floors].reverse();
  const boss = stages.find((s) => s.isBoss);

  const onStagePress = (stage: TowerStage) => {
    if (stage.status === 'locked') {
      alertMessage('Sealed', 'Complete the prior stage to proceed.');
      return;
    }
    if (stage.isBoss) {
      playClickSound();
      setTimeout(() => {
        router.push(`/tower/${towerType}/${code}/boss`);
      }, 20);
      return;
    }
    playClickSound();
    setTimeout(() => {
      router.push(`/tower/${towerType}/${code}/stage/${stage.stageNumber}`);
    }, 20);
  };

  return (
    <TowerScreenBackground
      style={styles.flex}
      backgroundSource={getTowerProgressBackgroundSource(towerType, code)}
    >
      <View style={styles.screenInner}>
        <View style={styles.centerColumn}>
          <View style={[styles.topBar, { paddingTop: safeTop }]}>
            <Pressable
              style={({ pressed }) => [styles.towerBackBtn, pressed && styles.towerBackBtnPressed]}
              onPress={goToTowerProgress}
            >
              <Text style={styles.towerBackBtnText}>← {TOWER_TYPE_LABELS[towerType]}</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottom + 32 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.levelCode}>{code}</Text>
            <Text style={styles.title}>{TOWER_LEVEL_TITLES[code]}</Text>
            {row.bossCleared ? <Text style={styles.bossDone}>Tower boss defeated</Text> : null}

            <Text style={styles.sectionLabel}>Summit</Text>
            {boss ? (
              <BossCard
                stage={boss}
                heroSource={getTowerBossHeroSource(towerType, code)}
                summitHeadline={getTowerBossSummitHeadline(towerType, code)}
                onPress={() => onStagePress(boss)}
              />
            ) : null}

            <Text style={styles.sectionLabel}>Stages</Text>
            <View style={styles.grid}>
              {floorsDesc.map((stage) => {
                const { stagePool } = getTowerStagePoolStats(towerType, code, stage.stageNumber);
                const mastered = getTowerStageMasteredCount(state, towerType, code, stage.stageNumber);
                const shown = Math.min(mastered, stagePool);
                return (
                  <View key={stage.id} style={styles.gridItem}>
                    <StageCard
                      stage={stage}
                      onPress={() => onStagePress(stage)}
                      poolHint={`${shown}/${stagePool}`}
                    />
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
  towerBackBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.78)',
    backgroundColor: 'rgba(10, 14, 22, 0.9)',
  },
  towerBackBtnPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(14, 20, 30, 0.95)',
    borderColor: 'rgba(224, 195, 122, 0.9)',
  },
  towerBackBtnText: {
    fontFamily: FONT.body,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 0.35,
  },
  errBtn: { alignSelf: 'center', marginTop: 28 },
  scrollContent: { width: '100%', paddingTop: 22 },
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
  errBody: {
    fontFamily: FONT.body,
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  levelCode: {
    fontFamily: FONT.display,
    fontSize: 36,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 4,
    includeFontPadding: false,
  },
  title: {
    fontFamily: FONT.display,
    fontSize: 14,
    color: '#F2F6FF',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  bossDone: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: 'rgba(224, 198, 140, 0.95)',
    marginTop: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    fontFamily: FONT.body,
    fontSize: 10,
    color: '#A0AEC0',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 10,
  },
  grid: { gap: 10 },
  gridItem: { width: '100%' },
});
