import { storageCell } from "@core/storage-cell";
import type { StorageCell } from "@core/storage-cell";

import type { TabBoundRecord, TabBoundRecordId } from "../domain/types";
import type { TabBoundState, TabBoundStorage } from "./tab-bound-storage";

/**
 * `chrome.storage.local` にレコード本体を、`chrome.storage.session` に
 * tabId との結びつきを保存する実装。
 *
 * `storage.session` は Service Worker の停止はまたぐがブラウザ再起動では消える。
 * tabId の寿命と完全に一致するため、明示的に消す処理を書かなくても
 * 古い tabId が残り続けることがない。
 *
 * 読み書きはメモリ上の写しに対して行うので、同じ名前空間を扱うのは
 * background に限ること。ほかのコンテキストから使いたくなったら、
 * background への RPC を介す。
 */
export class ChromeTabBoundStorage<T> implements TabBoundStorage<T> {
  private readonly records: StorageCell<TabBoundRecord<T>[]>;
  private readonly assignments: StorageCell<Map<number, TabBoundRecordId>>;

  /** @param namespace 機能ごとの名前空間。スキーマ変更に備えて版を含めること。 */
  constructor(namespace: string) {
    this.records = storageCell("local", `${namespace}.records`, {
      decode: (stored) =>
        Array.isArray(stored)
          ? (stored.filter(isTabBoundRecord) as TabBoundRecord<T>[])
          : [],
      encode: (records) => records,
    });
    this.assignments = storageCell("session", `${namespace}.assignments`, {
      decode: (stored) =>
        new Map(
          Array.isArray(stored)
            ? stored.filter(
                (e): e is [number, TabBoundRecordId] =>
                  Array.isArray(e) &&
                  e.length === 2 &&
                  typeof e[0] === "number" &&
                  typeof e[1] === "string"
              )
            : []
        ),
      // Map は構造化クローンで保存できないため配列に落とす。
      encode: (assignments) => [...assignments.entries()],
    });
  }

  async ready(): Promise<void> {
    await Promise.all([this.records.ready(), this.assignments.ready()]);
  }

  read(): TabBoundState<T> {
    return { records: this.records.get(), assignments: this.assignments.get() };
  }

  write(state: TabBoundState<T>): void {
    this.records.set(state.records);
    this.assignments.set(state.assignments);
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
