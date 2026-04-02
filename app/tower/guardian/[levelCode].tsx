import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playClickSound } from '../../../lib/click-sound';
import {
  deriveGuardianBandStatus,
  getTowerProgressBackgroundSource,
  getTowerProgressState,
  parseLevelCodeParam,
  recordGuardianDefeated,
  TOWER_GUARDIAN_NAMES,
  TOWER_LEVEL_TITLES,
  type LevelCode,
} from '../../../lib/tower-progress';
import { TowerScreenBackground } from '../../components/tower/TowerScreenBackground';
import { GuardianQuizMedley } from '../../components/tower/GuardianQuizMedley';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export default function GuardianDuelScreen() {
  const { levelCode: lc } = useLocalSearchParams<{ levelCode: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, 12);
  const safeBottom = Math.max(insets.bottom, 16);
  const [, setTick] = useState(0);

  const raw = Array.isArray(lc) ? lc[0] : lc;
  const code = parseLevelCodeParam(raw ?? '');
  const state = getTowerProgressState();
  const status = code ? deriveGuardianBandStatus(code, state) : 'locked';

  const goBack = useCallback(() => {
    playClickSound();
    setTimeout(() => router.back(), 20);
  }, [router]);

  const onVictory = useCallback(async () => {
    if (!code) return;
    await recordGuardianDefeated(code);
    setTick((n) => n + 1);
  }, [code]);

  if (!code) {
    return (
      <TowerScreenBackground style={styles.flex} backgroundSource={getTowerProgressBackgroundSource('guardian')}>
        <View style={[styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
          <Text style={styles.errTitle}>Unknown guardian</Text>
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={goBack}>
            <Text style={styles.btnText}>← Back</Text>
          </Pressable>
        </View>
      </TowerScreenBackground>
    );
  }

  if (status === 'locked') {
    return (
      <TowerScreenBackground
        style={styles.flex}
        backgroundSource={getTowerProgressBackgroundSource('guardian', code)}
      >
        <View style={[styles.center, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
          <Text style={styles.errTitle}>Sealed</Text>
          <Text style={styles.errBody}>Clear all three towers at {code} (tower bosses) first.</Text>
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={goBack}>
            <Text style={styles.btnText}>← Back</Text>
          </Pressable>
        </View>
      </TowerScreenBackground>
    );
  }

  return (
    <GuardianDuelBody
      code={code}
      safeTop={safeTop}
      safeBottom={safeBottom}
      onBack={goBack}
      onVictory={onVictory}
    />
  );
}

function GuardianDuelBody({
  code,
  safeTop,
  safeBottom,
  onBack,
  onVictory,
}: {
  code: LevelCode;
  safeTop: number;
  safeBottom: number;
  onBack: () => void;
  onVictory: () => Promise<void>;
}) {
  const [sessionKey, setSessionKey] = useState(0);
  const name = TOWER_GUARDIAN_NAMES[code];
  const title = TOWER_LEVEL_TITLES[code];

  return (
    <TowerScreenBackground
      style={styles.flex}
      backgroundSource={getTowerProgressBackgroundSource('guardian', code)}
    >
      <View style={[styles.banner, { paddingTop: safeTop }]}>
        <Text style={styles.bannerKicker}>Guardian Gate</Text>
        <Text style={styles.bannerTitle}>
          {name} · {code}
        </Text>
        <Text style={styles.bannerSub}>{title}</Text>
      </View>
      <GuardianQuizMedley
        levelCode={code}
        safeTop={12}
        safeBottom={safeBottom}
        sessionKey={sessionKey}
        onBack={onBack}
        onRetrySession={() => setSessionKey((k) => k + 1)}
        onVictory={onVictory}
      />
    </TowerScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  banner: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198, 167, 94, 0.22)',
    backgroundColor: 'rgba(8, 12, 20, 0.65)',
  },
  bannerKicker: {
    fontFamily: FONT.body,
    fontSize: 10,
    color: '#A8CCFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  bannerTitle: {
    fontFamily: FONT.display,
    fontSize: 18,
    fontWeight: '700',
    color: '#DCC495',
    marginTop: 4,
  },
  bannerSub: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: 'rgba(180, 196, 218, 0.9)',
    marginTop: 2,
    marginBottom: 8,
  },
  errTitle: { fontFamily: FONT.display, fontSize: 22, color: '#C6A75E', marginBottom: 12 },
  errBody: {
    fontFamily: FONT.body,
    fontSize: 14,
    color: '#B6C2D8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
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
