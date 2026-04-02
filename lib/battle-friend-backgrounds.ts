import type { ImageSourcePropType } from 'react-native';

/** フレンドマッチ画面でランダム表示するヒーロー背景（assets/battle2） */
const FRIEND_BATTLE_BACKGROUNDS: ImageSourcePropType[] = [
  require('../assets/battle2/friend1.png'),
  require('../assets/battle2/friend2.png'),
  require('../assets/battle2/friend3.png'),
];

export function pickRandomFriendBattleBackground(): ImageSourcePropType {
  return FRIEND_BATTLE_BACKGROUNDS[Math.floor(Math.random() * FRIEND_BATTLE_BACKGROUNDS.length)]!;
}
