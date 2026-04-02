import { View, Text, StyleSheet, Platform, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import type { LevelCode } from '../../../lib/tower-progress';
import { TowerGuardianHeroVisual } from './TowerGuardianHeroVisual';

const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export type StageBossIdentity = {
  heroSource: ImageSourcePropType | undefined;
  bossName: string;
  levelCode: LevelCode;
};

type Props = StageBossIdentity;

/**
 * ガーディアン対戦・タワー頂ボス戦で共通。GuardianBandCard と同じ情報順（80% 幅・画面連動）。
 */
export function StageBossIdentityCard({ heroSource, bossName, levelCode }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const battleContentInnerW = Math.min(480, Math.max(0, windowWidth - 40));
  const bossCardMaxW = Math.round(battleContentInnerW * 0.8);

  return (
    <View style={[styles.panelWrap, { maxWidth: bossCardMaxW }]}>
      <View style={styles.panel}>
        <TowerGuardianHeroVisual source={heroSource} variant="gate" />
        <View style={styles.meta}>
          <View style={styles.metaTop}>
            <Text style={[styles.fieldLabel, styles.labelCenter]}>STAGE BOSS</Text>
            <View style={styles.levelCenterWrap}>
              <View style={styles.levelInline}>
                <Text style={styles.fieldLabel}>LEVEL </Text>
                <Text style={styles.levelValue}>{levelCode}</Text>
              </View>
            </View>
          </View>
          <View style={styles.nameBlock}>
            <Text style={[styles.fieldLabel, styles.labelCenter]}>BOSS NAME</Text>
            <Text style={styles.guardianName} numberOfLines={2}>
              {bossName}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelWrap: {
    width: '80%',
    alignSelf: 'center',
    marginBottom: 10,
  },
  panel: {
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(143, 182, 255, 0.5)',
    backgroundColor: 'rgba(10, 16, 30, 0.7)',
    overflow: 'hidden',
    width: '100%',
  },
  meta: {
    paddingTop: 13,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(19, 29, 52, 0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(198, 167, 94, 0.32)',
    alignItems: 'stretch',
  },
  metaTop: {
    width: '100%',
    marginBottom: 13,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198, 167, 94, 0.2)',
    alignItems: 'center',
  },
  labelCenter: {
    textAlign: 'center',
    width: '100%',
  },
  levelCenterWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  levelInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: FONT.body,
    fontSize: 9,
    fontWeight: '700',
    color: '#A8CCFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  levelValue: {
    fontFamily: FONT.display,
    fontSize: 19,
    fontWeight: '800',
    color: '#DCC495',
    letterSpacing: 1.6,
  },
  nameBlock: {
    width: '100%',
    marginBottom: 5,
    alignItems: 'center',
  },
  guardianName: {
    fontFamily: FONT.display,
    fontSize: 18,
    fontWeight: '700',
    color: '#D9E6FF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 6,
    textAlign: 'center',
    width: '100%',
  },
});
