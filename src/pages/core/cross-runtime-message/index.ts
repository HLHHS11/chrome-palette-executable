/*
 * 今の作りは「同じ key には最新の 1 件だけが残る」シンプルな仕組み。send すると前の値は
 * 上書きされ、take で取り出すと消える。hotkey で popup を開きたいときみたいに「最新 1 件
 * だけ伝われば十分」というケースにはこれで足りる。
 *
 * 一方で「同じ key に複数のメッセージを順番に貯めて、popup が起動したらまとめて読みたい」
 * みたいなケースも考えられる (例: 複数の content script からの情報集約、イベントの溜め込み)。
 * 今のところそういう使い方をしたい場面が無いので作っていないが、必要になったら次のように
 * 育てていきたい:
 *   - 今の `CrossRuntimeMessage` は `CrossRuntimeMessageSlot` に改名し「1 件だけ」用と明示する
 *   - 「複数貯める」用の `CrossRuntimeMessageQueue` を追加し、messenger に enqueue / drain を生やす
 *   - 保存先 (chrome.storage.session) で 1 件として持つか配列として持つかは内部実装の話。
 *     使う側からは Slot か Queue かだけ意識すれば良い形にする
 *
 * あとは、余裕があったら, core/rpcみたいに、超型安全なクライアントを備えたツールとして扱いたい
 */

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
