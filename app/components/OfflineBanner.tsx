import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../lib/theme';

type NetInfoSub = () => void;
let netInfoModule: { addEventListener: (cb: (s: { isConnected: boolean | null }) => void) => NetInfoSub } | null = null;
try {
  netInfoModule = require('@react-native-community/netinfo').default;
} catch {
  // 未インストール時はバナーを出さない（オプション）
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!netInfoModule) return;
    const unsubscribe = netInfoModule.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You are offline</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.incorrect,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  text: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
