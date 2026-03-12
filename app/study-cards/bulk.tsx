/**
 * 一括登録画面
 * 1行1カード。形式: 英文[TAB/]日本語メモ または 英文のみ
 */

import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { createStudyCardsBulk } from '../../lib/study-cards';
import { EXPRESSION_TYPE_LABELS, type StudyCardExpressionType } from '../../types/study-card';
import { COLORS } from '../../lib/theme';

/** 日本語ラベル → 表現タイプの逆引き */
const LABEL_TO_TYPE: Record<string, StudyCardExpressionType> = Object.fromEntries(
  (Object.entries(EXPRESSION_TYPE_LABELS) as [StudyCardExpressionType, string][]).map(([k, v]) => [v, k])
);

function parseExpressionType(label: string): StudyCardExpressionType | null {
  const t = label.trim();
  if (!t) return null;
  return LABEL_TO_TYPE[t] ?? null;
}

function parseBulkInput(text: string): { englishText: string; japaneseNote: string; expressionType: StudyCardExpressionType | null }[] {
  const lines = text.split(/\r?\n/);
  const result: { englishText: string; japaneseNote: string; expressionType: StudyCardExpressionType | null }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Tab / スラッシュ / ハイフン / コロン で分割（最大3分割: 英文 / 日本語 / 品詞）
    const parts = trimmed.split(/\t|\s*\/\s*|\s*[－－-]\s+|\s*[：:]\s*/).map((p) => p.trim()).filter(Boolean);
    const english = parts[0] ?? '';
    const japanese = parts[1] ?? '';
    const expressionType = parseExpressionType(parts[2] ?? '');

    if (english) {
      result.push({ englishText: english, japaneseNote: japanese, expressionType });
    }
  }
  return result;
}

export default function BulkCreateStudyCardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deckId) router.replace('/study-cards');
  }, [deckId, router]);

  const handleSave = async () => {
    if (!deckId) return;
    const items = parseBulkInput(input);
    if (items.length === 0) {
      Alert.alert('Input error', 'Enter one card per line.\nExample:\nWord / word / Noun\nimprove / to make better / Verb');
      return;
    }
    setSaving(true);
    try {
      const { created, skipped } = await createStudyCardsBulk(deckId, items);
      Alert.alert('Done', `Registered ${created} cards${skipped > 0 ? `\n${skipped} skipped` : ''}`, [
        { text: 'OK', onPress: () => router.replace(`/study-cards/list?deckId=${deckId}`) },
      ]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const previewCount = parseBulkInput(input).length;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Bulk Add</Text>
      <Text style={styles.hint}>
        One card per line. Use Tab, &quot;/&quot;, &quot;-&quot;, or &quot;:&quot; to separate. 3rd column: expression type.
      </Text>

      <View style={styles.typeBlock}>
        <Text style={styles.typeLabel}>Type: </Text>
        <Text style={styles.typeList}>
          {Object.values(EXPRESSION_TYPE_LABELS).join(', ')}
        </Text>
      </View>

      <Text style={styles.example}>Example:</Text>
      <View style={styles.exampleBlock}>
        <Text style={styles.exampleLine}>Word / word / Noun</Text>
        <Text style={styles.exampleLine}>improve / to improve / Verb</Text>
        <Text style={styles.exampleLine}>We need to improve. / need to improve / Phrase</Text>
        <Text style={styles.exampleLine}>Hello - hi</Text>
      </View>

      <Text style={styles.label}>Input (one card per line)</Text>
      <TextInput
        style={styles.textArea}
        value={input}
        onChangeText={setInput}
        placeholder="English[TAB/]Note[/Type]"
        placeholderTextColor={COLORS.muted}
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.previewText}>{previewCount} cards to add</Text>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Adding...' : 'Bulk add'}</Text>
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
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gold,
    marginBottom: 4,
  },
  typeBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeList: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 22,
  },
  example: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
  },
  exampleBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exampleLine: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 180,
    marginBottom: 12,
  },
  previewText: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 16,
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
