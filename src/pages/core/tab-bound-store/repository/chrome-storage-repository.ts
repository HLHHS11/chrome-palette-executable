import type { TabBoundRecord, TabBoundRecordId } from "../domain/types";
import type { TabBoundRepository } from "./repository";

/**
 * `chrome.storage.local` にレコード本体を、`chrome.storage.session` に
 * tabId との結びつきを保存する実装。
 *
 * `storage.session` は Service Worker の停止はまたぐがブラウザ再起動では消える。
 * tabId の寿命と完全に一致するため、明示的に消す処理を書かなくても
 * 古い tabId が残り続けることがない。
 */
export class ChromeStorageTabBoundRepository<T>
  implements TabBoundRepository<T>
{
  private readonly recordsKey: string;
  private readonly assignmentsKey: string;

  /** @param namespace 機能ごとの名前空間。スキーマ変更に備えて版を含めること。 */
  constructor(namespace: string) {
    this.recordsKey = `${namespace}.records`;
    this.assignmentsKey = `${namespace}.assignments`;
  }

  async loadRecords(): Promise<TabBoundRecord<T>[]> {
    const stored = (await chrome.storage.local.get(this.recordsKey))[
      this.recordsKey
    ];
    if (!Array.isArray(stored)) return [];
    return stored.filter(isTabBoundRecord) as TabBoundRecord<T>[];
  }

  async saveRecords(records: readonly TabBoundRecord<T>[]): Promise<void> {
    await chrome.storage.local.set({ [this.recordsKey]: records });
  }

  async loadAssignments(): Promise<Map<number, TabBoundRecordId>> {
    const stored = (await chrome.storage.session.get(this.assignmentsKey))[
      this.assignmentsKey
    ];
    if (!Array.isArray(stored)) return new Map();
    const entries = stored.filter(
      (e): e is [number, TabBoundRecordId] =>
        Array.isArray(e) &&
        e.length === 2 &&
        typeof e[0] === "number" &&
        typeof e[1] === "string"
    );
    return new Map(entries);
  }

  async saveAssignments(
    assignments: ReadonlyMap<number, TabBoundRecordId>
  ): Promise<void> {
    // Map は構造化クローンで保存できないため配列に落とす。
    await chrome.storage.session.set({
      [this.assignmentsKey]: [...assignments.entries()],
    });
  }
}

function isTabBoundRecord(value: unknown): value is TabBoundRecord<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") return false;
  if (typeof record.updatedAt !== "number") return false;
  const binding = record.binding;
  if (typeof binding !== "object" || binding === null) return false;
  const b = binding as Record<string, unknown>;
  return (
    typeof b.url === "string" &&
    typeof b.title === "string" &&
    typeof b.index === "number" &&
    typeof b.pinned === "boolean"
  );
}
