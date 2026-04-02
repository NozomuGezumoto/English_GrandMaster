/**
 * Web では React Native の Alert.alert が no-op のため、confirm / 通知用のフォールバック。
 */

import { Platform, Alert } from 'react-native';

export async function confirmAsync(options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const {
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    destructive,
  } = options;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return false;
    return window.confirm(`${title}\n\n${message}`);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function alertMessage(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(message ? `${title}\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}

/** OK 後にコールバック（一覧へ遷移など）。Web では alert 閉じた直後に実行。 */
export function alertWithOkButton(title: string, message: string, onOk: () => void): void {
  if (Platform.OS === 'web') {
    alertMessage(title, message);
    onOk();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
}
