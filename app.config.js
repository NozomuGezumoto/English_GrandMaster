/**
 * Expo 設定（app.json をベースに環境で上書き）
 * - EXPO_PUBLIC_USE_EMULATOR === 'true' のときだけエミュレータ接続（開発用）
 * - 未設定またはそれ以外なら useEmulator: false（本番ビルドで安全）
 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    useEmulator: process.env.EXPO_PUBLIC_USE_EMULATOR === 'true',
  },
});
