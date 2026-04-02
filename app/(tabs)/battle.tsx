import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  TextInput,
  ScrollView,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { TowerScreenBackground } from '../components/tower/TowerScreenBackground';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { auth, functions, httpsCallable, callFunctionWithAuth, db } from '../../lib/firebase';
import { getRandomQuestionIdsForToeic } from '../../lib/study-questions';
import { getRandomListeningQuestionIds } from '../../lib/listening-response-questions';
import { signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { User as FirestoreUser, ToeicLevel } from '../../types/firestore';
import { COUNTRY_NAMES } from '../../lib/countries';
import { TOEIC_LEVELS, LEVEL_DISPLAY, ratingToToeicLevel } from '../../lib/levels';
import Constants from 'expo-constants';
import { playClickSound, preloadClickSound, clearClickSoundCache } from '../../lib/click-sound';
import { preloadBattleSound, clearBattleSoundCache } from '../../lib/battle-sound';
export default function BattleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const safeTop = 24 + insets.top;
  /** タブバー＋モバイルブラウザの下ツールバー分（Web は insets が 0 になりがち） */
  const scrollBottomPad = Platform.OS === 'web' ? 128 + Math.max(insets.bottom, 16) : 32 + insets.bottom;
  const hPad = Math.min(24, Math.max(10, Math.round(windowWidth * 0.05)));
  const titleWordSize = windowWidth < 340 ? 18 : windowWidth < 380 ? 20 : windowWidth < 400 ? 22 : windowWidth < 480 ? 28 : 36;
  const titleIconH = windowWidth < 340 ? 28 : windowWidth < 400 ? 32 : 40;
  const ornamentWidth = Math.min(220, Math.max(100, windowWidth - hPad * 2 - 8));
  const statBigSize = windowWidth < 340 ? 24 : windowWidth < 400 ? 28 : 34;
  const statSmallSize = windowWidth < 340 ? 18 : windowWidth < 400 ? 20 : 22;
  const narrowTitle = windowWidth < 430;
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [showRoomInput, setShowRoomInput] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userData, setUserData] = useState<FirestoreUser | null>(null);
  const [showUserInfo, setShowUserInfo] = useState(false);

  // 認証状態を監視（displayNameがあればログイン済みとみなす）
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // displayNameが設定されていればログイン済みとみなす
      setIsLoggedIn(!!user && !!user.displayName);
      setUserDisplayName(user?.displayName || null);
      console.log('[Battle] Auth state changed:', {
        uid: user?.uid,
        isAnonymous: user?.isAnonymous,
        displayName: user?.displayName,
      });

      // ユーザーデータを取得
      if (user?.uid) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const data = userDoc.data() as FirestoreUser;
            setUserData(data);
            console.log('[Battle] User data loaded:', data);
          } else {
            console.log('[Battle] User document not found');
            setUserData(null);
          }
        } catch (error) {
          console.error('[Battle] Error loading user data:', error);
        }
      } else {
        setUserData(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // デバッグ: 環境情報をログ出力 / クリック音プリロード
  useEffect(() => {
    preloadClickSound();
    console.log('[Battle] Component mounted');
    console.log('[Battle] useEmulator:', Constants.expoConfig?.extra?.useEmulator);
    console.log('[Battle] emulatorHost:', Constants.expoConfig?.extra?.emulatorHost);
    if (typeof window !== 'undefined' && window.location) {
      console.log('[Battle] window.location.hostname:', window.location.hostname);
      console.log('[Battle] window.location.href:', window.location.href);
    }
    console.log('[Battle] auth.currentUser:', auth.currentUser?.uid || 'not signed in');
  }, []);

  // キャンセルやマッチから戻ってきたときにクリック音・バトル音を再度有効にする（キャッシュをクリアしてプリロード）
  useFocusEffect(
    useCallback(() => {
      clearClickSoundCache();
      clearBattleSoundCache();
      preloadClickSound();
    }, [])
  );

  // 匿名ログイン（簡易版）。トークン取得まで待つ（unauthenticated 防止）
  const ensureAuth = async () => {
    if (!auth.currentUser) {
      console.log('[ensureAuth] Signing in anonymously...');
      try {
        const userCredential = await signInAnonymously(auth);
        console.log('[ensureAuth] Signed in successfully:', userCredential.user.uid);
      } catch (error: any) {
        console.error('[ensureAuth] Sign in error:', error);
        throw error;
      }
    } else {
      console.log('[ensureAuth] Already signed in:', auth.currentUser.uid);
    }
    // トークンが Functions に渡るよう確実に取得してから次へ進む（本番 401 回避）
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
      // 匿名ログイン直後はサーバー側でトークンが有効になるまで少し遅れることがある
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  // AI対戦・友達対戦用モーダル（1: 問題タイプ → 2: 難易度で開始）
  const [showQuestionTypeModal, setShowQuestionTypeModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'ai' | 'friend' | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<ToeicLevel>(730);
  const [aiFriendModalStep, setAiFriendModalStep] = useState<'questionType' | 'difficulty'>('questionType');
  const [pendingQuestionType, setPendingQuestionType] = useState<'choice' | 'dictation' | 'listening' | null>(null);
  // ランクマッチ用：1つの Ranked Match から 4-Choice / Dictation を選択
  const [showRankedTypeModal, setShowRankedTypeModal] = useState(false);

  const startAIMatch = async (questionType: 'choice' | 'dictation' | 'listening', level: ToeicLevel) => {
    try {
      console.log('AI対戦開始ボタンがクリックされました', { questionType, level });
      setLoading(true);

      await ensureAuth();
      const questionCount = questionType === 'dictation' ? 5 : 10;

      const payload: Record<string, unknown> = {
        mode: 'ai',
        lang: 'en',
        questionType,
        questionCount,
        level,
      };
      if (questionType === 'choice') {
        const localIds = getRandomQuestionIdsForToeic(level, questionCount);
        if (localIds.length === questionCount) payload.questionIds = localIds;
      }
      if (questionType === 'listening') {
        const listeningIds = getRandomListeningQuestionIds(level, questionCount);
        if (listeningIds.length === questionCount) payload.questionIds = listeningIds;
      }
      // トークン明示で呼ぶ（httpsCallable で unauthenticated になる場合の回避）
      const result = await callFunctionWithAuth<{ matchId?: string; roomCode?: string }>('createMatch', payload);
      
      console.log('createMatch結果:', result);
      const { matchId } = result;
      if (!matchId) {
        Alert.alert('Error', 'Could not create match. Please try again.');
        return;
      }
      console.log('matchId:', matchId);
      
      console.log('画面遷移中...');
      router.push(`/match/${matchId}`);
    } catch (error: any) {
      console.error('エラー詳細:', error);
      console.error('エラーメッセージ:', error.message);
      console.error('エラーコード:', error.code);
      Alert.alert('Error', `Could not start match: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // 友達対戦作成
  const createFriendMatch = async (questionType: 'choice' | 'dictation' | 'listening', level: ToeicLevel) => {
    try {
      setLoading(true);
      await ensureAuth();
      const questionCount = questionType === 'dictation' ? 5 : 10;
      
      const createMatch = httpsCallable(functions, 'createMatch');
      const payload: Record<string, unknown> = {
        mode: 'friend',
        lang: 'en',
        questionType,
        questionCount,
        level,
      };
      if (questionType === 'listening') {
        const listeningIds = getRandomListeningQuestionIds(level, questionCount);
        if (listeningIds.length === questionCount) payload.questionIds = listeningIds;
      }
      const result = await createMatch(payload);
      
      console.log('[createFriendMatch] Result:', result.data);
      const { matchId, roomCode } = result.data as { matchId?: string; roomCode?: string };
      if (!matchId || !roomCode) {
        Alert.alert('Error', 'Could not create room. Please try again.');
        return;
      }
      console.log('[createFriendMatch] Match created:', matchId, 'Room code:', roomCode);
      Alert.alert('Room Code', `Code: ${roomCode}\n\nShare this code with your friend to play together.`);
      router.push(`/match/${matchId}`);
    } catch (error: any) {
      console.error('[createFriendMatch] Error:', error);
      console.error('[createFriendMatch] Error code:', error.code);
      console.error('[createFriendMatch] Error message:', error.message);
      const errorMessage = error.message || 'Could not create match';
      Alert.alert('Error', `Could not create match: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // 友達対戦参加
  const joinFriendMatch = async () => {
    if (!roomCode || roomCode.length !== 6) {
      Alert.alert('Error', 'Please enter a 6-character room code');
      return;
    }

    try {
      setLoading(true);
      console.log('[joinFriendMatch] Starting join process...');
      await ensureAuth();
      console.log('[joinFriendMatch] Auth completed:', auth.currentUser?.uid);
      
      console.log('[joinFriendMatch] Calling joinFriendMatch function with roomCode:', roomCode);
      const joinMatch = httpsCallable(functions, 'joinFriendMatch');
      const result = await joinMatch({ roomCode });
      
      console.log('[joinFriendMatch] Result:', result.data);
      const { matchId } = result.data as { matchId?: string };
      if (!matchId) {
        Alert.alert('Error', 'Invalid room code or room not found.');
        return;
      }
      console.log('[joinFriendMatch] Navigating to match:', matchId);
      router.push(`/match/${matchId}`);
    } catch (error: any) {
      console.error('[joinFriendMatch] Error:', error);
      console.error('[joinFriendMatch] Error code:', error.code);
      console.error('[joinFriendMatch] Error message:', error.message);
      const errorMessage = error.message || 'Could not join match';
      Alert.alert('Error', `Could not join match: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // ランクマッチ開始
  const startRankedMatch = async (questionType: 'choice' | 'dictation' | 'listening' | 'overall') => {
    console.log('[startRankedMatch] ===== Button pressed =====', { questionType });
    console.log('[startRankedMatch] Current user:', auth.currentUser);
    console.log('[startRankedMatch] Display name:', auth.currentUser?.displayName);
    console.log('[startRankedMatch] Loading state:', loading);
    
    // まず匿名ログインを試みる（まだログインしていない場合）
    if (!auth.currentUser) {
      console.log('[startRankedMatch] No user, attempting anonymous login first...');
      try {
        await ensureAuth();
        console.log('[startRankedMatch] Anonymous login successful');
      } catch (error) {
        console.error('[startRankedMatch] Anonymous login failed:', error);
        Alert.alert('Error', 'Sign-in failed');
        return;
      }
    }
    
    // ログイン必須チェック（匿名ユーザーでもdisplayNameがあればOK）
    if (!auth.currentUser) {
      console.log('[startRankedMatch] Still no user after ensureAuth, navigating to login');
      Alert.alert(
        'Account required',
        'An account is required to play Ranked Match',
        [
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => {
              console.log('[startRankedMatch] User cancelled');
            },
          },
          {
            text: 'Create account',
            onPress: () => {
              console.log('[startRankedMatch] Navigating to login');
              setTimeout(() => {
                router.push('/login');
              }, 100);
            },
          },
        ],
        { cancelable: false }
      );
      return;
    }

    // displayNameが設定されているかチェック
    if (!auth.currentUser.displayName) {
      console.log('[startRankedMatch] No display name, navigating directly to login');
      // アラートを表示せずに直接ログイン画面に遷移
      router.push('/login');
      return;
    }
    
    console.log('[startRankedMatch] All checks passed, proceeding with match creation');

    try {
      console.log('[startRankedMatch] Starting ranked match...');
      console.log('[startRankedMatch] User:', auth.currentUser?.uid);
      setLoading(true);
      
      console.log('[startRankedMatch] Calling findRankedMatch function...');
      const findMatch = httpsCallable(functions, 'findRankedMatch');
      const findPayload: { lang: string; questionType: string; questionIds?: string[]; listeningIds?: string[] } = { lang: 'en', questionType };
      const ratingForLevel = questionType === 'overall'
        ? (typeof userData?.ratingOverall === 'number' ? userData.ratingOverall : typeof userData?.rating === 'number' ? userData.rating : 1000)
        : (questionType === 'listening'
          ? (typeof userData?.ratingListening === 'number' ? userData.ratingListening : 1000)
          : (questionType === 'dictation'
            ? (typeof userData?.ratingDictation === 'number' ? userData.ratingDictation : 1000)
            : (typeof userData?.ratingChoice === 'number' ? userData.ratingChoice : typeof userData?.rating === 'number' ? userData.rating : 1000)));
      const toeicLevel = ratingToToeicLevel(ratingForLevel);
      if (questionType === 'listening') {
        findPayload.questionIds = getRandomListeningQuestionIds(toeicLevel, 10);
      }
      if (questionType === 'overall') {
        findPayload.listeningIds = getRandomListeningQuestionIds(toeicLevel, 10);
      }
      const result = await findMatch(findPayload);
      
      console.log('[startRankedMatch] Result:', result.data);
      const { matchId, isWaiting } = result.data as { matchId?: string; isWaiting?: boolean };
      if (!matchId || typeof matchId !== 'string') {
        console.error('[startRankedMatch] No matchId in response:', result.data);
        Alert.alert('Error', 'Could not start match. Please try again.');
        return;
      }
      if (isWaiting) {
        console.log('[startRankedMatch] Waiting for opponent, matchId:', matchId);
        router.push(`/match/${matchId}`);
      } else {
        console.log('[startRankedMatch] Match found, navigating to match:', matchId);
        router.push(`/match/${matchId}`);
      }
    } catch (error: any) {
      console.error('[startRankedMatch] Error:', error);
      console.error('[startRankedMatch] Error code:', error.code);
      console.error('[startRankedMatch] Error message:', error.message);
      const errorMessage = error.message || 'Could not start ranked match';
      Alert.alert('Error', `Could not start ranked match: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // ログアウト
  const handleLogout = async () => {
    try {
      await signOut(auth);
      Alert.alert('Signed out', 'You have been signed out');
    } catch (error: any) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Sign-out failed');
    }
  };

  return (
    <TowerScreenBackground
      style={styles.screenRoot}
      backgroundSource={require('../../assets/home.png')}
    >
      <View style={[styles.container, { paddingTop: safeTop, paddingHorizontal: hPad }]}>

      {/* ログイン状態表示（安全領域内に配置して上部切れ防止） */}
      <View style={[styles.authContainer, { top: insets.top + 12 }]}>
        {isLoggedIn ? (
          <View style={styles.userInfo}>
            <TouchableOpacity
              onPress={() => setShowUserInfo(!showUserInfo)}
              style={styles.userNameButton}
            >
              <Text style={styles.userName}>{userDisplayName || 'User'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              playClickSound();
              setTimeout(() => router.push('/login'), 20);
            }}
            style={styles.loginButton}
          >
            <Text style={styles.loginText}>Sign in</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ユーザー情報表示 */}
      {showUserInfo && userData && (
        <View style={[styles.userInfoModal, { top: safeTop + 40 }]}>
          <ScrollView style={styles.userInfoContent}>
            <Text style={styles.userInfoTitle}>Account</Text>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabel}>UID:</Text>
              <Text style={styles.userInfoValue}>{userData.uid}</Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabel}>Display name:</Text>
              <Text style={styles.userInfoValue}>{userData.displayName}</Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabel}>Country:</Text>
              <Text style={styles.userInfoValue}>{userData.country ? (COUNTRY_NAMES[userData.country] ?? userData.country) : 'Not set'}</Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabel}>Rating:</Text>
              <Text style={styles.userInfoValue}>{userData.rating}</Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabel}>Wins:</Text>
              <Text style={styles.userInfoValue}>{userData.wins}</Text>
            </View>
            <View style={styles.userInfoRow}>
              <Text style={styles.userInfoLabel}>Losses:</Text>
              <Text style={styles.userInfoValue}>{userData.losses}</Text>
            </View>
            {userData.avatarUrl && (
              <View style={styles.userInfoRow}>
                <Text style={styles.userInfoLabel}>Avatar:</Text>
                <Text style={styles.userInfoValue}>Set</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowUserInfo(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={[styles.mainScrollContent, { paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={Platform.OS === 'web'}
      >
      <View
        style={[
          styles.heroHeader,
          { marginTop: Platform.OS === 'web' ? 46 : 18 },
        ]}
      >
        <Text style={styles.modeBadge}>Competitive English Game</Text>
        <View style={[styles.titleOrnamentRow, { width: ornamentWidth }]}>
          <View style={styles.titleOrnamentLine} />
          <View style={styles.titleOrnamentCore} />
          <View style={styles.titleOrnamentLine} />
        </View>
        {narrowTitle ? (
          <View style={styles.titleStack}>
            <View style={[styles.titleRow, styles.titleRowTight]}>
              <Text style={[styles.titleWord, { fontSize: titleWordSize, lineHeight: titleWordSize + 6 }]}>ENGL</Text>
              <Image
                source={require('../../assets/title-i-gold.png')}
                style={[styles.titleIconLetter, { height: titleIconH, width: Math.round(titleIconH * 0.62) }]}
                resizeMode="contain"
              />
              <Text style={[styles.titleWord, { fontSize: titleWordSize, lineHeight: titleWordSize + 6 }]}>SH</Text>
            </View>
            <Text
              style={[styles.titleWord, styles.titleLineGrandmaster, { fontSize: titleWordSize + 1, lineHeight: titleWordSize + 8 }]}
              numberOfLines={2}
            >
              GRANDMASTER
            </Text>
          </View>
        ) : (
          <View style={styles.titleRow}>
            <Text style={[styles.titleWord, { fontSize: titleWordSize, lineHeight: titleWordSize + 6 }]}>ENGL</Text>
            <Image
              source={require('../../assets/title-i-gold.png')}
              style={[styles.titleIconLetter, { height: titleIconH, width: Math.round(titleIconH * 0.62) }]}
              resizeMode="contain"
            />
            <Text style={[styles.titleWord, { fontSize: titleWordSize, lineHeight: titleWordSize + 6 }]}>SH GRANDMASTER</Text>
          </View>
        )}
        <Text style={styles.subtitle}>Real-Time English PvP</Text>
      </View>

      <View style={styles.competitivePanel}>
        <View style={styles.profileStatRow}>
          <View style={[styles.profileStatItem, styles.profileStatItemPrimary]}>
            <Text style={styles.profileStatLabel}>Rating</Text>
            <View style={[styles.profileValueSlot, { minHeight: Math.max(40, statBigSize + 10) }]}>
              <Text
                style={[
                  styles.profileStatValue,
                  styles.profileStatValuePrimary,
                  { fontSize: statBigSize, lineHeight: statBigSize + 6 },
                ]}
                numberOfLines={1}
              >
                {userData?.rating ?? '-'}
              </Text>
            </View>
          </View>
          <View style={styles.profileStatItem}>
            <Text style={styles.profileStatLabel}>Wins</Text>
            <View style={[styles.profileValueSlot, { minHeight: Math.max(40, statBigSize + 10) }]}>
              <Text
                style={[
                  styles.profileStatValue,
                  styles.profileStatValueSecondary,
                  { fontSize: statBigSize, lineHeight: statBigSize + 6 },
                ]}
                numberOfLines={1}
              >
                {userData?.wins ?? '-'}
              </Text>
            </View>
          </View>
          <View style={styles.profileStatItem}>
            <Text style={styles.profileStatLabel}>Losses</Text>
            <View style={[styles.profileValueSlot, { minHeight: Math.max(40, statBigSize + 10) }]}>
              <Text
                style={[
                  styles.profileStatValue,
                  styles.profileStatValueSecondary,
                  { fontSize: statBigSize, lineHeight: statBigSize + 6 },
                ]}
                numberOfLines={1}
              >
                {userData?.losses ?? '-'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <View style={styles.primarySection}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.rankedButton,
              loading && styles.buttonDisabled,
              pressed && !loading && styles.buttonPressed,
              pressed && !loading && styles.rankedButtonPressed,
            ]}
            onPress={() => {
              playClickSound();
              preloadBattleSound();
              setTimeout(() => {
                console.log('[UI] Ranked Match button pressed');
                setShowRankedTypeModal(true);
              }, 20);
            }}
            disabled={loading}
          >
            <Text style={styles.rankedQueueTag}>Multi play</Text>
            <View style={styles.rankedOrnamentRow}>
              <View style={styles.rankedOrnamentLine} />
              <View style={styles.rankedOrnamentGem} />
              <View style={styles.rankedOrnamentLine} />
            </View>
            <Text style={[styles.buttonText, styles.rankedButtonText]}>
              Ranked Match
            </Text>
          </Pressable>
        </View>

        <View style={styles.primarySection}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.rankedButton,
              pressed && styles.buttonPressed,
              pressed && styles.rankedButtonPressed,
            ]}
            onPress={() => {
              playClickSound();
              setTimeout(() => router.push('/tower'), 20);
            }}
          >
            <Text style={styles.rankedQueueTag}>Single Play</Text>
            <View style={styles.rankedOrnamentRow}>
              <View style={styles.rankedOrnamentLine} />
              <View style={styles.rankedOrnamentGem} />
              <View style={styles.rankedOrnamentLine} />
            </View>
            <Text style={[styles.buttonText, styles.rankedButtonText]}>Tower of English</Text>
          </Pressable>
        </View>

        <View style={styles.secondarySection}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              pressed && styles.buttonPressed,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={() => {
              playClickSound();
              preloadBattleSound();
              setTimeout(() => {
                setSelectedMode('ai');
                setAiFriendModalStep('questionType');
                setPendingQuestionType(null);
                setShowQuestionTypeModal(true);
              }, 20);
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonKicker}>Practice</Text>
            <Text style={styles.secondaryButtonText}>VS AI</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              pressed && styles.buttonPressed,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={() => {
              playClickSound();
              preloadBattleSound();
              setTimeout(() => {
                setSelectedMode('friend');
                setAiFriendModalStep('questionType');
                setPendingQuestionType(null);
                setShowQuestionTypeModal(true);
              }, 20);
            }}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonKicker}>Custom Lobby</Text>
            <Text style={styles.secondaryButtonText}>Create Match</Text>
          </Pressable>

          {!showRoomInput ? (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                pressed && styles.buttonPressed,
                pressed && styles.secondaryButtonPressed,
              ]}
              onPress={() => {
                playClickSound();
                preloadBattleSound();
                setTimeout(() => setShowRoomInput(true), 20);
              }}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonKicker}>Code Entry</Text>
              <Text style={styles.secondaryButtonText}>Join Match</Text>
            </Pressable>
          ) : (
            <View style={styles.roomInputContainer}>
              <TextInput
                style={styles.roomInput}
                placeholder="Room code (6 chars)"
                placeholderTextColor="#A3A3A3"
                value={roomCode}
                onChangeText={setRoomCode}
                maxLength={6}
                autoCapitalize="characters"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                  pressed && styles.secondaryButtonPressed,
                ]}
                onPress={() => {
                  playClickSound();
                  preloadBattleSound();
                  setTimeout(() => {
                    console.log('[UI] Join button pressed, roomCode:', roomCode);
                    joinFriendMatch();
                  }, 20);
                }}
                disabled={loading || !roomCode || roomCode.length !== 6}
              >
                <Text style={styles.secondaryButtonText}>Join Match</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
      </ScrollView>

      {/* Ranked Match: GrandMaster をセクション分けして特別感 */}
      {showRankedTypeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalWrapper}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Ranked Match</Text>
              <Text style={styles.modalSubtitle}>Choose question type</Text>

              {/* GrandMaster 専用セクション */}
              <View style={styles.modalSectionGrandMaster}>
                <TouchableOpacity
                  style={styles.modalButtonGrandMaster}
                  onPress={() => {
                    playClickSound();
                    preloadBattleSound();
                    setTimeout(() => {
                      setShowRankedTypeModal(false);
                      startRankedMatch('overall');
                    }, 20);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalButtonGrandMasterText}>GrandMaster</Text>
                </TouchableOpacity>
              </View>

              {/* その他モード */}
              <View style={styles.modalSectionOther}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    playClickSound();
                    preloadBattleSound();
                    setTimeout(() => {
                      setShowRankedTypeModal(false);
                      startRankedMatch('choice');
                    }, 20);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalButtonText}>4-Choice</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    playClickSound();
                    preloadBattleSound();
                    setTimeout(() => {
                      setShowRankedTypeModal(false);
                      startRankedMatch('dictation');
                    }, 20);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalButtonText}>Dictation</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    playClickSound();
                    preloadBattleSound();
                    setTimeout(() => {
                      setShowRankedTypeModal(false);
                      startRankedMatch('listening');
                    }, 20);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalButtonText}>Listening</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowRankedTypeModal(false);
                  clearClickSoundCache();
                  preloadClickSound();
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* レベル・問題タイプ選択モーダル（携帯1画面に収める） */}
      {showQuestionTypeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalWrapper}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalContent}>
                {aiFriendModalStep === 'questionType' ? (
                  <>
                    <Text style={styles.modalTitle}>Select question type</Text>
                    <Text style={styles.modalSubtitle}>
                      {selectedMode === 'ai' ? 'vs AI' : 'Friend match'} · TOEIC · CEFR
                    </Text>
                    <TouchableOpacity
                      style={styles.modalButton}
                      onPress={() => {
                        playClickSound();
                        setTimeout(() => {
                          setPendingQuestionType('choice');
                          setAiFriendModalStep('difficulty');
                        }, 20);
                      }}
                    >
                      <Text style={styles.modalButtonText}>Multiple choice</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalButton}
                      onPress={() => {
                        playClickSound();
                        setTimeout(() => {
                          setPendingQuestionType('dictation');
                          setAiFriendModalStep('difficulty');
                        }, 20);
                      }}
                    >
                      <Text style={styles.modalButtonText}>Dictation</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalButton}
                      onPress={() => {
                        playClickSound();
                        setTimeout(() => {
                          setPendingQuestionType('listening');
                          setAiFriendModalStep('difficulty');
                        }, 20);
                      }}
                    >
                      <Text style={styles.modalButtonText}>Listening</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => {
                        setShowQuestionTypeModal(false);
                        setSelectedMode(null);
                        setAiFriendModalStep('questionType');
                        setPendingQuestionType(null);
                        clearClickSoundCache();
                        preloadClickSound();
                      }}
                    >
                      <Text style={styles.modalCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.modalTitle}>Select difficulty</Text>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalBackButton]}
                      onPress={() => {
                        playClickSound();
                        setTimeout(() => {
                          setAiFriendModalStep('questionType');
                          setPendingQuestionType(null);
                        }, 20);
                      }}
                    >
                      <Text style={styles.modalBackButtonText}>← Change question type</Text>
                    </TouchableOpacity>
                    <View style={styles.levelRow}>
                      {TOEIC_LEVELS.slice()
                        .reverse()
                        .map((lv) => {
                        const { cefr, label } = LEVEL_DISPLAY[lv];
                        const isSelected = selectedLevel === lv;
                        return (
                          <TouchableOpacity
                            key={lv}
                            style={[styles.levelCard, isSelected && styles.levelCardSelected]}
                            onPress={() => {
                              playClickSound();
                              preloadBattleSound();
                              const qt = pendingQuestionType;
                              if (!qt) return;
                              setTimeout(() => setSelectedLevel(lv), 20);
                              setTimeout(() => {
                                setShowQuestionTypeModal(false);
                                setAiFriendModalStep('questionType');
                                setPendingQuestionType(null);
                                if (selectedMode === 'ai') {
                                  startAIMatch(qt, lv);
                                } else {
                                  createFriendMatch(qt, lv);
                                }
                              }, 20);
                            }}
                            activeOpacity={0.8}
                          >
                            <View style={styles.levelCardBadgeColumn}>
                              <View style={[styles.levelCardBadge, isSelected && styles.levelCardBadgeSelected]}>
                                <Text style={[styles.levelCardCefr, isSelected && styles.levelCardCefrSelected]}>{cefr}</Text>
                              </View>
                            </View>
                            <View style={styles.levelCardCenterTexts}>
                              <Text
                                style={[
                                  styles.modalButtonText,
                                  styles.levelCardMainText,
                                  isSelected && styles.levelCardLabelSelected,
                                ]}
                                numberOfLines={2}
                              >
                                {label}
                              </Text>
                              <Text
                                style={[
                                  styles.levelCardMetaText,
                                  isSelected && styles.levelCardToeicSelected,
                                ]}
                              >
                                TOEIC {lv}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => {
                        setShowQuestionTypeModal(false);
                        setSelectedMode(null);
                        setAiFriendModalStep('questionType');
                        setPendingQuestionType(null);
                        clearClickSoundCache();
                        preloadClickSound();
                      }}
                    >
                      <Text style={styles.modalCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
            </View>
            </ScrollView>
          </View>
        </View>
      )}
      </View>
    </TowerScreenBackground>
  );
}

// 高級路線：黒×濃紺×金の2色＋アクセント1色
const COLORS = {
  background: '#121212',
  surface: '#161616',
  primary: '#1B263B',
  primaryHover: '#24324B',
  text: '#F5F5F5',
  muted: '#A3A3A3',
  gold: '#C6A75E',
  cyan: '#8FB6FF',
  border: '#2A2A2A',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

// 微グラデ風の「ほぼ黒」単色（expo-linear-gradient 未導入時）
const BACKGROUND_DARK = '#0A0C10';
const FONT = {
  display: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'Inter, system-ui, sans-serif' }),
  numeric: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  container: {
    flex: 1,
    minHeight: 0,
    maxWidth: '100%',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  mainScroll: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
    minWidth: 0,
  },
  mainScrollContent: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    paddingTop: 0,
  },
  authContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userName: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '600',
    fontFamily: FONT.body,
  },
  userNameButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  logoutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(27, 38, 59, 0.58)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: FONT.body,
  },
  loginButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(27, 38, 59, 0.58)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loginText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: FONT.body,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.gold,
    marginBottom: 8,
    letterSpacing: 1.2,
    textAlign: 'center',
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  titleStack: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    marginBottom: 8,
    minWidth: 0,
  },
  titleLineGrandmaster: {
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 2,
    maxWidth: '100%',
  },
  titleRowTight: {
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 3,
    maxWidth: '100%',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  titleWord: {
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 1.2,
    textAlign: 'center',
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  titleIconLetter: {
    marginTop: 3,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: FONT.body,
  },
  modeBadge: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontFamily: FONT.body,
  },
  heroHeader: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 34,
    paddingTop: 18,
    minWidth: 0,
  },
  titleOrnamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    maxWidth: '100%',
  },
  titleOrnamentLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(198, 167, 94, 0.55)',
  },
  titleOrnamentCore: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(198, 167, 94, 0.75)',
    backgroundColor: 'rgba(143, 182, 255, 0.12)',
    marginHorizontal: 10,
  },
  competitivePanel: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    marginBottom: 20,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  profileStatRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  profileStatItem: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(23, 35, 52, 0.46)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(36, 51, 73, 0.75)',
    alignItems: 'center',
  },
  profileStatItemPrimary: {
    backgroundColor: 'rgba(23, 35, 52, 0.52)',
    borderColor: 'rgba(198, 167, 94, 0.45)',
  },
  profileStatLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    fontFamily: FONT.body,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(2, 6, 14, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  profileStatValue: {
    color: COLORS.text,
    fontWeight: '800',
    fontFamily: FONT.display,
    letterSpacing: 0.3,
    includeFontPadding: false,
    textAlignVertical: 'center',
    width: '100%',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  profileValueSlot: {
    minHeight: 42,
    width: '100%',
    maxWidth: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
  },
  profileStatValuePrimary: {
    color: COLORS.gold,
    includeFontPadding: false,
    textAlignVertical: 'center',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(198, 167, 94, 0.24)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  profileStatValueSecondary: {
    color: '#DFEAFF',
    letterSpacing: 0.8,
    opacity: 0.92,
    marginTop: 0,
    fontFamily: FONT.display,
    includeFontPadding: false,
    textAlignVertical: 'center',
    textShadowColor: 'rgba(143, 182, 255, 0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: '100%',
    gap: 20,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  primarySection: {
    gap: 12,
  },
  secondarySection: {
    gap: 12,
  },
  button: {
    paddingVertical: 17,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(23, 35, 52, 0.46)',
    borderWidth: 1,
    borderColor: 'rgba(42, 61, 90, 0.85)',
  },
  rankedButton: {
    backgroundColor: 'rgba(30, 45, 68, 0.5)',
    borderColor: COLORS.gold,
    paddingVertical: 20,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  rankedButtonPressed: {
    borderColor: '#E0C37A',
    shadowOpacity: 0.28,
  },
  secondaryButton: {
    borderColor: COLORS.border,
    backgroundColor: 'rgba(23, 35, 52, 0.42)',
  },
  secondaryButtonPressed: {
    backgroundColor: 'rgba(30, 45, 68, 0.55)',
    borderColor: '#3C557E',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.96,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontFamily: FONT.body,
  },
  secondaryButtonKicker: {
    color: '#8EA9CF',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: FONT.body,
    marginBottom: 3,
  },
  secondaryButtonText: {
    color: '#D9E6FF',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.9,
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  rankedButtonText: {
    color: COLORS.gold,
    fontSize: 24,
    letterSpacing: 0.6,
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  rankedQueueTag: {
    color: COLORS.cyan,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: FONT.body,
  },
  rankedOrnamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 170,
    marginBottom: 8,
  },
  rankedOrnamentLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(143, 182, 255, 0.35)',
  },
  rankedOrnamentGem: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(143, 182, 255, 0.8)',
    marginHorizontal: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  roomInputContainer: {
    gap: 14,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  roomInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(22, 22, 22, 0.52)',
    color: COLORS.text,
    fontFamily: FONT.numeric,
    letterSpacing: 1.0,
  },
  userInfoModal: {
    position: 'absolute',
    right: 20,
    left: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 100,
    maxHeight: 400,
  },
  userInfoContent: {
    padding: 16,
  },
  userInfoTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: COLORS.gold,
    fontFamily: FONT.display,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  userInfoRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  userInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
    width: 80,
    fontFamily: FONT.body,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  userInfoValue: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
    fontFamily: FONT.body,
  },
  closeButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: FONT.body,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalWrapper: {
    width: '92%',
    maxWidth: 420,
    maxHeight: '92%',
  },
  modalScroll: {
    maxHeight: '100%',
  },
  modalScrollContent: {
    paddingVertical: 12,
    paddingBottom: 20,
  },
  modalContent: {
    backgroundColor: '#101722',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A3A52',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
    color: COLORS.gold,
    letterSpacing: 0.6,
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.muted,
    marginBottom: 14,
    textAlign: 'center',
    fontFamily: FONT.body,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  levelRow: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
    width: '100%',
    alignSelf: 'stretch',
  },
  levelCard: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  levelCardBadgeColumn: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 56,
    marginRight: 14,
  },
  levelCardCenterTexts: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelCardSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.gold,
  },
  levelCardBadge: {
    backgroundColor: '#101722',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  levelCardBadgeSelected: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  levelCardCefr: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D9E6FF',
    letterSpacing: 0.6,
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  levelCardCefrSelected: {
    color: COLORS.background,
  },
  levelCardMainText: {
    textAlign: 'center',
    width: '100%',
    marginBottom: 4,
  },
  levelCardLabelSelected: {
    color: COLORS.gold,
  },
  levelCardMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.muted,
    fontFamily: FONT.body,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    width: '100%',
  },
  levelCardToeicSelected: {
    color: COLORS.gold,
  },
  modalSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
    textAlign: 'center',
    color: COLORS.muted,
    fontFamily: FONT.body,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  modalButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalSectionGrandMaster: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalSectionOther: {
    marginBottom: 4,
  },
  modalButtonGrandMaster: {
    backgroundColor: '#2A2218',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  modalButtonGrandMasterText: {
    color: COLORS.gold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  modalButtonText: {
    color: '#D9E6FF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.9,
    fontFamily: FONT.display,
    textTransform: 'uppercase',
  },
  modalCancelButton: {
    backgroundColor: COLORS.background,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelButtonText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: FONT.body,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  modalBackButton: {
    backgroundColor: 'transparent',
    borderColor: COLORS.muted,
    marginTop: 14,
    marginBottom: 12,
  },
  modalBackButtonText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontFamily: FONT.body,
  },
});

