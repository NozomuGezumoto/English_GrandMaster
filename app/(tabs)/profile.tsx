import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView, Clipboard, TextInput, Alert, useWindowDimensions, Platform } from 'react-native';

const PROFILE_COMPACT = true; // 必要な情報を1画面に収めるコンパクト表示
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { auth, db, functions, httpsCallable } from '../../lib/firebase';
import { getAvatarUrl } from '../../lib/avatar-utils';
import { AvatarImage } from '../components/AvatarImage';
import { doc, getDoc, getDocFromServer, collection, query, where, getDocs } from 'firebase/firestore';
import { User as FirestoreUser, TierType, UserStatsToday, FriendRequest } from '../../types/firestore';
import type { UserRank } from '../../types/firestore';
import { COUNTRY_NAMES } from '../../lib/countries';
import { getTodayStudyReviews, type StudyReviewEntry } from '../../lib/study-reviews-today';
import { COLORS } from '../../lib/theme';

type FriendSummary = {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  rating: number;
  rank?: FirestoreUser['rank'];
  titles?: FirestoreUser['titles'];
  wins: number;
  losses: number;
};

type LookupResult =
  | { found: false }
  | { found: true; isSelf: true }
  | {
      found: true;
      uid: string;
      displayName: string;
      avatarUrl?: string;
      avatarPath?: string;
      rating: number;
      rank?: UserRank;
      titles?: FirestoreUser['titles'];
      wins: number;
      losses: number;
    };

type PendingRequestItem = {
  fromUid: string;
  displayName: string;
  avatarUrl?: string;
  rating: number;
};

async function fetchUserData(uid: string): Promise<FirestoreUser | null> {
  const userRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userRef);
  return userDoc.exists() ? (userDoc.data() as FirestoreUser) : null;
}

/** キャッシュを避けてサーバーから取得（Remove 後の再表示用） */
async function fetchUserDataFromServer(uid: string): Promise<FirestoreUser | null> {
  const userRef = doc(db, 'users', uid);
  const userDoc = await getDocFromServer(userRef);
  return userDoc.exists() ? (userDoc.data() as FirestoreUser) : null;
}

const TIER_INFO: Record<TierType, { piece: string; label: string }> = {
  pawn: { piece: '♙', label: 'Pawn' },
  knight: { piece: '♘', label: 'Knight' },
  bishop: { piece: '♗', label: 'Bishop' },
  rook: { piece: '♖', label: 'Rook' },
  queen: { piece: '♕', label: 'Queen' },
  king: { piece: '♔', label: 'King' },
};

function getNationalGrandmasterLabel(countryCode?: string): string {
  const name = countryCode ? COUNTRY_NAMES[countryCode] ?? countryCode : 'National';
  return `${name} GrandMaster`;
}

function getFriendCodeErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { code?: string }).code;
    const msg = e.message || '';
    if (code === 'internal' || msg === 'internal') {
      return 'Failed to get friend code. Try "Retry" again or check that Cloud Functions are running.';
    }
    if (code === 'not-found' || msg === 'not-found') {
      return 'Functions not found. Restart the emulator and run: cd functions && npm run build';
    }
    if (msg && msg !== 'internal') return msg;
  }
  return 'Failed to load';
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = 20 + insets.top;
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 440; // 携帯はコンパクト、PC・タブレットはやや余裕を持たせる
  const r = {
    contentPadding: isWide ? 24 : 20,
    avatarSize: isWide ? 48 : 44,
    nameSize: isWide ? 17 : 16,
    subSize: isWide ? 14 : 13,
    tierSize: isWide ? 13 : 12,
    badgeSize: isWide ? 12 : 11,
    wlSize: isWide ? 13 : 12,
    infoMarginLeft: isWide ? 16 : 12,
    rowPaddingVertical: isWide ? 10 : 8,
    titlesGap: isWide ? 8 : 6,
    titlesMarginTop: isWide ? 6 : 4,
  };
  const [userData, setUserData] = useState<FirestoreUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friendCodeError, setFriendCodeError] = useState<string | null>(null);
  const [friendsList, setFriendsList] = useState<FriendSummary[]>([]);
  const [addCode, setAddCode] = useState('');
  const [addLookupLoading, setAddLookupLoading] = useState(false);
  const [addAdding, setAddAdding] = useState(false);
  const [addResult, setAddResult] = useState<LookupResult | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestItem[]>([]);
  const [pendingRequestsLoading, setPendingRequestsLoading] = useState(false);
  const [respondingToUid, setRespondingToUid] = useState<string | null>(null);
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null);
  const [todayStudyReviews, setTodayStudyReviews] = useState<StudyReviewEntry[]>([]);

  const loadPendingRequests = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setPendingRequests([]);
      return;
    }
    setPendingRequestsLoading(true);
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('toUid', '==', uid),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      const items: PendingRequestItem[] = [];
      await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data() as FriendRequest;
          const fromUser = await fetchUserData(data.fromUid);
          if (fromUser) {
            const resolvedUrl = await getAvatarUrl(fromUser);
            items.push({
              fromUid: data.fromUid,
              displayName: fromUser.displayName ?? 'Unknown',
              avatarUrl: resolvedUrl ?? undefined,
              rating: fromUser.rating ?? 1000,
            });
          }
        })
      );
      setPendingRequests(items);
    } catch (e) {
      console.error('[Profile] loadPendingRequests error:', e);
      setPendingRequests([]);
    } finally {
      setPendingRequestsLoading(false);
    }
  }, []);

  const loadFriendCodeAndList = useCallback(async (data: FirestoreUser) => {
    const code = data.friendCode ?? null;
    if (code) {
      setFriendCode(code);
      setFriendCodeError(null);
    } else {
      try {
        const getCode = httpsCallable<unknown, { friendCode: string }>(functions, 'getOrCreateFriendCode');
        const res = await getCode({});
        setFriendCode(res.data.friendCode);
        setFriendCodeError(null);
      } catch (e: unknown) {
        setFriendCode(null);
        setFriendCodeError(getFriendCodeErrorMessage(e));
      }
    }
    const uids = data.friends && Array.isArray(data.friends) ? data.friends as string[] : [];
    if (uids.length === 0) {
      setFriendsList([]);
      return;
    }
    const list: FriendSummary[] = [];
    await Promise.all(
      uids.map(async (uid) => {
        const u = await fetchUserData(uid);
        if (u) {
          const resolvedUrl = await getAvatarUrl(u);
          list.push({
            uid,
            displayName: u.displayName ?? 'Unknown',
            avatarUrl: resolvedUrl ?? undefined,
            rating: u.rating ?? 1000,
            rank: u.rank,
            titles: u.titles,
            wins: u.wins ?? 0,
            losses: u.losses ?? 0,
          });
        }
      })
    );
    list.sort((a, b) => (b.rating - a.rating));
    setFriendsList(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const user = auth.currentUser;
      if (!user?.uid) {
        setUserData(null);
        setAvatarDisplayUrl(null);
        setFriendCode(null);
        setFriendCodeError(null);
        setFriendsList([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      (async () => {
        try {
          let data = await fetchUserData(user.uid);
          // ドキュメントが無い場合、createUserDocument で自動作成（対戦しなくても Profile 表示できるようにする）
          if (!data && user.displayName) {
            try {
              const createUserDoc = httpsCallable<
                { uid: string; displayName: string; country: string; avatarUrl?: string },
                { ok: boolean }
              >(functions, 'createUserDocument');
              await createUserDoc({
                uid: user.uid,
                displayName: user.displayName,
                country: 'JP',
              });
              data = await fetchUserData(user.uid);
            } catch (e) {
              console.error('[Profile] createUserDocument:', e);
            }
          }
          setUserData(data);
          if (data) {
            loadFriendCodeAndList(data);
            getAvatarUrl(data).then(setAvatarDisplayUrl);
          } else {
            setAvatarDisplayUrl(null);
          }
          loadPendingRequests();
          const reviews = await getTodayStudyReviews();
          setTodayStudyReviews(reviews);
        } catch (err) {
          console.error('Error fetching user data:', err);
        } finally {
          setLoading(false);
        }
      })();
    }, [loadFriendCodeAndList, loadPendingRequests])
  );

  const handleLookupByCode = useCallback(async () => {
    const trimmed = addCode.trim().toUpperCase();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'Friend code must be 6 characters');
      return;
    }
    setAddResult(null);
    setAddLookupLoading(true);
    const LOOKUP_TIMEOUT_MS = 15000;
    try {
      const lookup = httpsCallable<{ code: string }, LookupResult>(functions, 'lookupByFriendCode');
      const res = await Promise.race([
        lookup({ code: trimmed }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), LOOKUP_TIMEOUT_MS)
        ),
      ]);
      setAddResult(res.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lookup failed';
      if (msg === 'Timeout') {
        Alert.alert(
          'Connection timed out',
          'Make sure your phone and PC are on the same Wi-Fi and that port 5001 is allowed in the firewall.'
        );
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setAddLookupLoading(false);
    }
  }, [addCode]);

  const handleAddByCode = useCallback(async () => {
    if (!addResult || !addResult.found || 'isSelf' in addResult) return;
    setAddAdding(true);
    try {
      const sendRequest = httpsCallable<{ toUid: string }, { sent?: boolean; reason?: string }>(functions, 'sendFriendRequest');
      const res = await sendRequest({ toUid: addResult.uid });
      const data = res.data;
      if (data.sent) {
        setAddCode('');
        setAddResult(null);
        Alert.alert('Request sent', `A friend request was sent to ${addResult.displayName}. They will see it in their Friend requests.`);
      } else if (data.reason === 'already_friends') {
        Alert.alert('Already friends', 'You are already friends with this user.');
      } else if (data.reason === 'already_sent') {
        Alert.alert('Already sent', 'You have already sent a request to this user.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send request';
      Alert.alert('Error', msg);
    } finally {
      setAddAdding(false);
    }
  }, [addResult]);

  const handleApproveRequest = useCallback(async (item: PendingRequestItem) => {
    setRespondingToUid(item.fromUid);
    try {
      const approve = httpsCallable<{ fromUid: string }, { approved?: boolean }>(functions, 'approveFriendRequest');
      await approve({ fromUid: item.fromUid });
      setPendingRequests((prev) => prev.filter((p) => p.fromUid !== item.fromUid));
      const fresh = await fetchUserDataFromServer(auth.currentUser!.uid);
      if (fresh) {
        setUserData(fresh);
        await loadFriendCodeAndList(fresh);
      }
      Alert.alert('Approved', `${item.displayName} is now your friend.`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setRespondingToUid(null);
    }
  }, [loadFriendCodeAndList]);

  const handleRejectRequest = useCallback(async (item: PendingRequestItem) => {
    setRespondingToUid(item.fromUid);
    try {
      const reject = httpsCallable<{ fromUid: string }, { rejected?: boolean }>(functions, 'rejectFriendRequest');
      await reject({ fromUid: item.fromUid });
      setPendingRequests((prev) => prev.filter((p) => p.fromUid !== item.fromUid));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setRespondingToUid(null);
    }
  }, []);

  const runRemove = useCallback(async (f: FriendSummary) => {
    if (!userData) return;
    setRemovingUid(f.uid);
    try {
      console.log('[Profile] removeFriend calling:', f.uid);
      const removeFriend = httpsCallable<{ friendUid: string }, { removed?: boolean; reason?: string }>(functions, 'removeFriend');
      const res = await removeFriend({ friendUid: f.uid });
      console.log('[Profile] removeFriend result:', res.data);
      if (res.data?.removed) {
        setFriendsList((prev) => prev.filter((x) => x.uid !== f.uid));
        const updated: FirestoreUser = { ...userData, friends: (userData.friends || []).filter((id) => id !== f.uid) };
        setUserData(updated);
        const fresh = await fetchUserDataFromServer(auth.currentUser!.uid);
        if (fresh) {
          setUserData(fresh);
          await loadFriendCodeAndList(fresh);
        } else {
          await loadFriendCodeAndList(updated);
        }
      } else if (res.data?.reason === 'not_friends') {
        const fresh = await fetchUserDataFromServer(auth.currentUser!.uid);
        if (fresh) await loadFriendCodeAndList(fresh);
      }
    } catch (e) {
      console.error('[Profile] removeFriend error:', e);
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove friend');
    } finally {
      setRemovingUid(null);
    }
  }, [userData, loadFriendCodeAndList]);

  const handleRemoveFriend = useCallback((f: FriendSummary) => {
    if (!userData) return;
    const message = `Remove ${f.displayName} from your friends?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        runRemove(f);
      }
      return;
    }
    Alert.alert(
      'Remove friend',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => runRemove(f) },
      ]
    );
  }, [userData, runRemove]);

  const [friendCodeRetrying, setFriendCodeRetrying] = useState(false);
  const handleRetryFriendCode = useCallback(async () => {
    setFriendCodeError(null);
    setFriendCodeRetrying(true);
    try {
      const getCode = httpsCallable<unknown, { friendCode: string }>(functions, 'getOrCreateFriendCode');
      const res = await getCode({});
      setFriendCode(res.data.friendCode);
      setFriendCodeError(null);
    } catch (e: unknown) {
      setFriendCodeError(getFriendCodeErrorMessage(e));
    } finally {
      setFriendCodeRetrying(false);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!auth.currentUser || !auth.currentUser.displayName) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.noAccountText}>No account</Text>
        <Text style={styles.noAccountSubtext}>Sign in or create an account to play Ranked Match and save your rank.</Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/sign-in')}>
          <Text style={styles.loginButtonText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/login')}>
          <Text style={styles.secondaryButtonText}>Create account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Could not load user data</Text>
      </View>
    );
  }

  const winRate = userData.wins + userData.losses > 0
    ? ((userData.wins / (userData.wins + userData.losses)) * 100).toFixed(1)
    : '0.0';

  const todayUtc = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  })();
  const statsToday: UserStatsToday | null = userData.statsToday?.date === todayUtc ? userData.statsToday : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        { paddingTop: safeTop, paddingBottom: 24 },
        PROFILE_COMPACT && styles.profileCompactScroll,
      ]}
      showsVerticalScrollIndicator={!PROFILE_COMPACT}
    >
      <View style={[styles.content, { padding: r.contentPadding }, PROFILE_COMPACT && styles.profileCompactContent]}>
        {/* ヘッダー */}
        <View style={[styles.header, PROFILE_COMPACT && styles.headerCompact]}>
          <Text style={[styles.title, PROFILE_COMPACT && styles.titleCompact]}>Profile</Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push('/edit-profile')}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* 匿名アカウント: メール連携で保護 */}
        {auth.currentUser?.isAnonymous && (
          <TouchableOpacity style={[styles.secureBanner, PROFILE_COMPACT && styles.secureBannerCompact]} onPress={() => router.push('/link-account')}>
            <Text style={styles.secureBannerTitle}>Secure your account</Text>
            <Text style={styles.secureBannerSubtext}>Add email & password to sign in on other devices and keep your rank.</Text>
            <Text style={styles.secureBannerLink}>Add email & password →</Text>
          </TouchableOpacity>
        )}

        {/* アバターと基本情報 */}
        <View style={[styles.profileSection, PROFILE_COMPACT && styles.profileSectionCompact]}>
          {(avatarDisplayUrl || userData.avatarUrl) ? (
            <Image source={{ uri: avatarDisplayUrl || userData.avatarUrl || '' }} style={[styles.avatar, PROFILE_COMPACT && styles.avatarCompact]} />
          ) : (
            <View style={[styles.avatarPlaceholder, PROFILE_COMPACT && styles.avatarPlaceholderCompact]}>
              <Text style={[styles.avatarPlaceholderText, PROFILE_COMPACT && styles.avatarPlaceholderTextCompact]}>
                {userData.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.displayName, PROFILE_COMPACT && styles.displayNameCompact]}>{userData.displayName}</Text>
          {userData.country && (
            <Text style={styles.country}>Country: {userData.country}</Text>
          )}

          {/* ランク・称号: 総合（Overall）のみ Grandmaster 称号。rankOverall ?? rank */}
          <View style={[styles.rankSection, PROFILE_COMPACT && styles.rankSectionCompact]}>
            {(userData.rankOverall ?? userData.rank) ? (
              <>
                <Text style={styles.rankModeLabel}>Overall</Text>
                <View style={styles.rankRow}>
                  <Text style={[styles.tierPiece, PROFILE_COMPACT && styles.tierPieceCompact]}>
                    {TIER_INFO[(userData.rankOverall ?? userData.rank)!.tier]?.piece ?? '♙'}
                  </Text>
                  <Text style={[styles.tierLabel, PROFILE_COMPACT && styles.tierLabelCompact]}>
                    {TIER_INFO[(userData.rankOverall ?? userData.rank)!.tier]?.label ?? (userData.rankOverall ?? userData.rank)!.tier}
                  </Text>
                  {(userData.rankOverall ?? userData.rank)!.provisional && (
                    <View style={styles.provisionalBadge}>
                      <Text style={styles.provisionalBadgeText}>Provisional</Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <Text style={styles.rankSub}>Rank not calculated yet</Text>
            )}
            {(userData.titles?.globalGM || userData.titles?.nationalGM) && (
              <View style={[styles.titlesContainer, PROFILE_COMPACT && styles.titlesContainerCompact]}>
                {userData.titles.globalGM && (
                  <View style={[styles.titleBadge, styles.titleBadgeGlobal, PROFILE_COMPACT && styles.titleBadgeCompact]}>
                    <Text style={[styles.titleBadgeIcon, PROFILE_COMPACT && styles.titleBadgeIconCompact]}>👑</Text>
                    <Text style={[styles.titleBadgeLabel, PROFILE_COMPACT && styles.titleBadgeLabelCompact]}>World Top 10</Text>
                    <Text style={[styles.titleBadgeText, PROFILE_COMPACT && styles.titleBadgeTextCompact]}>World GrandMaster</Text>
                  </View>
                )}
                {userData.titles.nationalGM && (
                  <View style={[styles.titleBadge, styles.titleBadgeNational, PROFILE_COMPACT && styles.titleBadgeCompact]}>
                    <Text style={[styles.titleBadgeIcon, PROFILE_COMPACT && styles.titleBadgeIconCompact]}>🏆</Text>
                    <Text style={[styles.titleBadgeLabel, PROFILE_COMPACT && styles.titleBadgeLabelCompact]}>National Top 0.1%</Text>
                    <Text style={[styles.titleBadgeText, PROFILE_COMPACT && styles.titleBadgeTextCompact]}>{getNationalGrandmasterLabel(userData.country)}</Text>
                  </View>
                )}
              </View>
            )}
            {/* モード別ランク（称号なし） */}
            <View style={[styles.rankByModeSection, PROFILE_COMPACT && styles.rankByModeSectionCompact]}>
              <Text style={styles.rankByModeTitle}>By mode</Text>
              {[
                { key: 'choice' as const, label: '4-Choice', rating: userData.ratingChoice ?? userData.rating ?? 1000, rank: userData.rankChoice },
                { key: 'dictation' as const, label: 'Dictation', rating: userData.ratingDictation ?? 1000, rank: userData.rankDictation },
                { key: 'listening' as const, label: 'Listening', rating: userData.ratingListening ?? 1000, rank: userData.rankListening },
                { key: 'overall' as const, label: 'Overall', rating: userData.ratingOverall ?? userData.rating ?? 1000, rank: userData.rankOverall ?? userData.rank },
              ].map(({ label, rating, rank }) => (
                <View key={label} style={[styles.rankByModeRow, PROFILE_COMPACT && styles.rankByModeRowCompact]}>
                  <Text style={styles.rankByModeLabel}>{label}</Text>
                  <Text style={styles.rankByModeValue}>{rating}</Text>
                  {rank && (
                    <Text style={styles.rankByModeTier}>
                      {TIER_INFO[rank.tier]?.piece ?? '♙'} #{rank.globalRank ?? '—'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 今日の学習 */}
        <View style={[styles.statsSection, PROFILE_COMPACT && styles.statsSectionCompact]}>
          <Text style={[styles.sectionTitle, PROFILE_COMPACT && styles.sectionTitleCompact]}>Today&apos;s learning</Text>
          <View style={[styles.statsCard, PROFILE_COMPACT && styles.statsCardCompact]}>
            <View style={[styles.statsRow, PROFILE_COMPACT && styles.statsRowCompact]}>
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>Battles</Text>
                <Text style={styles.statsItemValue}>{statsToday?.battles ?? 0}</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>W–L (today)</Text>
                <Text style={styles.statsItemValue}>
                  {statsToday ? `${statsToday.wins}–${statsToday.losses}` : '0–0'}
                </Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>Dictation</Text>
                <Text style={styles.statsItemValue}>{statsToday?.dictationSolved ?? 0}</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>Review</Text>
                <Text style={styles.statsItemValue}>
                  {new Set(todayStudyReviews.map((e) => e.englishText)).size}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 戦績セクション */}
        <View style={[styles.statsSection, PROFILE_COMPACT && styles.statsSectionCompact]}>
          <Text style={[styles.sectionTitle, PROFILE_COMPACT && styles.sectionTitleCompact]}>Stats</Text>
          <View style={[styles.statsCard, PROFILE_COMPACT && styles.statsCardCompact]}>
            <View style={[styles.statsRow, PROFILE_COMPACT && styles.statsRowCompact]}>
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>Rating (Overall)</Text>
                <View style={styles.ratingRow}>
                  <Text style={styles.statsItemValue}>{userData.ratingOverall ?? userData.rating}</Text>
                  {userData.ratingChange !== undefined && userData.ratingChange !== 0 && (
                    <Text style={[
                      styles.ratingChange,
                      userData.ratingChange > 0 ? styles.ratingChangeUp : styles.ratingChangeDown,
                    ]}>
                      {userData.ratingChange > 0 ? '+' : ''}{userData.ratingChange}
                    </Text>
                  )}
                  {userData.ratingChange === 0 && (
                    <Text style={[styles.ratingChange, styles.ratingChangeZero]}>(±0)</Text>
                  )}
                </View>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>World Rank</Text>
                <Text style={styles.statsItemValue}>#{(userData.rankOverall ?? userData.rank)?.globalRank ?? '—'}</Text>
              </View>
            </View>
            <View style={[styles.statsRow, PROFILE_COMPACT && styles.statsRowCompact]}>
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>Wins</Text>
                <Text style={styles.statsItemValue}>{userData.wins}</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>Losses</Text>
                <Text style={styles.statsItemValue}>{userData.losses}</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statsItem}>
                <Text style={styles.statsItemLabel}>Win rate</Text>
                <Text style={styles.statsItemValue}>{winRate}%</Text>
              </View>
            </View>
            <View style={[styles.statsRow, styles.statsRowLast]}>
              <Text style={styles.statsTotalLabel}>Total matches</Text>
              <Text style={styles.statsTotalValue}>{userData.wins + userData.losses}</Text>
            </View>
          </View>
        </View>

        {/* フレンド */}
        <View style={[styles.statsSection, PROFILE_COMPACT && styles.statsSectionCompact]}>
          <Text style={[styles.sectionTitle, PROFILE_COMPACT && styles.sectionTitleCompact]}>Friends</Text>
          <View style={[styles.statsCard, PROFILE_COMPACT && styles.statsCardCompact]}>
            <View style={styles.friendCodeRow}>
              <Text style={styles.friendCodeLabel}>Your friend code</Text>
              <View style={styles.friendCodeValueRow}>
                {friendCode != null ? (
                  <>
                    <Text style={styles.friendCodeValue} selectable>{friendCode}</Text>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={() => {
                        if (typeof Clipboard?.setString === 'function') {
                          Clipboard.setString(friendCode);
                        } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(friendCode);
                        }
                      }}
                    >
                      <Text style={styles.copyButtonText}>Copy</Text>
                    </TouchableOpacity>
                  </>
                ) : friendCodeError ? (
                  <View style={styles.friendCodeErrorRow}>
                    <Text style={styles.friendCodeErrorText}>{friendCodeError}</Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={handleRetryFriendCode}
                      disabled={friendCodeRetrying}
                    >
                      {friendCodeRetrying ? (
                        <ActivityIndicator color={COLORS.gold} size="small" />
                      ) : (
                        <Text style={styles.retryButtonText}>Retry</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.friendCodeLoading}>Loading...</Text>
                )}
              </View>
            </View>
            <View style={styles.addByCodeRow}>
              <Text style={styles.addByCodeLabel}>Add by friend code</Text>
              <View style={styles.addByCodeInputRow}>
                <TextInput
                  style={styles.addByCodeInput}
                  placeholder="e.g. ABC123"
                  value={addCode}
                  onChangeText={(t) => {
                    setAddCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                    setAddResult(null);
                  }}
                  autoCapitalize="characters"
                  maxLength={6}
                  autoCorrect={false}
                  placeholderTextColor={COLORS.muted}
                />
                <TouchableOpacity
                  style={styles.lookupByCodeButton}
                  onPress={handleLookupByCode}
                  disabled={addLookupLoading || addCode.length !== 6}
                >
                  {addLookupLoading ? (
                    <ActivityIndicator color={COLORS.gold} size="small" />
                  ) : (
                    <Text style={styles.lookupByCodeButtonText}>Look up</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {addResult && (
              <View style={styles.addResultCard}>
                {!addResult.found && <Text style={styles.addResultText}>No user found with this code.</Text>}
                {'isSelf' in addResult && addResult.isSelf && <Text style={styles.addResultText}>This is your own code.</Text>}
                {addResult.found && !('isSelf' in addResult) && (
                  <>
                    <View style={styles.addResultRow}>
                      <AvatarImage
                        user={{ avatarPath: addResult.avatarPath, avatarUrl: addResult.avatarUrl }}
                        displayName={addResult.displayName}
                        size={r.avatarSize}
                        style={styles.addResultAvatar}
                      />
                      <View style={[styles.friendInfo, { marginLeft: r.infoMarginLeft }]}>
                        <Text style={[styles.friendName, { fontSize: r.nameSize }]}>{addResult.displayName}</Text>
                        <Text style={[styles.friendRating, { fontSize: r.subSize }]}>Rating: {addResult.rating}</Text>
                        {addResult.rank && (
                          <Text style={[styles.friendTier, { fontSize: r.tierSize }]}>
                            {TIER_INFO[addResult.rank.tier]?.piece ?? '♙'} {TIER_INFO[addResult.rank.tier]?.label ?? addResult.rank.tier} · #{addResult.rank.globalRank}
                          </Text>
                        )}
                        {(addResult.titles?.globalGM || addResult.titles?.nationalGM) && (
                          <View style={[styles.friendTitlesRow, { marginTop: r.titlesMarginTop, gap: r.titlesGap }]}>
                            {addResult.titles.globalGM && <Text style={[styles.friendTitleBadge, { fontSize: r.badgeSize }]}>👑 World GrandMaster</Text>}
                            {addResult.titles.nationalGM && <Text style={[styles.friendTitleBadge, { fontSize: r.badgeSize }]}>🏆 {getNationalGrandmasterLabel(undefined)}</Text>}
                          </View>
                        )}
                        <Text style={[styles.friendWl, { fontSize: r.wlSize }]}>W–L: {addResult.wins}–{addResult.losses}</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.addAsFriendButton} onPress={handleAddByCode} disabled={addAdding}>
                      {addAdding ? <ActivityIndicator color={COLORS.gold} /> : <Text style={styles.addAsFriendButtonText}>Send request</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
            {pendingRequests.length > 0 && (
              <View style={styles.pendingRequestsSection}>
                <Text style={styles.friendsSectionTitle}>Friend requests</Text>
                {pendingRequestsLoading ? (
                  <ActivityIndicator color={COLORS.gold} style={{ marginVertical: 8 }} />
                ) : (
                  pendingRequests.map((req) => (
                    <View key={req.fromUid} style={[styles.friendRow, styles.pendingRequestRow, { paddingVertical: r.rowPaddingVertical }]}>
                      {req.avatarUrl ? (
                        <Image source={{ uri: req.avatarUrl }} style={[styles.friendAvatar, { width: r.avatarSize, height: r.avatarSize, borderRadius: r.avatarSize / 2 }]} />
                      ) : (
                        <View style={[styles.friendAvatarPlaceholder, { width: r.avatarSize, height: r.avatarSize, borderRadius: r.avatarSize / 2 }]}>
                          <Text style={[styles.friendAvatarLetter, { fontSize: r.nameSize }]}>{req.displayName.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={[styles.friendInfo, { marginLeft: r.infoMarginLeft, flex: 1 }]}>
                        <Text style={[styles.friendName, { fontSize: r.nameSize }]}>{req.displayName}</Text>
                        <Text style={[styles.friendRating, { fontSize: r.subSize }]}>Rating: {req.rating}</Text>
                      </View>
                      <View style={styles.pendingRequestActions}>
                        <TouchableOpacity
                          style={[styles.approveRequestButton, respondingToUid === req.fromUid && styles.pendingRequestButtonDisabled]}
                          onPress={() => handleApproveRequest(req)}
                          disabled={respondingToUid !== null}
                        >
                          {respondingToUid === req.fromUid ? <ActivityIndicator size="small" color={COLORS.gold} /> : <Text style={styles.approveRequestButtonText}>Approve</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.rejectRequestButton, respondingToUid === req.fromUid && styles.pendingRequestButtonDisabled]}
                          onPress={() => handleRejectRequest(req)}
                          disabled={respondingToUid !== null}
                        >
                          <Text style={styles.rejectRequestButtonText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
            {friendsList.length > 0 && (
              <View style={styles.friendsList}>
                <Text style={styles.friendsSectionTitle}>Friends</Text>
                {friendsList.map((f) => (
                  <View key={f.uid} style={[styles.friendRow, { paddingVertical: r.rowPaddingVertical }]}>
                    {f.avatarUrl ? (
                      <Image source={{ uri: f.avatarUrl }} style={[styles.friendAvatar, { width: r.avatarSize, height: r.avatarSize, borderRadius: r.avatarSize / 2 }]} />
                    ) : (
                      <View style={[styles.friendAvatarPlaceholder, { width: r.avatarSize, height: r.avatarSize, borderRadius: r.avatarSize / 2 }]}>
                        <Text style={[styles.friendAvatarLetter, { fontSize: r.nameSize }]}>{f.displayName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={[styles.friendInfo, { marginLeft: r.infoMarginLeft }]}>
                      <Text style={[styles.friendName, { fontSize: r.nameSize }]}>{f.displayName}</Text>
                      <Text style={[styles.friendRating, { fontSize: r.subSize }]}>Rating: {f.rating}</Text>
                      {f.rank && (
                        <Text style={[styles.friendTier, { fontSize: r.tierSize }]}>
                          {TIER_INFO[f.rank.tier]?.piece ?? '♙'} {TIER_INFO[f.rank.tier]?.label ?? f.rank.tier} · #{f.rank.globalRank}
                        </Text>
                      )}
                      {(f.titles?.globalGM || f.titles?.nationalGM) && (
                        <View style={[styles.friendTitlesRow, { marginTop: r.titlesMarginTop, gap: r.titlesGap }]}>
                          {f.titles.globalGM && <Text style={[styles.friendTitleBadge, { fontSize: r.badgeSize }]}>👑 World GrandMaster</Text>}
                          {f.titles.nationalGM && <Text style={[styles.friendTitleBadge, { fontSize: r.badgeSize }]}>🏆 {getNationalGrandmasterLabel(undefined)}</Text>}
                        </View>
                      )}
                      <Text style={[styles.friendWl, { fontSize: r.wlSize }]}>W–L: {f.wins}–{f.losses}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeFriendButton}
                      onPress={() => handleRemoveFriend(f)}
                      disabled={removingUid === f.uid}
                    >
                      {removingUid === f.uid ? (
                        <ActivityIndicator size="small" color={COLORS.muted} />
                      ) : (
                        <Text style={styles.removeFriendButtonText}>Remove</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  profileCompactScroll: {
    flexGrow: 1,
    minHeight: '100%',
  },
  profileCompactContent: {
    padding: 12,
  },
  content: {
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: COLORS.muted,
  },
  noAccountText: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    color: COLORS.text,
  },
  noAccountSubtext: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 24,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  loginButtonText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.muted,
    fontSize: 15,
  },
  secureBanner: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  secureBannerCompact: {
    padding: 10,
    marginBottom: 12,
  },
  secureBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
    marginBottom: 4,
  },
  secureBannerSubtext: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 8,
  },
  secureBannerLink: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: COLORS.incorrect,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerCompact: {
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  titleCompact: {
    fontSize: 26,
  },
  editButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profileSectionCompact: {
    marginBottom: 12,
    paddingBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  avatarCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatarPlaceholderCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
  },
  avatarPlaceholderText: {
    color: COLORS.text,
    fontSize: 40,
    fontWeight: 'bold',
  },
  avatarPlaceholderTextCompact: {
    fontSize: 28,
  },
  displayName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  displayNameCompact: {
    fontSize: 20,
    marginBottom: 4,
  },
  country: {
    fontSize: 13,
    color: COLORS.muted,
  },
  rankSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  rankSectionCompact: {
    marginTop: 10,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tierPiece: {
    fontSize: 32,
    color: COLORS.gold,
  },
  tierPieceCompact: {
    fontSize: 24,
  },
  tierLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  tierLabelCompact: {
    fontSize: 16,
  },
  provisionalBadge: {
    backgroundColor: COLORS.muted,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  provisionalBadgeText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '600',
  },
  rankSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 8,
  },
  rankModeLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 4,
  },
  rankByModeSection: {
    marginTop: 16,
    width: '100%',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rankByModeSectionCompact: {
    marginTop: 8,
    paddingTop: 8,
  },
  rankByModeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 8,
  },
  rankByModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rankByModeRowCompact: {
    paddingVertical: 2,
  },
  rankByModeLabel: {
    fontSize: 13,
    color: COLORS.text,
  },
  rankByModeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  rankByModeTier: {
    fontSize: 12,
    color: COLORS.muted,
  },
  titlesContainer: {
    width: '100%',
    marginTop: 16,
    gap: 12,
  },
  titlesContainerCompact: {
    marginTop: 8,
    gap: 6,
  },
  titleBadge: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titleBadgeCompact: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  titleBadgeGlobal: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.gold,
  },
  titleBadgeNational: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.border,
  },
  titleBadgeIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  titleBadgeIconCompact: {
    fontSize: 24,
    marginBottom: 4,
  },
  titleBadgeLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  titleBadgeLabelCompact: {
    fontSize: 10,
  },
  titleBadgeText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  titleBadgeTextCompact: {
    fontSize: 14,
  },
  statsSection: {
    marginBottom: 24,
  },
  statsSectionCompact: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.gold,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  sectionTitleCompact: {
    fontSize: 16,
    marginBottom: 6,
  },
  statsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsCardCompact: {
    padding: 10,
    borderRadius: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statsRowCompact: {
    paddingVertical: 8,
  },
  statsRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    justifyContent: 'space-between',
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsItemLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
    fontWeight: '600',
  },
  statsItemValue: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.gold,
  },
  statsItemValueCompact: {
    fontSize: 18,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  ratingChange: {
    fontSize: 13,
    fontWeight: '600',
  },
  ratingChangeUp: {
    color: COLORS.gold,
  },
  ratingChangeDown: {
    color: COLORS.incorrect,
  },
  ratingChangeZero: {
    color: COLORS.muted,
  },
  statsDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  studyReviewsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  studyReviewsListLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 8,
    fontWeight: '600',
  },
  studyReviewsScroll: {
    maxHeight: 120,
  },
  studyReviewItem: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
  },
  statsTotalLabel: {
    fontSize: 13,
    color: COLORS.muted,
    flex: 1,
    fontWeight: '600',
  },
  statsTotalValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  friendCodeRow: {
    marginBottom: 12,
  },
  friendCodeLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
    fontWeight: '600',
  },
  friendCodeLoading: {
    fontSize: 16,
    color: COLORS.muted,
  },
  friendCodeErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  friendCodeErrorText: {
    fontSize: 14,
    color: COLORS.incorrect,
    flex: 1,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    minWidth: 72,
    alignItems: 'center',
  },
  retryButtonText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '600',
  },
  friendCodeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  friendCodeValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 2,
  },
  copyButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  copyButtonText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '600',
  },
  addByCodeRow: {
    marginBottom: 16,
  },
  addByCodeLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 8,
    fontWeight: '600',
  },
  addByCodeInputRow: {
    flexDirection: 'column',
    gap: 10,
  },
  addByCodeInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    letterSpacing: 2,
  },
  lookupByCodeButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  lookupByCodeButtonText: {
    color: COLORS.gold,
    fontWeight: '600',
    fontSize: 14,
  },
  addResultCard: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addResultText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  addResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addResultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  addAsFriendButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    alignItems: 'center',
  },
  addAsFriendButtonText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '600',
  },
  friendsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 8,
  },
  pendingRequestsSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  pendingRequestRow: {
    borderTopWidth: 0,
  },
  pendingRequestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  approveRequestButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  approveRequestButtonText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '600',
  },
  rejectRequestButton: {
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rejectRequestButtonText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  pendingRequestButtonDisabled: {
    opacity: 0.6,
  },
  friendsList: {
    gap: 12,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  friendAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarLetter: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '700',
  },
  friendInfo: {
    marginLeft: 12,
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  friendRating: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 2,
  },
  friendTier: {
    fontSize: 12,
    color: COLORS.gold,
    marginTop: 2,
  },
  friendTitlesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 6,
  },
  friendTitleBadge: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '600',
  },
  friendWl: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  removeFriendButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 8,
    justifyContent: 'center',
    minWidth: 72,
    alignItems: 'center',
  },
  removeFriendButtonText: {
    fontSize: 13,
    color: COLORS.incorrect,
    fontWeight: '600',
  },
});



