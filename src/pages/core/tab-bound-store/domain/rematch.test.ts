import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { rematchRecords } from "./rematch.js";
import type { RematchCandidate, TabBoundRecord } from "./types.js";

const now = 2_000_000_000_000;

function record(
  id: string,
  url: string,
  overrides: Partial<TabBoundRecord<string>["binding"]> = {}
): TabBoundRecord<string> {
  return {
    id,
    value: `memo-${id}`,
    binding: { url, title: url, index: 0, pinned: false, ...overrides },
    updatedAt: now,
  };
}

function candidate(
  tabId: number,
  url: string,
  overrides: Partial<RematchCandidate["binding"]> = {}
): RematchCandidate {
  return {
    tabId,
    binding: { url, title: url, index: 0, pinned: false, ...overrides },
  };
}

describe("rematchRecords", () => {
  it("matches a record to the only tab on the same URL", () => {
    const out = rematchRecords(
      [record("a", "https://example.com/")],
      [candidate(11, "https://example.com/")]
    );
    assert.equal(out.matched.get("a"), 11);
    assert.deepEqual(out.unmatched, []);
  });

  it("never matches across different URLs", () => {
    const out = rematchRecords(
      [record("a", "https://example.com/")],
      [candidate(11, "https://other.example/")]
    );
    assert.equal(out.matched.size, 0);
    assert.deepEqual(out.unmatched, ["a"]);
  });

  it("keeps a record when its tab is gone, instead of dropping it", () => {
    const out = rematchRecords([record("a", "https://example.com/")], []);
    assert.deepEqual(out.unmatched, ["a"]);
  });

  it("distinguishes two tabs on the same URL by window index", () => {
    // 参照用タブと編集用タブ。URL も title も同じで、位置だけが違う。
    const records = [
      record("reference", "https://docs.example/", { index: 1 }),
      record("editing", "https://docs.example/", { index: 5 }),
    ];
    const candidates = [
      candidate(21, "https://docs.example/", { index: 1 }),
      candidate(22, "https://docs.example/", { index: 5 }),
    ];
    const out = rematchRecords(records, candidates);
    assert.equal(out.matched.get("reference"), 21);
    assert.equal(out.matched.get("editing"), 22);
    assert.deepEqual(out.unmatched, []);
  });

  it("still distinguishes them when indexes shifted by the same amount", () => {
    // タブが 1 個閉じられて全体が前にずれた場合でも、相対的な近さで決まる。
    const records = [
      record("reference", "https://docs.example/", { index: 1 }),
      record("editing", "https://docs.example/", { index: 5 }),
    ];
    const candidates = [
      candidate(21, "https://docs.example/", { index: 0 }),
      candidate(22, "https://docs.example/", { index: 4 }),
    ];
    const out = rematchRecords(records, candidates);
    assert.equal(out.matched.get("reference"), 21);
    assert.equal(out.matched.get("editing"), 22);
  });

  it("refuses to guess when two tabs are equally plausible", () => {
    // 記録した位置の両隣に同 URL のタブがある。どちらとも言えないので結びつけない。
    const records = [record("a", "https://docs.example/", { index: 2 })];
    const candidates = [
      candidate(21, "https://docs.example/", { index: 1 }),
      candidate(22, "https://docs.example/", { index: 3 }),
    ];
    const out = rematchRecords(records, candidates);
    assert.equal(out.matched.size, 0);
    assert.deepEqual(out.unmatched, ["a"]);
  });

  it("prefers a title match over index proximity", () => {
    const records = [
      record("a", "https://app.example/", {
        title: "編集中の下書き",
        index: 0,
      }),
    ];
    const candidates = [
      candidate(21, "https://app.example/", { title: "別のページ", index: 0 }),
      candidate(22, "https://app.example/", {
        title: "編集中の下書き",
        index: 9,
      }),
    ];
    const out = rematchRecords(records, candidates);
    assert.equal(out.matched.get("a"), 22);
  });

  it("never assigns one tab to two records", () => {
    const records = [
      record("a", "https://docs.example/", { index: 0 }),
      record("b", "https://docs.example/", { index: 1 }),
    ];
    const out = rematchRecords(records, [
      candidate(21, "https://docs.example/", { index: 0 }),
    ]);
    const assigned = [...out.matched.values()];
    assert.deepEqual(assigned, [21]);
    assert.equal(out.matched.get("a"), 21);
    assert.deepEqual(out.unmatched, ["b"]);
  });

  it("leaves extra tabs without records alone", () => {
    const out = rematchRecords(
      [record("a", "https://example.com/", { index: 0 })],
      [
        candidate(21, "https://example.com/", { index: 0 }),
        candidate(22, "https://example.com/", { index: 1 }),
      ]
    );
    // 候補が 2 つあり index で決まるので、曖昧ではない。
    assert.equal(out.matched.get("a"), 21);
    assert.deepEqual(out.unmatched, []);
  });

  it("handles an empty input", () => {
    const out = rematchRecords([], [candidate(1, "https://example.com/")]);
    assert.equal(out.matched.size, 0);
    assert.deepEqual(out.unmatched, []);
  });
});
