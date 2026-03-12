/**
 * カード作成画面
 * 指定デッキにカードを追加。deckId はクエリパラメータで受け取る。
 */

import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { createStudyCard } from '../../lib/study-cards';
import { EXPRESSION_TYPE_LABELS, type StudyCardExpressionType } from '../../types/study-card';
import { COLORS } from '../../lib/theme';

const EXPRESSION_TYPES: StudyCardExpressionType[] = [
  'noun', 'verb', 'adjective', 'adverb',
  'phrase', 'idiom', 'grammar', 'sentence', 'other',
];

export default function CreateStudyCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const [englishText, setEnglishText] = useState('');
  const [japaneseNote, setJapaneseNote] = useState('');
  const [expressionType, setExpressionType] = useState<StudyCardExpressionType | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deckId) {
      router.replace('/study-cards');
    }
  }, [deckId, router]);

  const handleSave = async () => {
    if (!deckId) return;
    const trimmed = englishText.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Enter English text');
      return;
    }
    setSaving(true);
    try {
      await createStudyCard({
        deckId,
        englishText: trimmed,
        japaneseNote: japaneseNote.trim() || undefined,
        expressionType: expressionType ?? undefined,
      });
      router.replace(`/study-cards/list?deckId=${deckId}`);
    } catch (e) {
      console.error('[StudyCards] create error:', e);
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New card</Text>

      <Text style={styles.label}>English (required)</Text>
      <TextInput
        style={styles.input}
        value={englishText}
        onChangeText={setEnglishText}
        placeholder="He is responsible for the project."
        placeholderTextColor={COLORS.muted}
        multiline
        maxLength={2000}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={japaneseNote}
        onChangeText={setJapaneseNote}
        placeholder="e.g. He is in charge of the project"
        placeholderTextColor={COLORS.muted}
        multiline
        maxLength={2000}
      />

      <Text style={styles.label}>Expression type</Text>
      <View style={styles.chipRow}>
        {EXPRESSION_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, expressionType === t && styles.chipActive]}
            onPress={() => setExpressionType(expressionType === t ? null : t)}
          >
            <Text style={[styles.chipText, expressionType === t && styles.chipTextActive]}>
              {EXPRESSION_TYPE_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginBottom: 16,
  },
  backText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.gold,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 20,
  },
  inputMultiline: {
    minHeight: 80,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.gold,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.text,
  },
  chipTextActive: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '600',
  },
});
