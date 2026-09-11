import { rematchRecords } from "../domain/rematch.js";
import type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundRecord,
  TabBoundRecordId,
} from "../domain/types.js";
import type { TabBoundRepository } from "../repository/repository.js";

export interface TabBoundStoreOptions<T> {
  repository: TabBoundRepository<T>;
  /**
   * 新しいブラウザセッションに持ち越す値かどうかを判定する。
   *
   * 機能ごとに方針が違うためフックにしてある。たとえばタブ整理は
   * 明示的に保護したタブだけを引き継ぎ、利用統計は毎セッション作り直す。
   * 省略時はすべて持ち越す。
   */
  survivesSession?: (value: T) => boolean;
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
  private readonly repository: TabBoundRepository<T>;
  private readonly survivesSession: (value: T) => boolean;
  private readonly generateId: () => TabBoundRecordId;
  private readonly now: () => number;

  constructor(options: TabBoundStoreOptions<T>) {
    this.repository = options.repository;
    this.survivesSession = options.survivesSession ?? (() => true);
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => Date.now());
  }

  async get(tabId: number): Promise<T | undefined> {
    const record = await this.recordOf(tabId);
    return record?.value;
  }

  async getRecord(tabId: number): Promise<TabBoundRecord<T> | undefined> {
    return this.recordOf(tabId);
  }

  /** タブに値を設定する。既存があれば値と binding を更新する。 */
  async set(tabId: number, value: T, binding: TabBinding): Promise<void> {
    const [records, assignments] = await this.load();
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

    await this.persist(records, assignments);
  }

  /**
   * タブの現在の状態を binding に反映する。値は変えない。
   * 遷移やタブ移動のたびに呼ぶことで、再結合の手がかりを新鮮に保つ。
   */
  async syncBinding(tabId: number, binding: TabBinding): Promise<void> {
    const [records, assignments] = await this.load();
    const id = assignments.get(tabId);
    if (id === undefined) return;
    const index = records.findIndex((r) => r.id === id);
    if (index < 0) return;
    records[index] = { ...records[index], binding, updatedAt: this.now() };
    await this.persist(records, assignments);
  }

  /** タブに紐づく値を完全に削除する。 */
  async delete(tabId: number): Promise<void> {
    const [records, assignments] = await this.load();
    const id = assignments.get(tabId);
    if (id === undefined) return;
    assignments.delete(tabId);
    await this.persist(
      records.filter((r) => r.id !== id),
      assignments
    );
  }

  /**
   * タブが閉じられたときに結びつきだけを解く。
   * レコードは孤児として残るため、復元されれば再結合できる。
   */
  async detach(tabId: number): Promise<void> {
    const [records, assignments] = await this.load();
    if (!assignments.delete(tabId)) return;
    await this.persist(records, assignments);
  }

  /** どのタブにも結びついていないレコード。 */
  async orphans(): Promise<TabBoundRecord<T>[]> {
    const [records, assignments] = await this.load();
    const attached = new Set(assignments.values());
    return records.filter((r) => !attached.has(r.id));
  }

  /** 孤児レコードをタブに手動で結びつける。曖昧で自動結合できなかったときの受け皿。 */
  async adoptOrphan(
    recordId: TabBoundRecordId,
    tabId: number
  ): Promise<boolean> {
    const [records, assignments] = await this.load();
    if (!records.some((r) => r.id === recordId)) return false;
    if ([...assignments.values()].includes(recordId)) return false;
    assignments.set(tabId, recordId);
    await this.persist(records, assignments);
    return true;
  }

  async forgetOrphan(recordId: TabBoundRecordId): Promise<boolean> {
    const [records, assignments] = await this.load();
    const next = records.filter((r) => r.id !== recordId);
    if (next.length === records.length) return false;
    await this.persist(next, assignments);
    return true;
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
    const records = await this.repository.loadRecords();
    const surviving = records.filter((r) => this.survivesSession(r.value));
    const outcome = rematchRecords(surviving, candidates);

    const assignments = new Map<number, TabBoundRecordId>();
    for (const [recordId, tabId] of outcome.matched) {
      assignments.set(tabId, recordId);
    }
    await this.persist(surviving, assignments);
    return outcome;
  }

  private async recordOf(
    tabId: number
  ): Promise<TabBoundRecord<T> | undefined> {
    const [records, assignments] = await this.load();
    const id = assignments.get(tabId);
    if (id === undefined) return undefined;
    return records.find((r) => r.id === id);
  }

  private async load(): Promise<
    [TabBoundRecord<T>[], Map<number, TabBoundRecordId>]
  > {
    return Promise.all([
      this.repository.loadRecords(),
      this.repository.loadAssignments(),
    ]);
  }

  private async persist(
    records: readonly TabBoundRecord<T>[],
    assignments: ReadonlyMap<number, TabBoundRecordId>
  ): Promise<void> {
    await Promise.all([
      this.repository.saveRecords(records),
      this.repository.saveAssignments(assignments),
    ]);
  }
}
