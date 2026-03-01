/**
 * Web用音声出力ユーティリティ。
 * Bluetooth 等に出力先を切り替えたとき、システムのデフォルト出力を再取得して再生する。
 */

/**
 * 再生前にシステムのデフォルト出力（Bluetooth含む）を使うよう同期する。
 * setSinkId('') で「現在のデフォルトデバイス」に切り替え、デバイス変更後に音が出るようにする。
 */
export async function syncWebAudioToDefaultOutput(element: HTMLAudioElement): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof (element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId !== 'function') return;
  try {
    await (element as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId('');
  } catch {
    // setSinkId が未サポートや制限で失敗する場合がある（Safari等）
  }
}
