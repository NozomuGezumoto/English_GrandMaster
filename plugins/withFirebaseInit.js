/**
 * FirebaseApp.configure() を AppDelegate に追加するプラグイン。
 * @react-native-firebase/app のプラグインが Expo SDK 54 の AppDelegate 形式に対応しておらず
 * 挿入をスキップするため、このカスタムプラグインで追加する。
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

function withFirebaseInit(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appDelegatePath = path.join(
        projectRoot,
        'ios',
        'EnglishGrandMaster',
        'AppDelegate.swift'
      );

      try {
        let contents = fs.readFileSync(appDelegatePath, 'utf8');

        if (contents.includes('FirebaseApp.configure()')) {
          return config; // 既に追加済み
        }

        // Expo SDK 54 形式: ) -> Bool { の直後、let delegate の前に追加
        const anchor = ') -> Bool {\n    let delegate = ReactNativeDelegate()';
        const replacement = ') -> Bool {\n    FirebaseApp.configure()\n    let delegate = ReactNativeDelegate()';

        if (contents.includes(anchor)) {
          contents = contents.replace(anchor, replacement);
        } else {
          console.warn('[withFirebaseInit] Could not find insertion point in AppDelegate.swift');
          return config;
        }

        fs.writeFileSync(appDelegatePath, contents);
        console.log('[withFirebaseInit] Added FirebaseApp.configure() to AppDelegate.swift');
      } catch (e) {
        console.warn('[withFirebaseInit] Failed to modify AppDelegate:', e.message);
      }

      return config;
    },
  ]);
}

module.exports = withFirebaseInit;
