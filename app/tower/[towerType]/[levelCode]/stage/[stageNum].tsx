import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  drawDictationTowerStageSession,
  drawGrammarTowerStageSession,
  drawListeningTowerStageSession,
  getTowerStagePoolStats,
  isTowerStagePassed,
  TOWER_STAGE_CLEAR_RATIO,
} from '../../../../../lib/tower-questions';
import {
  getTowerProgressBackgroundSource,
  parseLevelCodeParam,
  parseTowerTypeParam,
  recordTowerStageCleared,
  recordTowerStageMastered,
  type LevelCode,
  type TowerType,
} from '../../../../../lib/tower-progress';
import { playClickSound } from '../../../../../lib/click-sound';
import { TowerScreenBackground } from '../../../../components/tower/TowerScreenBackground';
import {
  TowerChoiceQuizFlow,
  TowerDictationQuizFlow,
  type TowerQuizPassRule,
} from '../../../../components/tower/TowerLevelQuizFlow';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export default function TowerStagePlayScreen() {
  const { towerType: tp, levelCode: lc, stageNum: sn } = useLocalSearchParams<{
    towerType: string;
    levelCode: string;
    stageNum: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 12);
  const safeBottom = Math.max(insets.bottom, 16);

  const towerType = parseTowerTypeParam(tp);
  const code = parseLevelCodeParam(lc);
  const stageRaw = Array.isArray(sn) ? sn[0] : sn;
  const stageNumber = stageRaw ? parseInt(stageRaw, 10) : NaN;

  const goBack = useCallback(() => {
    playClickSound();
    setTimeout(() => router.back(), 20);
  }, [router]);

  if (!towerType || !code || Number.isNaN(stageNumber) || stageNumber < 1 || stageNumber > 10) {
    return (
      <TowerScreenBackground style={styles.flex} backgroundSource={getTowerProgressBackgroundSource(towerType)}>
        <View style={[styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
          <Text style={styles.errTitle}>Invalid stage</Text>
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={() => router.back()}>
            <Text style={styles.btnText}>← Back</Text>
          </Pressable>
        </View>
      </TowerScreenBackground>
    );
  }

  return (
    <TowerStageBody
      towerType={towerType}
      code={code}
      stageNumber={stageNumber}
      safeTop={safeTop}
      safeBottom={safeBottom}
      onBack={goBack}
    />
  );
}

function TowerStageBody({
  towerType,
  code,
  stageNumber,
  safeTop,
  safeBottom,
  onBack,
}: {
  towerType: TowerType;
  code: LevelCode;
  stageNumber: number;
  safeTop: number;
  safeBottom: number;
  onBack: () => void;
}) {
  const [sessionKey, setSessionKey] = useState(0);

  const payload = useMemo(() => {
    if (towerType === 'grammar') {
      return { kind: 'grammar' as const, questions: drawGrammarTowerStageSession(code, stageNumber) };
    }
    if (towerType === 'listening') {
      return { kind: 'listening' as const, questions: drawListeningTowerStageSession(code, stageNumber) };
    }
    return { kind: 'dictation' as const, words: drawDictationTowerStageSession(code, stageNumber) };
  }, [towerType, code, stageNumber, sessionKey]);

  const poolStats = useMemo(
    () => getTowerStagePoolStats(towerType, code, stageNumber),
    [towerType, code, stageNumber]
  );

  const poolSummaryLine = useMemo(() => {
    if (payload.kind === 'dictation') {
      return `Stage pool ${poolStats.stagePool} · This run ${payload.words.length} words`;
    }
    return `Stage pool ${poolStats.stagePool} · This run ${payload.questions.length} questions`;
  }, [payload, poolStats]);

  const onSessionFinished = useCallback(
    ({ correctKeys }: { correctKeys: string[] }) => {
      void recordTowerStageMastered(towerType, code, stageNumber, correctKeys);
    },
    [towerType, code, stageNumber]
  );

  const passRuleBase = useMemo(
    () => ({
      isPassed: isTowerStagePassed,
      resultRuleLine: (total: number) =>
        `Pass: more than ${Math.round(TOWER_STAGE_CLEAR_RATIO * 100)}% (min. ${
          Math.floor(TOWER_STAGE_CLEAR_RATIO * total) + 1
        } / ${total} correct)`,
      successHint: 'Next stage is unlocked.',
      passTitle: 'Stage clear',
      failTitle: 'Not cleared',
      onRecordPass: () => recordTowerStageCleared(towerType, code, stageNumber),
    }),
    [towerType, code, stageNumber]
  );

  const passRuleChoice = useMemo<TowerQuizPassRule>(
    () => ({
      ...passRuleBase,
      sessionRuleLine: (total) =>
        `${total} questions · Pass: >${Math.round(TOWER_STAGE_CLEAR_RATIO * 100)}% correct`,
    }),
    [passRuleBase]
  );

  const passRuleDictation = useMemo<TowerQuizPassRule>(
    () => ({
      ...passRuleBase,
      sessionRuleLine: (total) =>
        `${total} words · Pass: >${Math.round(TOWER_STAGE_CLEAR_RATIO * 100)}% correct`,
    }),
    [passRuleBase]
  );

  const formatStage = useCallback(
    (i: number, t: number) => `${code} · Stage ${stageNumber} · ${i + 1}/${t}`,
    [code, stageNumber]
  );

  if (payload.kind === 'dictation') {
    return (
      <TowerScreenBackground
        style={styles.flex}
        backgroundSource={getTowerProgressBackgroundSource(towerType, code)}
      >
        <TowerDictationQuizFlow
          towerType={towerType}
          levelCode={code}
          words={payload.words}
          safeTop={safeTop}
          safeBottom={safeBottom}
          onBack={onBack}
          onRetrySession={() => setSessionKey((k) => k + 1)}
          formatProgress={formatStage}
          passRule={passRuleDictation}
          poolSummaryLine={poolSummaryLine}
          onSessionFinished={onSessionFinished}
        />
      </TowerScreenBackground>
    );
  }

  return (
    <TowerScreenBackground
      style={styles.flex}
      backgroundSource={getTowerProgressBackgroundSource(towerType, code)}
    >
      <TowerChoiceQuizFlow
        towerType={towerType}
        levelCode={code}
        questions={payload.questions}
        listeningMode={payload.kind === 'listening'}
        safeTop={safeTop}
        safeBottom={safeBottom}
        onBack={onBack}
        onRetrySession={() => setSessionKey((k) => k + 1)}
        formatProgress={formatStage}
        passRule={passRuleChoice}
        poolSummaryLine={poolSummaryLine}
        onSessionFinished={onSessionFinished}
      />
    </TowerScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errTitle: { fontFamily: FONT.display, fontSize: 22, color: '#C6A75E', marginBottom: 20 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C6A75E',
    backgroundColor: 'rgba(10, 14, 22, 0.9)',
  },
  btnPressed: { opacity: 0.88 },
  btnText: { fontFamily: FONT.body, fontSize: 14, fontWeight: '700', color: '#C6A75E' },
});
