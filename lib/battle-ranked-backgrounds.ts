import type { ImageSourcePropType } from 'react-native';

/** ランクマッチ画面でランダム表示するヒーロー背景（assets/battle3） */
const RANKED_BATTLE_BACKGROUNDS: ImageSourcePropType[] = [
  require('../assets/battle3/ranked1.png'),
  require('../assets/battle3/ranked2.png'),
  require('../assets/battle3/ranked3.png'),
];

export function pickRandomRankedBattleBackground(): ImageSourcePropType {
  return RANKED_BATTLE_BACKGROUNDS[Math.floor(Math.random() * RANKED_BATTLE_BACKGROUNDS.length)]!;
}
