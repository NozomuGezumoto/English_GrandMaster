import type { ImageSourcePropType } from 'react-native';

/** AI 対戦マッチ画面でランダム表示するヒーロー背景（assets/battle の 3 枚のみ） */
const AI_BATTLE_BACKGROUNDS: ImageSourcePropType[] = [
  require('../assets/battle/ai1.png'),
  require('../assets/battle/ai2.png'),
  require('../assets/battle/ai3.png'),
];

export function pickRandomAiBattleBackground(): ImageSourcePropType {
  return AI_BATTLE_BACKGROUNDS[Math.floor(Math.random() * AI_BATTLE_BACKGROUNDS.length)]!;
}
