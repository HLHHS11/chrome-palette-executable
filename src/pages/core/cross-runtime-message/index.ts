// TODO: #2 REFACTOR 余裕があったら, core/rpcみたいに、超型安全なツールとして扱いたい

/**
 * メッセージの識別子と payload 型を束ねた DTO。
 * 送受信機能は持たない (Stripe PaymentIntent と同じ位置付け)。実際の送受信は
 * `CrossRuntimeMessenger` に渡す。
 */
export type CrossRuntimeMessage<T> = {
  readonly key: string;
  // T を型に拘束するための phantom field。実行時には存在しない。
  readonly _payload?: T;
};

// TODO: #2 CHECK わざわざ関数に包む必要あるのか？？普通に型だけエクスポートすれば十分じゃないか？と思う。が、動いてそうなので気にしない。
/** Message を宣言する。 */
export function defineCrossRuntimeMessage<T>(
  key: string
): CrossRuntimeMessage<T> {
  return { key };
}

/**
 * 別の実行コンテキスト (background SW / popup / content script 等) との間で、
 * 受信側がまだ起動していない時点でも Message を受け渡せる送受信クライアント。
 * 受信側が `take()` で取り出した時点でメッセージは消える (ワンショット)。
 *
 * 実装は `chrome.storage.session` を IPC バックエンドに使う。これは MV3 で
 * 「受信側のランタイムがまだ生きていないかもしれない」ケースに対する標準的な解。
 */
export class CrossRuntimeMessenger {
  private isAvailable(): boolean {
    return (
      typeof chrome !== "undefined" &&
      !!chrome.storage &&
      !!chrome.storage.session
    );
  }

  async send<T>(message: CrossRuntimeMessage<T>, payload: T): Promise<void> {
    if (!this.isAvailable()) return;
    await chrome.storage.session.set({ [message.key]: payload });
  }

  async take<T>(message: CrossRuntimeMessage<T>): Promise<T | null> {
    if (!this.isAvailable()) return null;
    try {
      const obj = await chrome.storage.session.get(message.key);
      if (!(message.key in obj)) return null;
      const value = obj[message.key] as T;
      await chrome.storage.session.remove(message.key);
      return value;
    } catch {
      return null;
    }
  }
}
