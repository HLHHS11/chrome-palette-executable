import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { TabBinding } from "../domain/types.js";
import { InMemoryTabBoundRepository } from "../repository/in-memory-repository.js";
import { TabBoundStore } from "./tab-bound-store.js";

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
  const repository = new InMemoryTabBoundRepository<T>();
  let seq = 0;
  const store = new TabBoundStore<T>({
    repository,
    survivesSession,
    generateId: () => `id-${++seq}`,
    now: () => now,
  });
  return { store, repository };
}

describe("TabBoundStore", () => {
  it("stores and reads a value by tabId", async () => {
    const { store } = createStore<string>();
    await store.set(1, "買い物メモ", binding());
    assert.equal(await store.get(1), "買い物メモ");
    assert.equal(await store.get(2), undefined);
  });

  it("updates in place instead of creating a second record", async () => {
    const { store, repository } = createStore<string>();
    await store.set(1, "初回", binding());
    await store.set(1, "書き換え", binding({ title: "変わった" }));
    assert.equal(await store.get(1), "書き換え");
    assert.equal(repository.snapshot().records.length, 1);
    assert.equal(repository.snapshot().records[0].binding.title, "変わった");
  });

  it("keeps values of different tabs independent", async () => {
    const { store } = createStore<string>();
    await store.set(1, "参照用", binding({ index: 1 }));
    await store.set(2, "編集用", binding({ index: 5 }));
    assert.equal(await store.get(1), "参照用");
    assert.equal(await store.get(2), "編集用");
  });

  it("refreshes the binding without touching the value", async () => {
    const { store, repository } = createStore<string>();
    await store.set(1, "メモ", binding({ index: 0 }));
    await store.syncBinding(1, binding({ index: 7, title: "移動後" }));
    assert.equal(await store.get(1), "メモ");
    assert.equal(repository.snapshot().records[0].binding.index, 7);
  });

  it("ignores syncBinding for an unknown tab", async () => {
    const { store, repository } = createStore<string>();
    await store.syncBinding(99, binding());
    assert.equal(repository.snapshot().records.length, 0);
  });

  it("delete removes the record entirely", async () => {
    const { store, repository } = createStore<string>();
    await store.set(1, "メモ", binding());
    await store.delete(1);
    assert.equal(await store.get(1), undefined);
    assert.equal(repository.snapshot().records.length, 0);
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
      const { store, repository } = createStore<string>();
      await store.set(1, "メモ", binding({ url: "https://a.example/" }));
      await store.rematch([
        { tabId: 900, binding: binding({ url: "https://a.example/" }) },
      ]);
      // 旧 tabId 1 への割り当てが残っていてはいけない。
      assert.deepEqual([...repository.snapshot().assignments.keys()], [900]);
    });
  });
});
