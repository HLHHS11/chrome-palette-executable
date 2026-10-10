import { rematchRecords } from "../domain/rematch";
import type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundRecord,
  TabBoundRecordId,
} from "../domain/types";
import type {
  TabBoundState,
  TabBoundStorage,
} from "../storage/tab-bound-storage";

export interface TabBoundStoreOptions<T> {
  storage: TabBoundStorage<T>;
  /**
   * 新しいブラウザセッションに持ち越す値かどうかを判定する。
   *
   * 機能ごとに方針が違うためフックにしてある。たとえばタブ整理は
   * 明示的に保護したタブだけを引き継ぎ、利用統計は毎セッション作り直す。
   * 省略時はすべて持ち越す。
   */
  survivesSession?: (value: T) => boolean;
  /**
   * どのタブにも結びついていないレコードを保持する期間 (ms)。
   *
   * 省略すると無期限。機能によって適切な長さが違うためフックにしてある。
   * メモは「タブを閉じた」だけで孤児になるので、放っておくと際限なく溜まる。
   * 一方でタブ整理の明示保持は「このページは大事」という宣言なので、
   * 時間で捨ててはいけない。
   */
  orphanTtlMs?: number;
  /** テストから差し替えられるようにした ID 生成と時刻取得。 */
  generateId?: () => TabBoundRecordId;
  now?: () => number;
}

/**
 * 値をタブに紐づけて保持する汎用ストア。
 *
 * 同一性は次の順で解決する。
 * 1. tabId ……………… 実行中はこれで一意に決まる。
 * 2. URL + 位置での再結合 … セッション復元後の復旧手段。曖昧なら結びつけない。
 *
 * 2 で決めきれなかったレコードは孤児として保持し、破棄しない。
 * 誤って別のタブに結びつけるより、宙に浮かせてユーザーに選ばせるほうが安全なため。
 */
export class TabBoundStore<T> {
  private readonly storage: TabBoundStorage<T>;
  private readonly survivesSession: (value: T) => boolean;
  private readonly orphanTtlMs: number | undefined;
  private readonly generateId: () => TabBoundRecordId;
  private readonly now: () => number;

  constructor(options: TabBoundStoreOptions<T>) {
    this.storage = options.storage;
    this.survivesSession = options.survivesSession ?? (() => true);
    this.orphanTtlMs = options.orphanTtlMs;
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => Date.now());
  }

  async get(tabId: number): Promise<T | undefined> {
    return this.transact((state) => recordOf(state, tabId)?.value);
  }

  async getRecord(tabId: number): Promise<TabBoundRecord<T> | undefined> {
    return this.transact((state) => recordOf(state, tabId));
  }

  /** タブに値を設定する。既存があれば値と binding を更新する。 */
  async set(tabId: number, value: T, binding: TabBinding): Promise<void> {
    await this.transact(({ records, assignments }) => {
      const existingId = assignments.get(tabId);
      const index = records.findIndex((r) => r.id === existingId);

      if (index >= 0) {
        records[index] = {
          ...records[index],
          value,
          binding,
          updatedAt: this.now(),
        };
      } else {
        const id = this.generateId();
        records.push({ id, value, binding, updatedAt: this.now() });
        assignments.set(tabId, id);
      }

      this.persist(records, assignments);
    });
  }

  /**
   * レコード ID を指定して値だけ差し替える。結びつきと binding は変えない。
   *
   * タブに結びついていないレコードも書き換えられる点が `set` との違い。
   * タイマーのように、タブが閉じられた後も期限が来れば状態が進む値のための入口。
   */
  async setValue(recordId: TabBoundRecordId, value: T): Promise<boolean> {
    return this.transact(({ records, assignments }) => {
      const index = records.findIndex((r) => r.id === recordId);
      if (index < 0) return false;
      records[index] = { ...records[index], value, updatedAt: this.now() };
      this.persist(records, assignments);
      return true;
    });
  }

  /**
   * タブの現在の状態を binding に反映する。値は変えない。
   * 遷移やタブ移動のたびに呼ぶことで、再結合の手がかりを新鮮に保つ。
   */
  async syncBinding(tabId: number, binding: TabBinding): Promise<void> {
    await this.transact(({ records, assignments }) => {
      const id = assignments.get(tabId);
      if (id === undefined) return;
      const index = records.findIndex((r) => r.id === id);
      if (index < 0) return;
      records[index] = { ...records[index], binding, updatedAt: this.now() };
      this.persist(records, assignments);
    });
  }

  /** タブに紐づく値を完全に削除する。 */
  async delete(tabId: number): Promise<void> {
    await this.transact(({ records, assignments }) => {
      const id = assignments.get(tabId);
      if (id === undefined) return;
      assignments.delete(tabId);
      this.persist(
        records.filter((r) => r.id !== id),
        assignments
      );
    });
  }

  /**
   * タブが閉じられたときに結びつきだけを解く。
   * レコードは孤児として残るため、復元されれば再結合できる。
   */
  async detach(tabId: number): Promise<void> {
    await this.transact(({ records, assignments }) => {
      if (!assignments.delete(tabId)) return;
      this.persist(records, assignments);
    });
  }

  /**
   * タブに結びつけずにレコードだけ作る。
   *
   * 「この URL は大事」という宣言が先にあり、実体のタブが後から現れる
   * (あるいは既に失われている) 場合の入口。旧形式データの取り込みにも使う。
   */
  async createOrphan(value: T, binding: TabBinding): Promise<TabBoundRecordId> {
    return this.transact(({ records, assignments }) => {
      const id = this.generateId();
      records.push({ id, value, binding, updatedAt: this.now() });
      this.persist(records, assignments);
      return id;
    });
  }

  /** 結びつきの有無によらず、保持しているレコードすべて。 */
  async allRecords(): Promise<TabBoundRecord<T>[]> {
    return this.transact(({ records }) => records);
  }

  /**
   * いまタブに結びついているレコードを tabId 引きの形でまとめて返す。
   *
   * 一覧や検索は「開いている全タブ分」を欲しがる。`get` をタブごとに呼ぶと
   * タブ数だけ読み出しが走るので、一度で済ませるための入口。
   */
  async attachedRecords(): Promise<Map<number, TabBoundRecord<T>>> {
    return this.transact(({ records, assignments }) => {
      const byId = new Map(records.map((record) => [record.id, record]));
      const attached = new Map<number, TabBoundRecord<T>>();
      for (const [tabId, recordId] of assignments) {
        const record = byId.get(recordId);
        if (record) attached.set(tabId, record);
      }
      return attached;
    });
  }

  /** どのタブにも結びついていないレコード。 */
  async orphans(): Promise<TabBoundRecord<T>[]> {
    return this.transact(({ records, assignments }) => {
      const attached = new Set(assignments.values());
      const now = this.now();
      return records.filter(
        (record) => !attached.has(record.id) && !this.isExpired(record, now)
      );
    });
  }

  /**
   * 期限切れの孤児をストレージから消す。消した件数を返す。
   *
   * 読み出し (`orphans`) は期限切れを黙って除くので、表示だけならこれを
   * 呼ばなくても正しい。こちらは保存領域を増やし続けないための後始末。
   */
  async pruneExpiredOrphans(): Promise<number> {
    if (this.orphanTtlMs === undefined) return 0;
    return this.transact(({ records, assignments }) => {
      const now = this.now();
      const attached = new Set(assignments.values());
      const kept = records.filter(
        (record) => attached.has(record.id) || !this.isExpired(record, now)
      );
      if (kept.length === records.length) return 0;
      this.persist(kept, assignments);
      return records.length - kept.length;
    });
  }

  private isExpired(record: TabBoundRecord<T>, now: number): boolean {
    if (this.orphanTtlMs === undefined) return false;
    // 印がまだ無いレコードは、次の書き込みで now が刻まれるまで猶予する。
    if (record.detachedAt === undefined) return false;
    return now - record.detachedAt >= this.orphanTtlMs;
  }

  /** 孤児レコードをタブに手動で結びつける。曖昧で自動結合できなかったときの受け皿。 */
  async adoptOrphan(
    recordId: TabBoundRecordId,
    tabId: number
  ): Promise<boolean> {
    return this.transact(({ records, assignments }) => {
      if (!records.some((r) => r.id === recordId)) return false;
      if ([...assignments.values()].includes(recordId)) return false;
      assignments.set(tabId, recordId);
      this.persist(records, assignments);
      return true;
    });
  }

  /**
   * 孤児レコードをまとめてタブに結びつける。結びつけた tabId を返す。
   *
   * 既に結びついているレコードと、既に別のレコードを持っているタブは飛ばす。
   * 組み合わせを決めてから呼ばれるまでの間に状態が変わっていても、
   * 結びつきを奪い合わないようにするため。
   */
  async adoptOrphans(
    pairs: ReadonlyMap<TabBoundRecordId, number>
  ): Promise<number[]> {
    return this.transact(({ records, assignments }) => {
      const known = new Set(records.map((r) => r.id));
      const attached = new Set(assignments.values());
      const adopted: number[] = [];
      for (const [recordId, tabId] of pairs) {
        if (!known.has(recordId) || attached.has(recordId)) continue;
        if (assignments.has(tabId)) continue;
        assignments.set(tabId, recordId);
        attached.add(recordId);
        adopted.push(tabId);
      }
      if (adopted.length > 0) this.persist(records, assignments);
      return adopted;
    });
  }

  async forgetOrphan(recordId: TabBoundRecordId): Promise<boolean> {
    return this.transact(({ records, assignments }) => {
      const next = records.filter((r) => r.id !== recordId);
      if (next.length === records.length) return false;
      this.persist(next, assignments);
      return true;
    });
  }

  /**
   * 新しいブラウザセッションの開始時に、保持しているレコードを
   * 現在開いているタブへ結び直す。`runtime.onStartup` から呼ぶ想定。
   *
   * `survivesSession` が false を返す値はここで捨てる。
   */
  async rematch(
    candidates: readonly RematchCandidate[]
  ): Promise<RematchOutcome> {
    return this.transact(({ records }) => {
      const surviving = records.filter((r) => this.survivesSession(r.value));
      const outcome = rematchRecords(surviving, candidates);

      const assignments = new Map<number, TabBoundRecordId>();
      for (const [recordId, tabId] of outcome.matched) {
        assignments.set(tabId, recordId);
      }
      this.persist(surviving, assignments);
      return outcome;
    });
  }

  /**
   * 保存内容を読んで `operation` に渡す。
   *
   * 読み込みの完了を待った後は、`operation` が書き戻すまで同期的に進む。
   * そのため同時に来た操作同士でも、互いの変更を上書きすることがない。
   * `operation` の中で await してはいけない。
   */
  private async transact<R>(
    operation: (state: TabBoundState<T>) => R
  ): Promise<R> {
    await this.storage.ready();
    return operation(this.storage.read());
  }

  private persist(
    records: readonly TabBoundRecord<T>[],
    assignments: Map<number, TabBoundRecordId>
  ): void {
    this.storage.write({
      records: this.stampDetachment(records, assignments),
      assignments,
    });
  }

  /**
   * 結びついていないレコードに「いつ孤児になったか」を刻み、結びついた
   * レコードからはその印を外す。
   *
   * 書き込み経路がひとつしかないので、ここで揃えておけば detach / rematch /
   * adoptOrphan のどれを通っても印が食い違わない。既に印があるものは
   * 上書きしない。孤児のまま別の理由で保存し直すたびに期限が延びてしまう。
   */
  private stampDetachment(
    records: readonly TabBoundRecord<T>[],
    assignments: ReadonlyMap<number, TabBoundRecordId>
  ): TabBoundRecord<T>[] {
    const attached = new Set(assignments.values());
    const now = this.now();
    return records.map((record) => {
      if (attached.has(record.id)) {
        if (record.detachedAt === undefined) return record;
        const { detachedAt: _attached, ...rest } = record;
        return rest;
      }
      return record.detachedAt === undefined
        ? { ...record, detachedAt: now }
        : record;
    });
  }
}

function recordOf<T>(
  { records, assignments }: TabBoundState<T>,
  tabId: number
): TabBoundRecord<T> | undefined {
  const id = assignments.get(tabId);
  if (id === undefined) return undefined;
  return records.find((r) => r.id === id);
}
