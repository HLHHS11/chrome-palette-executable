export type StorageAreaName = "local" | "session";

/** ストレージに置く形と、メモリ上で扱う形の相互変換。 */
export interface StorageCellCodec<V> {
  /** 保存されていない場合は `undefined` が渡る。 */
  decode(stored: unknown): V;
  encode(value: V): unknown;
}

/**
 * `chrome.storage` のキー 1 つ分を、メモリ上の写しを介して読み書きする。
 *
 * `chrome.storage` には値の一部だけを書き換える操作もトランザクションも無いので、
 * 素直に使うと「丸ごと読む → 手元で直す → 丸ごと書き戻す」になる。その途中で
 * 別の処理が同じキーを読み書きすると、後から書き戻した側が先の変更を消してしまう。
 *
 * そこで最初に 1 度だけ読み込み、以後はメモリ上の写しを同期的に読み書きする。
 * 読んでから書くまでの間に await を挟まなければ、ほかの処理は割り込めない。
 * ストレージへの反映は、処理が一段落したところでまとめて 1 回行う。
 *
 * 写しは実行コンテキストごとに作られ、互いに同期しない。同じキーを扱うのは
 * 1 つのコンテキスト (通常は background) に限ること。
 */
export class StorageCell<V> {
  private value: V | undefined;
  private loaded = false;
  private loading: Promise<void> | undefined;
  private flushScheduled = false;

  constructor(
    private readonly area: StorageAreaName,
    private readonly key: string,
    private readonly codec: StorageCellCodec<V>
  ) {}

  /** 保存済みの値を読み終えるまで待つ。2 回目以降はすぐ解決する。 */
  async ready(): Promise<void> {
    this.loading ??= chrome.storage[this.area]
      .get(this.key)
      .then((stored) => {
        this.value = this.codec.decode(stored[this.key]);
        this.loaded = true;
      })
      .catch((error: unknown) => {
        // 次の呼び出しで読み直せるようにしておく。
        this.loading = undefined;
        throw error;
      });
    await this.loading;
  }

  /** `ready` が済んでから呼ぶ。返した値を書き換えても写しには響かない。 */
  get(): V {
    if (!this.loaded) {
      throw new Error(`Storage cell "${this.key}" is read before ready().`);
    }
    return structuredClone(this.value as V);
  }

  /** 写しを置き換え、ストレージへの反映を予約する。 */
  set(value: V): void {
    if (!this.loaded) {
      throw new Error(`Storage cell "${this.key}" is written before ready().`);
    }
    this.value = structuredClone(value);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      chrome.storage[this.area]
        .set({ [this.key]: this.codec.encode(this.value as V) })
        .catch((error: unknown) =>
          console.error(`Failed to save "${this.key}". Details:`, error)
        );
    }, 0);
  }
}

const cells = new Map<string, StorageCell<unknown>>();

/**
 * キーに対応するセルを返す。同じ場所・同じキーには、呼び出し元によらず
 * 同じセルを返す。別々に作ると写しが分かれ、互いの変更を上書きし合うため。
 *
 * 2 回目以降に渡した `codec` は使われない。
 */
export function storageCell<V>(
  area: StorageAreaName,
  key: string,
  codec: StorageCellCodec<V>
): StorageCell<V> {
  const id = `${area}:${key}`;
  const existing = cells.get(id);
  if (existing) return existing as StorageCell<V>;
  const cell = new StorageCell(area, key, codec);
  cells.set(id, cell as StorageCell<unknown>);
  return cell;
}
