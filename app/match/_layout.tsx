import { MatchStackWithHeroBackground } from './MatchHeroBackground';

/**
 * ヒーロー背景: AI → assets/battle、ランクマ → battle3、フレンド → battle2（各 3 枚ランダム）。他はデフォルト塔アート。
 */
export default function MatchLayout() {
  return <MatchStackWithHeroBackground />;
}
