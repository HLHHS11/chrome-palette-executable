/**
 * タブ横断検索のために 1 タブ分の状態をスナップショットしたもの。
 *
 * - `reachable` が false のタブ (chrome:// など) は `text` が空文字。
 *   その場合でも title / URL ベースのフォールバック検索の対象になる。
 */
export type TabSnapshot = {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  host: string;
  /** URL のパス + search + hash (ホスト除外)。スコアリングの低重みフィールド。 */
  path: string;
  /** 本文 (`document.body.innerText` を normalized したもの)。 */
  text: string;
  /** content script に届いたか。`chrome://` などは false。 */
  reachable: boolean;
  /** ファビコン URL (popup 表示用)。 */
  favicon?: string;
  /**
   * タブが最後にアクティブだった時刻 (ms epoch)。相対時刻表示と、
   * 重複タブを新しい順に並べるためのキー。取得できない場合は undefined。
   */
  lastAccessed?: number;
};
