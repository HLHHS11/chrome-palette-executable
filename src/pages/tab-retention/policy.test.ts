import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  TAB_RETENTION_POLICY,
  applyUsageProtection,
  assessTabRetention,
  retainRecentDeletionHistory,
} from "./policy.js";
import type {
  AutoDeletedTabRecord,
  OpenTabFacts,
  TabRetentionRecord,
} from "./types.js";

const now = 2_000_000_000_000;
const unblocked: OpenTabFacts = {
  active: false,
  pinned: false,
  audible: false,
  incognito: false,
  extensionPage: false,
};

function normalRecord(
  overrides: Partial<TabRetentionRecord> = {}
): TabRetentionRecord {
  return {
    tabId: 1,
    urlSnapshot: "https://example.com/",
    lastUsedAt: now,
    foregroundVisitCount: 0,
    totalForegroundMs: 0,
    retention: "normal",
    ...overrides,
  };
}

describe("tab retention policy", () => {
  it("promotes a tab after enough foreground time or visits", () => {
    assert.deepEqual(
      applyUsageProtection(
        normalRecord({
          totalForegroundMs: TAB_RETENTION_POLICY.autoProtectActiveMs,
        })
      ).retention,
      "auto-protected"
    );
    assert.equal(
      applyUsageProtection(
        normalRecord({
          foregroundVisitCount: TAB_RETENTION_POLICY.autoProtectVisitCount,
        })
      ).autoProtectionReason,
      "visit-count"
    );
  });

  it("keeps an expired tab observable during the first 24 hours", () => {
    const record = normalRecord({
      lastUsedAt: now - TAB_RETENTION_POLICY.normalInactiveMs,
    });
    assert.equal(
      assessTabRetention(record, unblocked, now, now).kind,
      "observe-only"
    );
    assert.equal(
      assessTabRetention(
        record,
        unblocked,
        now - TAB_RETENTION_POLICY.observeOnlyMs,
        now
      ).kind,
      "delete-eligible"
    );
  });

  it("never deletes an active tab", () => {
    const record = normalRecord({
      lastUsedAt: now - TAB_RETENTION_POLICY.normalInactiveMs * 2,
    });
    assert.deepEqual(
      assessTabRetention(record, { ...unblocked, active: true }, 0, now).kind,
      "blocked"
    );
  });

  it("recommends an unused automatic protection but not while active", () => {
    const record = normalRecord({
      retention: "auto-protected",
      lastUsedAt: now - TAB_RETENTION_POLICY.staleAfterMs,
    });
    assert.equal(
      assessTabRetention(record, unblocked, 0, now).kind,
      "stale-recommended"
    );
    assert.equal(
      assessTabRetention(record, { ...unblocked, active: true }, 0, now).kind,
      "auto-protected"
    );
  });

  it("retains only the latest 24 hours and at most 100 deletions", () => {
    const entries: AutoDeletedTabRecord[] = Array.from(
      { length: 102 },
      (_, index) => ({
        deletionId: String(index),
        deletedAt: now - index,
        title: "Example",
        url: "https://example.com/",
        originalWindowId: 1,
        originalIndex: 0,
        deletionReason: "inactive-transient",
        lastUsedAt: now,
        foregroundVisitCount: 0,
        totalForegroundMs: 0,
      })
    );
    entries.push({
      ...entries[0],
      deletionId: "expired",
      deletedAt: now - TAB_RETENTION_POLICY.deletedHistoryMs - 1,
    });

    const retained = retainRecentDeletionHistory(entries, now);
    assert.equal(retained.length, TAB_RETENTION_POLICY.deletedHistoryLimit);
    assert.equal(
      retained.some((entry) => entry.deletionId === "expired"),
      false
    );
    assert.equal(retained[0].deletionId, "0");
  });
});
