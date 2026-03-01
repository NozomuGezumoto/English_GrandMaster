import { Image, View, Text, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { getAvatarUrl } from '../../lib/avatar-utils';

type AvatarSource = { avatarPath?: string; avatarUrl?: string } | null | undefined;

type Props = {
  user: AvatarSource;
  displayName?: string;
  size?: number;
  style?: object;
};

/** avatarPath/avatarUrl を解決して表示するアバター。Storage 対応。 */
export function AvatarImage({ user, displayName = '', size = 44, style }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setUrl(null);
      return;
    }
    getAvatarUrl(user).then(setUrl);
  }, [user?.avatarPath, user?.avatarUrl]);

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }
  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.letter, { fontSize: size * 0.45 }]}>
        {displayName ? displayName.charAt(0).toUpperCase() : '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {},
  placeholder: {
    backgroundColor: '#1B263B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    color: '#C6A75E',
    fontWeight: '700',
  },
});
