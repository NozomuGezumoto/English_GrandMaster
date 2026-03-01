import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { auth } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { COLORS } from '../lib/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendReset = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, trimmedEmail);
      setSent(true);
    } catch (error: any) {
      const code = error?.code || '';
      let message = error?.message || 'Failed to send reset email';
      if (code === 'auth/invalid-email') message = 'Invalid email address';
      else if (code === 'auth/user-not-found') message = 'No account found with this email';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { paddingTop: safeTop }]}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a password reset link to {email.trim()}. Open the link to set a new password.
        </Text>
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back to Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>
      <Text style={styles.title}>Reset password</Text>
      <Text style={styles.subtitle}>Enter your email and we'll send you a link to reset your password.</Text>

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
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleSendReset}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.gold} /> : <Text style={styles.buttonText}>Send reset link</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.switchButton} onPress={() => router.back()}>
          <Text style={styles.switchText}>Back to Sign in</Text>
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
