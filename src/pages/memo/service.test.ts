import { InMemoryTabBoundStorage } from "@core/tab-bound-store";
import { strict as assert } from "node:assert";
import { afterEach, describe, it, vi } from "vitest";

import { MemoRepository } from "./repository";
import { MemoService } from "./service";
import type { Memo } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function stubTabs(url: string): void {
  vi.stubGlobal("chrome", {
    tabs: {
      get: async (tabId: number) => ({
        id: tabId,
        index: 0,
        pinned: false,
        title: `tab-${tabId}`,
        url,
      }),
    },
  });
}

function createService() {
  const storage = new InMemoryTabBoundStorage<Memo>();
  return { service: new MemoService(new MemoRepository(storage)), storage };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MemoService: 宙に浮いたメモの後始末", () => {
  it("タブを閉じたときに、期限の切れたものを捨てる", async () => {
    vi.useFakeTimers();
    stubTabs("https://example.com/");
    const { service, storage } = createService();

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await service.setText(1, "古いメモ");
    await service.detach(1);

    // 保持期間を越えてから、別のタブを閉じる。
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z").getTime() + 8 * DAY_MS);
    await service.setText(2, "新しいメモ");
    await service.detach(2);

    // 読み出しは掃除をしない。残っているかどうかは保存の中身で確かめる。
    const { records } = storage.snapshot();
    assert.deepEqual(
      records.map((record) => record.value.text),
      ["新しいメモ"]
    );
  });

  it("候補を読むだけでは保存の中身を書き換えない", async () => {
    stubTabs("https://example.com/");
    const { service, storage } = createService();
    await service.setText(1, "引き継ぎたいメモ");
    await service.detach(1);
    const saveRecords = vi.spyOn(storage, "saveRecords");

    await service.listOrphansFor(1);

    assert.equal(saveRecords.mock.calls.length, 0);
  });
});
