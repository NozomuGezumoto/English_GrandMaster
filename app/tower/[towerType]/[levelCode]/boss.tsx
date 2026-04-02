import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  drawDictationTowerBossSession,
  drawGrammarTowerBossSession,
  drawListeningTowerBossSession,
  getTowerBossPoolStats,
  isTowerBossPassed,
  TOWER_BOSS_CLEAR_MIN_CORRECT,
} from '../../../../lib/tower-questions';
import {
  getTowerBossHeroSource,
  getTowerBossSummitHeadline,
  getTowerProgressBackgroundSource,
  parseLevelCodeParam,
  parseTowerTypeParam,
  recordTowerBossCleared,
  type LevelCode,
  type TowerType,
} from '../../../../lib/tower-progress';
import { playClickSound } from '../../../../lib/click-sound';
import { TowerScreenBackground } from '../../../components/tower/TowerScreenBackground';
import {
  TowerChoiceQuizFlow,
  TowerDictationQuizFlow,
  type TowerQuizPassRule,
} from '../../../components/tower/TowerLevelQuizFlow';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export default function TowerBossPlayScreen() {
  const { towerType: tp, levelCode: lc } = useLocalSearchParams<{
    towerType: string;
    levelCode: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 12);
  const safeBottom = Math.max(insets.bottom, 16);

  const towerType = parseTowerTypeParam(tp);
  const code = parseLevelCodeParam(lc);

  const goBack = useCallback(() => {
    playClickSound();
    setTimeout(() => router.back(), 20);
  }, [router]);

  if (!towerType || !code) {
    return (
      <TowerScreenBackground style={styles.flex} backgroundSource={getTowerProgressBackgroundSource(towerType)}>
        <View style={[styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
          <Text style={styles.errTitle}>Unknown boss route</Text>
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={() => router.back()}>
            <Text style={styles.btnText}>← Back</Text>
          </Pressable>
        </View>
      </TowerScreenBackground>
    );
  }

  return (
    <TowerBossBody
      towerType={towerType}
      code={code}
      safeTop={safeTop}
      safeBottom={safeBottom}
      onBack={goBack}
    />
  );
}

function TowerBossBody({
  towerType,
  code,
  safeTop,
  safeBottom,
  onBack,
}: {
  towerType: TowerType;
  code: LevelCode;
  safeTop: number;
  safeBottom: number;
  onBack: () => void;
}) {
  const [sessionKey, setSessionKey] = useState(0);

  const payload = useMemo(() => {
    if (towerType === 'grammar') {
      return { kind: 'grammar' as const, questions: drawGrammarTowerBossSession(code) };
    }
    if (towerType === 'listening') {
      return { kind: 'listening' as const, questions: drawListeningTowerBossSession(code) };
    }
    return { kind: 'dictation' as const, words: drawDictationTowerBossSession(code) };
  }, [towerType, code, sessionKey]);

  const poolStats = useMemo(() => getTowerBossPoolStats(towerType, code), [towerType, code]);

  const poolSummaryLine = useMemo(() => {
    if (payload.kind === 'dictation') {
      return `Boss pool (full band) ${poolStats.bandTotal} · This run ${payload.words.length} words`;
    }
    return `Boss pool (full band) ${poolStats.bandTotal} · This run ${payload.questions.length} questions`;
  }, [payload, poolStats]);

  const stageBossIdentity = useMemo(
    () => ({
      heroSource: getTowerBossHeroSource(towerType, code),
      bossName: getTowerBossSummitHeadline(towerType, code),
      levelCode: code,
    }),
    [towerType, code]
  );

  const passRuleBase = useMemo(
    () => ({
      isPassed: isTowerBossPassed,
      resultRuleLine: (total: number) => {
        const need = Math.min(TOWER_BOSS_CLEAR_MIN_CORRECT, total);
        return `Pass: at least ${need} / ${total} correct`;
      },
      successHint: 'Tower boss defeated for this band.',
      passTitle: 'Boss defeated',
      failTitle: 'Not cleared',
      onRecordPass: () => recordTowerBossCleared(towerType, code),
    }),
    [towerType, code]
  );

  const passRuleChoice = useMemo<TowerQuizPassRule>(
    () => ({
      ...passRuleBase,
      sessionRuleLine: (total) =>
        `${total} random questions (all stages) · Pass: ${TOWER_BOSS_CLEAR_MIN_CORRECT}+ correct`,
    }),
    [passRuleBase]
  );

  const passRuleDictation = useMemo<TowerQuizPassRule>(
    () => ({
      ...passRuleBase,
      sessionRuleLine: (total) =>
        `${total} random words (all stages) · Pass: ${TOWER_BOSS_CLEAR_MIN_CORRECT}+ correct`,
    }),
    [passRuleBase]
  );

  const formatBoss = useCallback((i: number, t: number) => `${code} · Boss · ${i + 1}/${t}`, [code]);

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
          formatProgress={formatBoss}
          passRule={passRuleDictation}
          poolSummaryLine={poolSummaryLine}
          stageBossIdentity={stageBossIdentity}
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
        formatProgress={formatBoss}
        passRule={passRuleChoice}
        poolSummaryLine={poolSummaryLine}
        stageBossIdentity={stageBossIdentity}
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
