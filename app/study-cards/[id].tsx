/**
 * カード詳細・編集画面
 */

import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { getStudyCard, updateStudyCard, deleteStudyCard } from '../../lib/study-cards';
import { EXPRESSION_TYPE_LABELS, STATUS_LABELS, type StudyCard, type StudyCardExpressionType, type StudyCardStatus } from '../../types/study-card';
import { COLORS } from '../../lib/theme';

const EXPRESSION_TYPES: StudyCardExpressionType[] = [
  'noun', 'verb', 'adjective', 'adverb',
  'phrase', 'idiom', 'grammar', 'sentence', 'other',
];

const STATUS_OPTIONS: StudyCardStatus[] = ['learning', 'mastered', 'archived'];

export default function StudyCardDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, deckId } = useLocalSearchParams<{ id: string; deckId?: string }>();
  const [card, setCard] = useState<StudyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [englishText, setEnglishText] = useState('');
  const [japaneseNote, setJapaneseNote] = useState('');
  const [expressionType, setExpressionType] = useState<StudyCardExpressionType | null>(null);
  const [status, setStatus] = useState<StudyCardStatus>('learning');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id || !deckId) {
      setLoading(false);
      return;
    }
    getStudyCard(deckId, id)
      .then((c) => {
        if (c) {
          setCard(c);
          setEnglishText(c.englishText);
          setJapaneseNote(c.japaneseNote);
          setExpressionType(c.expressionType);
          setStatus(c.status);
        }
      })
      .finally(() => setLoading(false));
  }, [id, deckId]);

  const handleSave = async () => {
    if (!card || !deckId) return;
    const trimmed = englishText.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updateStudyCard(deckId, card.id, {
        englishText: trimmed,
        japaneseNote: japaneseNote.trim(),
        expressionType,
        status,
      });
      setCard((prev) => prev ? { ...prev, englishText: trimmed, japaneseNote: japaneseNote.trim(), expressionType, status } : null);
      setEditing(false);
    } catch (e) {
      console.error('[StudyCard] update error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleStartReview = () => {
    router.push(`/study-cards/review?deckId=${deckId}`);
  };

  const handleDelete = () => {
    if (!card) return;
    Alert.alert(
      'Delete card',
      `Delete "${card.englishText.slice(0, 50)}${card.englishText.length > 50 ? '…' : ''}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!deckId || !card) return;
            setDeleting(true);
            try {
              await deleteStudyCard(deckId, card.id);
              router.replace(`/study-cards/list?deckId=${deckId}`);
            } catch (e) {
              console.error('[StudyCard] delete error:', e);
              Alert.alert('Error', 'Failed to delete card');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !card || !deckId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Card Details</Text>

      {editing ? (
        <>
          <Text style={styles.label}>English (required)</Text>
          <TextInput
            style={styles.input}
            value={englishText}
            onChangeText={setEnglishText}
            multiline
            maxLength={2000}
            placeholderTextColor={COLORS.muted}
          />
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={japaneseNote}
            onChangeText={setJapaneseNote}
            multiline
            maxLength={2000}
            placeholderTextColor={COLORS.muted}
          />
          <Text style={styles.label}>Type</Text>
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
          <Text style={styles.label}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, status === s && styles.chipActive]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                  {STATUS_LABELS[s]}
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
          <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.cardArea}>
            <Text style={styles.cardEnglish}>{card.englishText}</Text>
            {card.japaneseNote ? (
              <Text style={styles.cardJapanese}>{card.japaneseNote}</Text>
            ) : null}
            <View style={styles.metaRow}>
              {card.expressionType ? (
                <Text style={styles.typeBadge}>{EXPRESSION_TYPE_LABELS[card.expressionType]}</Text>
              ) : null}
              <View style={[styles.statusBadge, card.status === 'learning' && styles.statusLearning]}>
                <Text style={[styles.statusText, card.status === 'learning' && styles.statusTextLearning]}>
                  {STATUS_LABELS[card.status]}
                </Text>
              </View>
            </View>
            <Text style={styles.date}>
              Created: {new Date(card.createdAt).toLocaleDateString('en-US')}
              {card.lastReviewedAt
                ? ` · Reviewed: ${new Date(card.lastReviewedAt).toLocaleDateString('en-US')}`
                : ''}
            </Text>
          </View>

          <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reviewButton} onPress={handleStartReview}>
            <Text style={styles.reviewButtonText}>Review</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={deleting}
          >
            <Text style={styles.deleteButtonText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
          </TouchableOpacity>
        </>
      )}
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
    marginBottom: 20,
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
    marginBottom: 20,
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
    marginBottom: 12,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  cardArea: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardEnglish: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 26,
    marginBottom: 12,
  },
  cardJapanese: {
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    fontSize: 11,
    color: COLORS.muted,
    backgroundColor: COLORS.background,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  statusLearning: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.muted,
  },
  statusTextLearning: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  date: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 8,
  },
  editButton: {
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  editButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  reviewButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
    marginBottom: 12,
  },
  reviewButtonText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '600',
  },
  deleteButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: COLORS.muted,
    fontSize: 16,
    fontWeight: '600',
  },
});
