import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import Constants from 'expo-constants';
import { auth, functions } from '../lib/firebase';
import { uploadAvatarToStorage } from '../lib/avatar-utils';
import { httpsCallable } from 'firebase/functions';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { User as FirestoreUser } from '../types/firestore';
import { COUNTRIES } from '../lib/countries';
import { COLORS } from '../lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMimeType, setAvatarMimeType] = useState<string>('image/jpeg');
  const [selectedCountry, setSelectedCountry] = useState<string>('JP');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // アバター画像を選択
  const pickImage = async () => {
    try {
      // Webブラウザではファイル入力を使用
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event: any) => {
              setAvatarUri(event.target.result);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
        return;
      }

      // モバイルではexpo-image-pickerを使用（動的インポートでネイティブモジュール未対応時も画面は表示される）
      const ImagePicker = await import('expo-image-picker');
      const requestPerms = ImagePicker.requestMediaLibraryPermissionsAsync ?? (ImagePicker as any).default?.requestMediaLibraryPermissionsAsync;
      if (typeof requestPerms !== 'function') {
        Alert.alert('Error', 'Image picker is not available. Rebuild the app with: eas build --profile development --platform ios');
        return;
      }
      const { status } = await requestPerms();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Camera roll access is needed to select an image');
        return;
      }

      const launchPicker = ImagePicker.launchImageLibraryAsync ?? (ImagePicker as any).default?.launchImageLibraryAsync;
      if (typeof launchPicker !== 'function') {
        Alert.alert('Error', 'Image picker is not available. Rebuild the app with: eas build --profile development --platform ios');
        return;
      }
      const result = await launchPicker({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAvatarUri(asset.uri);
        setAvatarMimeType(asset.mimeType ?? (asset.fileName?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'));
      }
    } catch (error: any) {
      console.error('Image picker error:', error);
      const msg = error?.message?.includes('ExponentImagePicker') || error?.message?.includes('native module')
        ? 'Image picker requires a development build. Install the latest build from EAS.'
        : 'Failed to select image';
      Alert.alert('Error', msg);
    }
  };

  const handleCreateAccount = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (!displayName) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }

    try {
      setLoading(true);

      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: displayName,
      });

      await user.getIdToken(true);

      let avatarPath: string | undefined;
      if (avatarUri) {
        try {
          const res = await uploadAvatarToStorage(user.uid, avatarUri, avatarMimeType);
          avatarPath = res.avatarPath;
        } catch (uploadErr: any) {
          console.warn('[Login] Avatar upload failed:', uploadErr);
        }
      }

      const createUserDoc = httpsCallable<
        { uid: string; displayName: string; country: string; avatarPath?: string },
        { ok: boolean }
      >(functions, 'createUserDocument');
      await createUserDoc({
        uid: user.uid,
        displayName,
        country: selectedCountry,
        ...(avatarPath ? { avatarPath } : {}),
      });

      Alert.alert('Success', 'Account created. You can sign in with your email and password.');
      router.back();
    } catch (error: any) {
      console.error('Create account error:', error);
      const code = error?.code || '';
      const msgLower = (error?.message || '').toLowerCase();
      let msg = 'Failed to create account';
      if (code === 'auth/email-already-in-use') msg = 'This email is already in use. Sign in or use another email.';
      else if (code === 'auth/invalid-email') msg = 'Invalid email address';
      else if (code === 'auth/weak-password') msg = 'Password should be at least 6 characters';
      else if (code === 'permission-denied' || msgLower.includes('permission-denied') || msgLower.includes('missing or insufficient')) {
        msg = 'Database permission denied. Account was created but profile could not be saved. Try signing in again, or check that the emulator (Firestore) is running and reachable from this device.';
      }
      else if (code === 'unavailable' || msgLower.includes('unavailable') || msgLower.includes('connection')) {
        msg = 'Cannot reach the database. Use the same Wi‑Fi as the PC and open the app at http://<PC\'s IP>:8081.';
      }
      else if (code === 'auth/network-request-failed' || msgLower.includes('network') || msgLower.includes('fetch') || msgLower.includes('cors')) {
        msg = 'Cannot connect to server.';
        const useEmulator = Constants.expoConfig?.extra?.useEmulator === true;
        if (useEmulator) {
          const isWeb = typeof window !== 'undefined';
          const hostname = isWeb && window.location ? window.location.hostname : '';
          if (isWeb && (hostname === 'localhost' || hostname === '127.0.0.1')) {
            msg += '\n\nIf opening from a phone, change the address bar to http://<PC\'s IP>:8081 (run ipconfig on PC to find the IP).';
          } else {
            msg += '\n\nMake sure PC and phone are on the same Wi-Fi; on mobile open http://<PC\'s IP>:8081';
          }
        }
      }
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>
        An account is required to play Ranked Match
      </Text>
      <Text style={styles.subtitle2}>
        Use email and password to protect your account and rank.
      </Text>

      {Platform.OS === 'web' && Constants.expoConfig?.extra?.useEmulator === true && typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
        <View style={styles.mobileHintBanner}>
          <Text style={styles.mobileHintText}>On mobile, open http://&lt;PC's IP&gt;:8081 (run ipconfig on PC to find the IP)</Text>
        </View>
      )}

      <View style={styles.form}>
        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Text style={styles.label}>Password * (min 6 characters)</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        {/* アバター画像選択 */}
        <View style={styles.avatarSection}>
          <Text style={styles.label}>Avatar (optional)</Text>
          <TouchableOpacity style={styles.avatarButton} onPress={pickImage}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>Select image</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Display name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Display name (e.g. Player1)"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="none"
        />

        <View style={styles.countrySection}>
          <Text style={styles.label}>Country *</Text>
          <TouchableOpacity
            style={styles.countryPicker}
            onPress={() => setShowCountryPicker(!showCountryPicker)}
          >
            <Text style={styles.countryPickerText}>
              {COUNTRIES.find(c => c.code === selectedCountry)?.name || 'Japan'}
            </Text>
            <Text style={styles.countryPickerArrow}>{showCountryPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          
          {showCountryPicker && (
            <View style={styles.countryList}>
              <ScrollView style={styles.countryListScroll} nestedScrollEnabled>
                {COUNTRIES.map((country) => (
                <TouchableOpacity
                  key={country.code}
                  style={[
                    styles.countryOption,
                    selectedCountry === country.code && styles.countryOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedCountry(country.code);
                    setShowCountryPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.countryOptionText,
                      selectedCountry === country.code && styles.countryOptionTextSelected,
                    ]}
                  >
                    {country.name} ({country.code})
                  </Text>
                </TouchableOpacity>
              ))}
              </ScrollView>
            </View>
          )}
          <Text style={styles.countryNote}>Used for country-based rankings</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleCreateAccount}
          disabled={loading || !email.trim() || !password || !displayName}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.switchButton} onPress={() => router.replace('/sign-in')}>
          <Text style={styles.switchText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: COLORS.gold,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle2: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
    color: COLORS.muted,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  buttonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchText: {
    color: COLORS.gold,
    fontSize: 14,
  },
  avatarSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  avatarButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  countrySection: {
    marginTop: 16,
  },
  countryPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  countryPickerText: {
    fontSize: 16,
    color: COLORS.text,
  },
  countryPickerArrow: {
    fontSize: 12,
    color: COLORS.muted,
  },
  countryList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    maxHeight: 200,
    overflow: 'hidden',
  },
  countryListScroll: {
    maxHeight: 200,
  },
  countryOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countryOptionSelected: {
    backgroundColor: COLORS.primaryHover,
  },
  countryOptionText: {
    fontSize: 14,
    color: COLORS.text,
  },
  countryOptionTextSelected: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  countryNote: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 8,
  },
  mobileHintBanner: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  mobileHintText: {
    fontSize: 12,
    color: COLORS.gold,
    textAlign: 'center',
  },
});

