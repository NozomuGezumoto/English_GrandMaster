import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import Constants from 'expo-constants';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { COLORS } from '../lib/theme';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      router.back();
    } catch (error: any) {
      const code = error?.code || '';
      let message = error?.message || 'Sign in failed';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        message = 'Invalid email or password';
      } else if (code === 'auth/invalid-email') message = 'Invalid email address';
      else if (code === 'auth/too-many-requests') message = 'Too many attempts. Try again later.';
      else if (code === 'auth/network-request-failed' || error?.message?.toLowerCase?.().includes('network') || error?.message?.toLowerCase?.().includes('fetch')) {
        message = 'Cannot connect to server.';
        if (Constants.expoConfig?.extra?.useEmulator === true) {
          const isWeb = typeof window !== 'undefined';
          const hostname = isWeb && window.location ? window.location.hostname : '';
          if (isWeb && (hostname === 'localhost' || hostname === '127.0.0.1')) {
            message += '\n\nIf opening from a phone, change the address bar to http://<PC\'s IP>:8081';
          } else {
            message += '\n\nOn mobile, open http://<PC\'s IP>:8081';
          }
        }
      }
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Sign in with your email to access your account</Text>

      {Platform.OS === 'web' && Constants.expoConfig?.extra?.useEmulator === true && typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
        <View style={styles.mobileHintBanner}>
          <Text style={styles.mobileHintText}>On mobile, open http://&lt;PC's IP&gt;:8081</Text>
        </View>
      )}

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
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity style={styles.forgotLink} onPress={() => router.push({ pathname: '/forgot-password', params: { email: email.trim() || undefined } })}>
          <Text style={styles.forgotLinkText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.gold} /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.switchButton} onPress={() => router.replace('/login')}>
          <Text style={styles.switchText}>Don't have an account? Create account</Text>
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
    marginBottom: 32,
  },
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
  forgotLink: { marginTop: 12, alignSelf: 'flex-end' },
  forgotLinkText: { color: COLORS.gold, fontSize: 14 },
  button: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  primaryButton: { backgroundColor: COLORS.primary, borderWidth: 1, borderColor: COLORS.gold },
  buttonText: { color: COLORS.gold, fontSize: 16, fontWeight: '600' },
  switchButton: { marginTop: 24, paddingVertical: 12, alignItems: 'center' },
  switchText: { color: COLORS.gold, fontSize: 14 },
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
