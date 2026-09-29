import { InMemoryTabBoundStorage } from "@core/tab-bound-store";
import { strict as assert } from "node:assert";
import { afterEach, describe, it, vi } from "vitest";

import { TimerRepository } from "./repository";
import { TimerService } from "./service";
import type { TabTimers } from "./types";

/** 結びつけの手がかりは `chrome.tabs` から補われるので、そこだけ差し替える。 */
function stubTabs(tabIds: readonly number[]): void {
  vi.stubGlobal("chrome", {
    tabs: {
      get: async (tabId: number) => {
        if (!tabIds.includes(tabId)) throw new Error(`No tab with id ${tabId}`);
        return {
          id: tabId,
          index: 0,
          pinned: false,
          title: `tab-${tabId}`,
          url: `https://example.com/${tabId}`,
        };
      },
    },
  });
}

function createService() {
  const storage = new InMemoryTabBoundStorage<TabTimers>();
  return new TimerService(new TimerRepository(storage));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TimerService", () => {
  it("1 枚のタブに複数のタイマーを持てる", async () => {
    stubTabs([1]);
    const service = createService();
    await service.start(1, {
      durationMs: 60_000,
      title: "CI待ち",
      sound: "default",
    });
    await service.start(1, { durationMs: 30_000, title: "", sound: "silent" });

    const { timers } = await service.listForTab(1);

    assert.equal(timers.length, 2);
    assert.deepEqual(
      timers.map((timer) => timer.title),
      ["CI待ち", ""]
    );
  });

  it("期限を過ぎたものだけを発火済みへ進める", async () => {
    stubTabs([1]);
    const service = createService();
    const due = await service.start(1, {
      durationMs: 1_000,
      title: "近い",
      sound: "default",
    });
    await service.start(1, {
      durationMs: 600_000,
      title: "遠い",
      sound: "default",
    });

    const fired = await service.fireDue(due.deadline);

    assert.deepEqual(
      fired.map((entry) => entry.timer.title),
      ["近い"]
    );
    assert.equal(fired[0].tabId, 1);
  });

  it("同じ期限で二度呼ばれても、発火として返すのは一度だけ", async () => {
    stubTabs([1]);
    const service = createService();
    const timer = await service.start(1, {
      durationMs: 1_000,
      title: "CI待ち",
      sound: "default",
    });

    const first = await service.fireDue(timer.deadline);
    const second = await service.fireDue(timer.deadline);

    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
  });

  it("タブを閉じた後のタイマーも期限どおりに発火し、戻り先の URL を伴う", async () => {
    stubTabs([1]);
    const service = createService();
    const timer = await service.start(1, {
      durationMs: 1_000,
      title: "CI待ち",
      sound: "default",
    });
    await service.detach(1);

    const fired = await service.fireDue(timer.deadline);

    assert.equal(fired.length, 1);
    assert.equal(fired[0].tabId, undefined);
    assert.equal(fired[0].url, "https://example.com/1");
  });

  it("鳴っていないタイマーを持つタブだけを保護対象として挙げる", async () => {
    stubTabs([1, 2]);
    const service = createService();
    const timer = await service.start(1, {
      durationMs: 1_000,
      title: "",
      sound: "default",
    });
    await service.start(2, {
      durationMs: 600_000,
      title: "",
      sound: "default",
    });
    await service.fireDue(timer.deadline);

    assert.deepEqual([...(await service.pendingTabIds())], [2]);
  });

  it("タイマーはタブを跨いで ID で消せる", async () => {
    stubTabs([1]);
    const service = createService();
    const timer = await service.start(1, {
      durationMs: 60_000,
      title: "",
      sound: "default",
    });

    assert.equal(await service.remove(timer.id), true);
    assert.deepEqual((await service.listForTab(1)).timers, []);
    assert.equal(await service.remove(timer.id), false);
  });
});
