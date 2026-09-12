import { strict as assert } from "node:assert";
import { describe, it } from "vitest";

import type { TabBinding } from "../domain/types";
import { InMemoryTabBoundStorage } from "../storage/in-memory-tab-bound-storage";
import { TabBoundStore } from "./tab-bound-store";

const now = 2_000_000_000_000;

function binding(overrides: Partial<TabBinding> = {}): TabBinding {
  return {
    url: "https://example.com/",
    title: "Example",
    index: 0,
    pinned: false,
    ...overrides,
  };
}

function createStore<T>(survivesSession?: (value: T) => boolean) {
  const storage = new InMemoryTabBoundStorage<T>();
  let seq = 0;
  const store = new TabBoundStore<T>({
    storage,
    survivesSession,
    generateId: () => `id-${++seq}`,
    now: () => now,
  });
  return { store, storage };
}

describe("TabBoundStore", () => {
  it("stores and reads a value by tabId", async () => {
    const { store } = createStore<string>();
    await store.set(1, "買い物メモ", binding());
    assert.equal(await store.get(1), "買い物メモ");
    assert.equal(await store.get(2), undefined);
  });

  it("updates in place instead of creating a second record", async () => {
    const { store, storage } = createStore<string>();
    await store.set(1, "初回", binding());
    await store.set(1, "書き換え", binding({ title: "変わった" }));
    assert.equal(await store.get(1), "書き換え");
    assert.equal(storage.snapshot().records.length, 1);
    assert.equal(storage.snapshot().records[0].binding.title, "変わった");
  });

  it("keeps values of different tabs independent", async () => {
    const { store } = createStore<string>();
    await store.set(1, "参照用", binding({ index: 1 }));
    await store.set(2, "編集用", binding({ index: 5 }));
    assert.equal(await store.get(1), "参照用");
    assert.equal(await store.get(2), "編集用");
  });

  it("refreshes the binding without touching the value", async () => {
    const { store, storage } = createStore<string>();
    await store.set(1, "メモ", binding({ index: 0 }));
    await store.syncBinding(1, binding({ index: 7, title: "移動後" }));
    assert.equal(await store.get(1), "メモ");
    assert.equal(storage.snapshot().records[0].binding.index, 7);
  });

  it("ignores syncBinding for an unknown tab", async () => {
    const { store, storage } = createStore<string>();
    await store.syncBinding(99, binding());
    assert.equal(storage.snapshot().records.length, 0);
  });

  it("delete removes the record entirely", async () => {
    const { store, storage } = createStore<string>();
    await store.set(1, "メモ", binding());
    await store.delete(1);
    assert.equal(await store.get(1), undefined);
    assert.equal(storage.snapshot().records.length, 0);
  });

  it("detach keeps the record as an orphan", async () => {
    const { store } = createStore<string>();
    await store.set(1, "閉じても残したいメモ", binding());
    await store.detach(1);
    assert.equal(await store.get(1), undefined);
    const orphans = await store.orphans();
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].value, "閉じても残したいメモ");
  });

  it("adopts an orphan onto a new tab", async () => {
    const { store } = createStore<string>();
    await store.set(1, "メモ", binding());
    await store.detach(1);
    const [orphan] = await store.orphans();

    assert.equal(await store.adoptOrphan(orphan.id, 42), true);
    assert.equal(await store.get(42), "メモ");
    assert.deepEqual(await store.orphans(), []);
  });

  it("refuses to adopt a record that is already attached", async () => {
    const { store } = createStore<string>();
    await store.set(1, "メモ", binding());
    const record = await store.getRecord(1);
    assert.ok(record);
    assert.equal(await store.adoptOrphan(record.id, 43), false);
    assert.equal(await store.get(43), undefined);
  });

  it("forgets an orphan on request", async () => {
    const { store } = createStore<string>();
    await store.set(1, "メモ", binding());
    await store.detach(1);
    const [orphan] = await store.orphans();
    assert.equal(await store.forgetOrphan(orphan.id), true);
    assert.deepEqual(await store.orphans(), []);
    assert.equal(await store.forgetOrphan(orphan.id), false);
  });

  describe("rematch", () => {
    it("rebinds a record to the restored tab under a new tabId", async () => {
      const { store } = createStore<string>();
      await store.set(1, "メモ", binding({ url: "https://a.example/" }));

      // 再起動後: tabId は総入れ替えになる。
      const outcome = await store.rematch([
        { tabId: 900, binding: binding({ url: "https://a.example/" }) },
      ]);

      assert.equal(outcome.matched.size, 1);
      assert.equal(await store.get(900), "メモ");
      assert.equal(await store.get(1), undefined);
    });

    it("keeps an unmatched record as an orphan rather than deleting it", async () => {
      const { store } = createStore<string>();
      await store.set(1, "メモ", binding({ url: "https://a.example/" }));

      const outcome = await store.rematch([
        { tabId: 900, binding: binding({ url: "https://elsewhere.example/" }) },
      ]);

      assert.equal(outcome.matched.size, 0);
      assert.equal(outcome.unmatched.length, 1);
      const orphans = await store.orphans();
      assert.equal(orphans.length, 1);
      assert.equal(orphans[0].value, "メモ");
    });

    it("does not carry over values rejected by survivesSession", async () => {
      // タブ整理の方針の一般化。明示的に保護したものだけを引き継ぐ。
      const { store } = createStore<{ kind: string }>(
        (value) => value.kind === "manual-protected"
      );
      await store.set(
        1,
        { kind: "manual-protected" },
        binding({ url: "https://keep.example/" })
      );
      await store.set(
        2,
        { kind: "normal" },
        binding({ url: "https://drop.example/" })
      );

      const outcome = await store.rematch([
        { tabId: 900, binding: binding({ url: "https://keep.example/" }) },
        { tabId: 901, binding: binding({ url: "https://drop.example/" }) },
      ]);

      assert.equal(outcome.matched.size, 1);
      assert.deepEqual(await store.get(900), { kind: "manual-protected" });
      assert.equal(await store.get(901), undefined);
      assert.deepEqual(await store.orphans(), []);
    });

    it("drops stale assignments from the previous session", async () => {
      const { store, storage } = createStore<string>();
      await store.set(1, "メモ", binding({ url: "https://a.example/" }));
      await store.rematch([
        { tabId: 900, binding: binding({ url: "https://a.example/" }) },
      ]);
      // 旧 tabId 1 への割り当てが残っていてはいけない。
      assert.deepEqual([...storage.snapshot().assignments.keys()], [900]);
    });
  });
});

describe("TabBoundStore: createOrphan", () => {
  it("タブに結びつかないレコードを作り、孤児として取り出せる", async () => {
    const { store } = createStore<{ label: string }>();

    const id = await store.createOrphan(
      { label: "宣言だけ先にある" },
      binding({ url: "https://example.com/spec" })
    );

    const orphans = await store.orphans();
    assert.deepEqual(
      orphans.map((record) => record.id),
      [id]
    );
    assert.equal(orphans[0].value.label, "宣言だけ先にある");
  });

  it("作った孤児は adoptOrphan でタブへ引き取れる", async () => {
    const { store } = createStore<{ label: string }>();
    const id = await store.createOrphan(
      { label: "あとで開くページ" },
      binding({ url: "https://example.com/spec" })
    );

    assert.equal(await store.adoptOrphan(id, 42), true);

    assert.deepEqual(await store.get(42), { label: "あとで開くページ" });
    assert.deepEqual(await store.orphans(), []);
  });

  it("既存のタブ結合には触れない", async () => {
    const { store } = createStore<{ label: string }>();
    await store.set(7, { label: "開いているタブのもの" }, binding({}));

    await store.createOrphan({ label: "宙に浮いたもの" }, binding({}));

    assert.deepEqual(await store.get(7), { label: "開いているタブのもの" });
  });
});

const HOUR = 60 * 60 * 1000;

function createExpiringStore(orphanTtlMs: number | undefined) {
  const storage = new InMemoryTabBoundStorage<string>();
  let clock = now;
  let seq = 0;
  const store = new TabBoundStore<string>({
    storage,
    orphanTtlMs,
    generateId: () => `id-${++seq}`,
    now: () => clock,
  });
  return {
    store,
    storage,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("TabBoundStore: 孤児の保持期限", () => {
  it("期限を設けなければ、いつまでも孤児のまま残る", async () => {
    const { store, advance } = createExpiringStore(undefined);
    await store.set(1, "このページは大事", binding());
    await store.detach(1);

    advance(365 * 24 * HOUR);

    // タブ整理の明示保持はこちら。時間で捨ててはいけない宣言。
    assert.equal((await store.orphans()).length, 1);
  });

  it("期限を過ぎた孤児は一覧から消える", async () => {
    const { store, advance } = createExpiringStore(24 * HOUR);
    await store.set(1, "閉じたタブのメモ", binding());
    await store.detach(1);

    advance(23 * HOUR);
    assert.equal((await store.orphans()).length, 1);

    advance(2 * HOUR);
    assert.deepEqual(await store.orphans(), []);
  });

  it("期限は本文の更新時刻ではなく、孤児になった時刻から測る", async () => {
    const { store, advance } = createExpiringStore(24 * HOUR);
    await store.set(1, "ずっと抱えているメモ", binding());

    // 1 週間触らずに開きっぱなしだったタブを、いま閉じた。
    advance(7 * 24 * HOUR);
    await store.detach(1);

    // 本文の更新時刻を起点にすると、ここで既に期限切れになってしまう。
    // 失われて困るのは、まさにこういう長く抱えていたメモの方。
    advance(1 * HOUR);
    assert.equal((await store.orphans()).length, 1);
  });

  it("孤児のまま別の理由で保存し直しても、期限は延びない", async () => {
    const { store, advance } = createExpiringStore(24 * HOUR);
    await store.set(1, "閉じたタブのメモ", binding());
    await store.detach(1);

    advance(12 * HOUR);
    // 無関係なタブの書き込みでも records 全体が保存し直される。
    await store.set(2, "別のタブのメモ", binding());

    advance(13 * HOUR);
    assert.deepEqual(
      (await store.orphans()).map((record) => record.value),
      []
    );
  });

  it("引き取ったメモは期限の対象から外れ、再び外れたら測り直す", async () => {
    const { store, advance } = createExpiringStore(24 * HOUR);
    await store.set(1, "引き取られるメモ", binding());
    await store.detach(1);

    advance(20 * HOUR);
    assert.equal(await store.adoptOrphan("id-1", 99), true);

    // 結びついている間は経過時間を数えない。
    advance(10 * HOUR);
    assert.equal(await store.get(99), "引き取られるメモ");

    await store.detach(99);
    advance(23 * HOUR);
    assert.equal((await store.orphans()).length, 1);
  });

  it("期限切れは一覧から消えるだけでなく、保存領域からも消える", async () => {
    const { store, storage, advance } = createExpiringStore(24 * HOUR);
    await store.set(1, "捨てられるメモ", binding());
    await store.detach(1);
    advance(25 * HOUR);

    const removed = await store.pruneExpiredOrphans();

    assert.equal(removed, 1);
    assert.deepEqual(await storage.loadRecords(), []);
  });

  it("結びついているレコードは掃除で消さない", async () => {
    const { store, storage, advance } = createExpiringStore(24 * HOUR);
    await store.set(1, "開いているタブのメモ", binding());

    advance(365 * 24 * HOUR);
    await store.pruneExpiredOrphans();

    assert.equal((await storage.loadRecords()).length, 1);
  });
});
