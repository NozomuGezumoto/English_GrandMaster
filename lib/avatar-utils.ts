/**
 * プロフィール画像を Firebase Storage にアップロードし、avatarPath を返す。
 * 表示時は getAvatarUrl で downloadURL を取得する。
 *
 * Web: Firebase Web SDK (uploadBytes) を使用
 * iOS/Android: Storage REST API + Web SDK の認証トークンを使用
 *   （@react-native-firebase/storage は Web SDK の auth と連携せず [storage/unauthorized] になるため）
 */
import { Platform } from 'react-native';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from './firebase';
import type { User as FirestoreUser } from '../types/firestore';
import Constants from 'expo-constants';

/**
 * 画像を Storage にアップロード。users/{uid}/avatar/{timestamp}.jpg
 * @param localUri - 画像のローカル URI（file:// または data: の場合は base64）
 * - Web: data URL を imageUriToUploadable で Blob に変換してから呼ぶ
 * - React Native: expo-image-picker の asset.uri（file://）をそのまま渡す
 */
export async function uploadAvatarToStorage(
  uid: string,
  localUri: string,
  mimeType: string = 'image/jpeg'
): Promise<{ avatarPath: string }> {
  const timestamp = Date.now();
  // HEIC は allowsEditing で JPEG に変換されることが多いが、念のため jpg 扱い
  const ext = mimeType.includes('png') && !mimeType.includes('heic') ? 'png' : 'jpg';
  const path = `users/${uid}/avatar/${timestamp}.${ext}`;
  const uploadMimeType = mimeType.includes('heic') ? 'image/jpeg' : mimeType;

  if (Platform.OS === 'web') {
    // Web: Firebase Web SDK 使用（data URL → fetch → blob → uploadBytes）
    const { data, mimeType: resolvedMime } = await imageUriToUploadable(localUri);
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, data as Blob, { contentType: resolvedMime });
    return { avatarPath: path };
  }

  // React Native: Storage REST API + Web SDK 認証トークン（putFile は Web SDK auth と非連携のため unauthorized になる）
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to upload avatar');

  const token = await user.getIdToken(true);
  const bucket = Constants.expoConfig?.extra?.firebase?.storageBucket;
  if (!bucket) throw new Error('Firebase storageBucket not configured');

  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(path)}`;

  const FileSystem = await import('expo-file-system/legacy');

  // ph:// (iOS), content:// (Android), assets-library:// は uploadAsync で読めない場合があるため file:// にコピー
  const needsCopy = localUri.startsWith('ph://') || localUri.startsWith('content://') || localUri.startsWith('assets-library://');
  let filePath = localUri;
  if (needsCopy) {
    const dest = `${FileSystem.cacheDirectory}avatar-upload-${Date.now()}.${ext}`;
    try {
      await FileSystem.copyAsync({ from: localUri, to: dest });
      filePath = dest;
    } catch (copyErr) {
      console.warn('[avatar] copyAsync failed for', localUri.substring(0, 30), copyErr);
      throw new Error('Cannot process selected image. Try choosing a different photo.');
    }
  }
  const res = await FileSystem.uploadAsync(uploadUrl, filePath, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': uploadMimeType,
    },
  });

  if (res.status >= 400) {
    const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    console.warn('[avatar] Upload failed:', { status: res.status, uriScheme: localUri.split(':')[0], body: body?.substring(0, 200) });
    throw new Error(`Storage upload failed: ${res.status}. Try a different image or check your connection.`);
  }

  return { avatarPath: path };
}

/**
 * 画像 URI を Blob に変換（Web 用のみ。data URL から Blob を取得）
 * React Native では imageUriToUploadable は使わず、localUri をそのまま uploadAvatarToStorage に渡す
 */
export async function imageUriToUploadable(
  uri: string
): Promise<{ data: Blob | Uint8Array; mimeType: string }> {
  if (uri.startsWith('data:')) {
    const res = await fetch(uri);
    const blob = await res.blob();
    const mimeType = uri.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
    return { data: blob, mimeType };
  }
  if (uri.startsWith('file://') || uri.startsWith('http')) {
    const res = await fetch(uri);
    const blob = await res.blob();
    return { data: blob, mimeType: blob.type || 'image/jpeg' };
  }
  throw new Error('Unsupported URI format for web upload');
}

/**
 * Firestore ユーザーデータから表示用 URL を取得。
 * avatarPath があれば Storage から getDownloadURL。なければ avatarUrl（後方互換）。
 */
export async function getAvatarUrl(user: Pick<FirestoreUser, 'avatarPath' | 'avatarUrl'> | null | undefined): Promise<string | null> {
  if (!user) return null;
  if (user.avatarPath) {
    try {
      if (Platform.OS === 'web') {
        const storageRef = ref(storage, user.avatarPath);
        return await getDownloadURL(storageRef);
      }
      // React Native: Storage REST API で metadata 取得し download URL を構築（Web SDK auth トークン使用）
      const currentUser = auth.currentUser;
      if (!currentUser) return user.avatarUrl || null;

      const token = await currentUser.getIdToken(true);
      const bucket = Constants.expoConfig?.extra?.firebase?.storageBucket;
      if (!bucket) return user.avatarUrl || null;

      const encodedPath = encodeURIComponent(user.avatarPath);
      const metaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}`;

      const res = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Metadata failed: ${res.status}`);

      const meta = (await res.json()) as { downloadTokens?: string; metadata?: { firebaseStorageDownloadTokens?: string } };
      const downloadToken = meta.downloadTokens ?? meta.metadata?.firebaseStorageDownloadTokens;
      if (!downloadToken) throw new Error('No download token');

      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    } catch (e) {
      console.warn('[avatar] getDownloadURL failed:', user.avatarPath, e);
      return user.avatarUrl || null;
    }
  }
  return user.avatarUrl || null;
}
