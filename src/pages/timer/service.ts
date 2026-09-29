import { TimerRepository } from "./repository";
import { emptyTabTimers } from "./types";
import type {
  FiredTimer,
  TabTimers,
  Timer,
  TimerEntry,
  TimerOverlayLayout,
  TimerSound,
} from "./types";

export interface StartTimerParams {
  durationMs: number;
  title: string;
  sound: TimerSound;
}

/**
 * タイマーに対する操作の意味を決める層。
 * 保存場所や問い合わせ方には立ち入らず、振る舞いの規則だけを持つ。
 */
export class TimerService {
  /**
   * 書き込みを伴う操作を 1 本の列に並べる。
   *
   * 発火はアラームとページ側の申告という 2 つの入口から呼ばれる。
   * 読んでから書くまでの間に割り込まれると、同じタイマーが二度
   * 発火済みへ進み、通知も二重に出てしまう。
   */
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(private readonly repository = new TimerRepository()) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingOperation.then(operation, operation);
    this.pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async start(tabId: number, params: StartTimerParams): Promise<Timer> {
    return this.enqueue(async () => {
      const now = Date.now();
      const timer: Timer = {
        id: crypto.randomUUID(),
        title: params.title,
        startedAt: now,
        deadline: now + params.durationMs,
        sound: params.sound,
        status: "pending",
      };
      const current =
        (await this.repository.findByTabId(tabId)) ?? emptyTabTimers();
      await this.repository.save(tabId, {
        ...current,
        timers: [...current.timers, timer],
      });
      return timer;
    });
  }

  /** そのタブのタイマーと、箱の置き場所。オーバーレイが読む。 */
  async listForTab(tabId: number): Promise<TabTimers> {
    const current = await this.repository.findByTabId(tabId);
    return current ?? emptyTabTimers();
  }

  /**
   * 保持しているタイマーすべて。期限の近い順に並べる。
   *
   * タブを閉じた後のタイマーも含める。発火を待っていることに変わりはなく、
   * 一覧から消えてしまうと止める手段が無くなる。
   */
  async listAll(): Promise<TimerEntry[]> {
    const records = await this.repository.listRecords();
    return records
      .flatMap((record) =>
        record.value.timers.map((timer) => ({
          tabId: record.tabId,
          tabTitle: record.tabTitle,
          url: record.url,
          timer,
        }))
      )
      .sort((a, b) => a.timer.deadline - b.timer.deadline);
  }

  /**
   * 期限を過ぎた未発火のタイマーを発火済みへ進め、進めたものだけを返す。
   *
   * 通知を出してよいかの判断をこの戻り値に集約する。どの入口から呼ばれても、
   * 実際に状態が動いたときにしか通知は出ない。
   */
  async fireDue(now: number): Promise<FiredTimer[]> {
    return this.enqueue(async () => {
      const records = await this.repository.listRecords();

      const fired: FiredTimer[] = [];
      for (const record of records) {
        const dueIds = new Set(
          record.value.timers
            .filter(
              (timer) => timer.status === "pending" && timer.deadline <= now
            )
            .map((timer) => timer.id)
        );
        if (dueIds.size === 0) continue;

        const timers = record.value.timers.map((timer) =>
          dueIds.has(timer.id)
            ? { ...timer, status: "fired" as const, firedAt: now }
            : timer
        );
        await this.repository.saveRecordValue(record.recordId, {
          ...record.value,
          timers,
        });
        for (const timer of timers) {
          if (!dueIds.has(timer.id)) continue;
          fired.push({
            timer,
            tabId: record.tabId,
            tabTitle: record.tabTitle,
            url: record.url,
          });
        }
      }
      return fired;
    });
  }

  /**
   * ID だけを手がかりに、戻り先ごと 1 本引く。通知をクリックされたときに使う。
   *
   * service worker は通知を出した後に止められるため、発火時の情報を
   * メモリに覚えておくことはできない。保存済みのレコードから引き直す。
   */
  async find(timerId: string): Promise<FiredTimer | undefined> {
    const records = await this.repository.listRecords();
    for (const record of records) {
      const timer = record.value.timers.find((entry) => entry.id === timerId);
      if (!timer) continue;
      return {
        timer,
        tabId: record.tabId,
        tabTitle: record.tabTitle,
        url: record.url,
      };
    }
    return undefined;
  }

  /**
   * タイマーを 1 本消す。止めるのと、鳴り終えたものを片付けるのは同じ操作。
   *
   * タブが閉じられた後のタイマーも消せるよう、タブではなくタイマーの ID で引く。
   */
  async remove(timerId: string): Promise<boolean> {
    return this.enqueue(async () => {
      const records = await this.repository.listRecords();
      for (const record of records) {
        if (!record.value.timers.some((timer) => timer.id === timerId))
          continue;
        await this.repository.saveRecordValue(record.recordId, {
          ...record.value,
          timers: record.value.timers.filter((timer) => timer.id !== timerId),
        });
        return true;
      }
      return false;
    });
  }

  async moveOverlay(tabId: number, layout: TimerOverlayLayout): Promise<void> {
    await this.enqueue(async () => {
      const current = await this.repository.findByTabId(tabId);
      if (!current) return;
      await this.repository.save(tabId, { ...current, layout });
    });
  }

  /** まだ鳴っていないタイマーを抱えているタブ。自動削除から外すために使う。 */
  async pendingTabIds(): Promise<Set<number>> {
    const records = await this.repository.listRecords();
    const tabIds = new Set<number>();
    for (const record of records) {
      if (record.tabId === undefined) continue;
      if (record.value.timers.some((timer) => timer.status === "pending")) {
        tabIds.add(record.tabId);
      }
    }
    return tabIds;
  }

  /**
   * タブを閉じても期限は生きている。結びつきだけ解く。
   * 宙に浮いたタイマーが生まれるのはこの瞬間だけなので、期限切れの
   * 後始末もここで済ませる。
   */
  async detach(tabId: number): Promise<void> {
    await this.repository.detach(tabId);
    await this.repository.pruneExpiredOrphans();
  }

  async syncBinding(tabId: number): Promise<void> {
    await this.repository.refreshBinding(tabId);
  }

  /** セッション復元後に、開いているタブへ結び直す。 */
  async rematchAll(): Promise<void> {
    await this.repository.pruneExpiredOrphans();
    const tabs = await chrome.tabs.query({});
    await this.repository.rematch(this.repository.candidatesOf(tabs));
  }
}
