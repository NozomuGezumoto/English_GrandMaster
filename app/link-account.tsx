import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { auth } from '../lib/firebase';
import { linkWithCredential, EmailAuthProvider } from 'firebase/auth';
import { COLORS } from '../lib/theme';

export default function LinkAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const user = auth.currentUser;
  if (!user?.isAnonymous) {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <Text style={styles.subtitle}>Your account is already secured with email.</Text>
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleLink = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      const credential = EmailAuthProvider.credential(trimmedEmail, password);
      await linkWithCredential(user, credential);
      Alert.alert('Success', 'Your account is now secured. You can sign in with this email on any device.');
      router.back();
    } catch (error: any) {
      const code = error?.code || '';
      let message = error?.message || 'Failed to link account';
      if (code === 'auth/email-already-in-use') message = 'This email is already used by another account.';
      else if (code === 'auth/invalid-email') message = 'Invalid email address';
      else if (code === 'auth/weak-password') message = 'Password should be at least 6 characters';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>
      <Text style={styles.title}>Secure your account</Text>
      <Text style={styles.subtitle}>
        Add an email and password to this account. You can then sign in on another device and keep your rank and stats.
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Text style={styles.label}>Password (min 6 characters)</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleLink}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.gold} /> : <Text style={styles.buttonText}>Save email & password</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.switchButton} onPress={() => router.back()}>
          <Text style={styles.switchText}>Cancel</Text>
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
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: COLORS.gold },
  subtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'center', marginBottom: 32 },
  form: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16, color: COLORS.muted },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  button: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  primaryButton: { backgroundColor: COLORS.primary, borderWidth: 1, borderColor: COLORS.gold },
  buttonText: { color: COLORS.gold, fontSize: 16, fontWeight: '600' },
  switchButton: { marginTop: 24, paddingVertical: 12, alignItems: 'center' },
  switchText: { color: COLORS.gold, fontSize: 14 },
});
