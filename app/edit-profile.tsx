import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { User as FirestoreUser } from '../types/firestore';
import { COUNTRIES } from '../lib/countries';
import { COLORS } from '../lib/theme';
import { uploadAvatarToStorage, getAvatarUrl } from '../lib/avatar-utils';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null); // 選択中・プレビュー用（ローカル or data URL）
  const [avatarMimeType, setAvatarMimeType] = useState<string>('image/jpeg'); // 選択画像の MIME タイプ（アップロード用）
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null); // Storage から取得した表示用 URL
  const [selectedCountry, setSelectedCountry] = useState<string>('JP');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // 既存のユーザーデータを読み込む
  useEffect(() => {
    const loadUserData = async () => {
      if (!auth.currentUser) {
        router.back();
        return;
      }

      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as FirestoreUser;
          setDisplayName(userData.displayName || '');
          setSelectedCountry(userData.country || 'JP');
          if (userData.avatarPath || userData.avatarUrl) {
            const url = await getAvatarUrl(userData);
            if (url) setAvatarDisplayUrl(url);
          }
        } else {
          // ユーザードキュメントが存在しない場合は、AuthのdisplayNameを使用
          setDisplayName(auth.currentUser.displayName || '');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        Alert.alert('Error', 'Failed to load user data');
      } finally {
        setInitialLoading(false);
      }
    };

    loadUserData();
  }, []);

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
              const dataUrl = event.target?.result as string;
              setAvatarUri(dataUrl);
              setAvatarDisplayUrl(null);
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
        Alert.alert('Permission required', 'Media library access is needed to select an avatar image.');
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
        setAvatarDisplayUrl(null);
      }
    } catch (error: any) {
      console.error('Error picking image:', error);
      const msg = error?.message?.includes('ExponentImagePicker') || error?.message?.includes('native module')
        ? 'Image picker requires a development build. Install the latest build from EAS.'
        : 'Failed to select image.';
      Alert.alert('Error', msg);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Error', 'You must be signed in');
      return;
    }

    try {
      setLoading(true);
      
      await updateProfile(auth.currentUser, {
        displayName: displayName.trim(),
      });

      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userData: Record<string, unknown> = {
        uid: auth.currentUser.uid,
        displayName: displayName.trim(),
        country: selectedCountry,
        lastActiveAt: Timestamp.now(),
      };

      // 新規に画像を選択した場合のみ Storage へアップロード（avatarUri は選択時のみセットされる）
      if (avatarUri) {
        try {
          const { avatarPath } = await uploadAvatarToStorage(auth.currentUser.uid, avatarUri, avatarMimeType);
          userData.avatarPath = avatarPath;
          userData.avatarUpdatedAt = Timestamp.now();
          userData.avatarUrl = null;
        } catch (uploadErr: any) {
          console.error('[EditProfile] Avatar upload failed:', uploadErr);
          Alert.alert('Error', 'Failed to upload avatar. ' + (uploadErr?.message || ''));
          setLoading(false);
          return;
        }
      }

      await setDoc(userRef, userData, { merge: true });

      router.replace('/(tabs)/profile');
    } catch (error: any) {
      console.error('Update profile error:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const currentCountryName = COUNTRIES.find(c => c.code === selectedCountry)?.name || selectedCountry;

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit profile</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.form}>
        {/* アバター画像選択 */}
        <View style={styles.avatarSection}>
          <Text style={styles.label}>Avatar (optional)</Text>
          <TouchableOpacity style={styles.avatarButton} onPress={pickImage}>
            {(avatarUri || avatarDisplayUrl) ? (
              <Image source={{ uri: avatarUri || avatarDisplayUrl || '' }} style={styles.avatarImage} />
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

        {/* 国選択 */}
        <View style={styles.countrySection}>
          <Text style={styles.label}>Country</Text>
          <TouchableOpacity style={styles.countryPicker} onPress={() => setShowCountryPicker(!showCountryPicker)}>
            <Text style={styles.countryPickerText}>{currentCountryName}</Text>
            <Text style={styles.countryPickerArrow}>{showCountryPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showCountryPicker && (
            <View style={styles.countryList}>
              <ScrollView style={styles.countryListScroll} nestedScrollEnabled>
                {COUNTRIES.map((countryOption) => (
                <TouchableOpacity
                  key={countryOption.code}
                  style={[
                    styles.countryListItem,
                    selectedCountry === countryOption.code && styles.countryListItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCountry(countryOption.code);
                    setShowCountryPicker(false);
                  }}
                >
                  <Text style={styles.countryListItemText}>
                    {countryOption.name}
                  </Text>
                </TouchableOpacity>
              ))}
              </ScrollView>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, styles.primaryButton, (!displayName.trim() || loading) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading || !displayName.trim()}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.muted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cancelButton: {
    fontSize: 16,
    color: COLORS.gold,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  placeholder: {
    width: 60,
  },
  form: {
    padding: 20,
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
  avatarSection: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  avatarButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
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
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: COLORS.surface,
    maxHeight: 200,
    overflow: 'hidden',
  },
  countryListScroll: {
    maxHeight: 200,
  },
  countryListItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countryListItemSelected: {
    backgroundColor: COLORS.primaryHover,
  },
  countryListItemText: {
    fontSize: 16,
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
  buttonDisabled: {
    backgroundColor: COLORS.border,
  },
  buttonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
});

