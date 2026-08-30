import type {
  AutoDeletedTabRecord,
  OpenTabFacts,
  TabBlockReason,
  TabRetentionAssessment,
  TabRetentionRecord,
} from "./types";

const HOUR_MS = 60 * 60 * 1000;

export const TAB_RETENTION_POLICY = {
  cleanupPeriodMinutes: 3 * 60,
  normalInactiveMs: 3 * HOUR_MS,
  autoProtectActiveMs: 10 * 60 * 1000,
  autoProtectVisitCount: 7,
  staleAfterMs: 21 * HOUR_MS,
  observeOnlyMs: 3 * HOUR_MS,
  deletedHistoryMs: 24 * HOUR_MS,
  deletedHistoryLimit: 100,
  idleDetectionSeconds: 5 * 60,
};

export function applyUsageProtection(
  record: TabRetentionRecord
): TabRetentionRecord {
  if (record.retention !== "normal") return record;

  if (record.totalForegroundMs >= TAB_RETENTION_POLICY.autoProtectActiveMs) {
    return {
      ...record,
      retention: "auto-protected",
      autoProtectionReason: "active-time",
    };
  }

  if (
    record.foregroundVisitCount >= TAB_RETENTION_POLICY.autoProtectVisitCount
  ) {
    return {
      ...record,
      retention: "auto-protected",
      autoProtectionReason: "visit-count",
    };
  }

  return record;
}

function currentBlockReason(facts: OpenTabFacts): TabBlockReason | undefined {
  if (facts.active) return "active";
  if (facts.pinned) return "pinned";
  if (facts.audible) return "audible";
  if (facts.incognito) return "incognito";
  if (facts.extensionPage) return "extension-page";
  return undefined;
}

export function assessTabRetention(
  record: TabRetentionRecord,
  facts: OpenTabFacts,
  featureEnabledAt: number,
  now: number
): TabRetentionAssessment {
  if (record.retention === "manual-protected") {
    return { kind: "manual-protected" };
  }

  const blockReason = currentBlockReason(facts);
  if (record.retention === "auto-protected") {
    const staleAt = record.lastUsedAt + TAB_RETENTION_POLICY.staleAfterMs;
    if (!blockReason && now >= staleAt) {
      return { kind: "stale-recommended", staleAt };
    }
    return { kind: "auto-protected", staleAt };
  }

  const deleteAt = record.lastUsedAt + TAB_RETENTION_POLICY.normalInactiveMs;
  if (blockReason) return { kind: "blocked", reason: blockReason, deleteAt };
  if (now < deleteAt) return { kind: "waiting", deleteAt };
  if (now < featureEnabledAt + TAB_RETENTION_POLICY.observeOnlyMs) {
    return { kind: "observe-only", deleteAt };
  }
  return { kind: "delete-eligible", deleteAt };
}

export function retainRecentDeletionHistory(
  entries: readonly AutoDeletedTabRecord[],
  now: number
): AutoDeletedTabRecord[] {
  return entries
    .filter(
      (entry) => now - entry.deletedAt <= TAB_RETENTION_POLICY.deletedHistoryMs
    )
    .sort((a, b) => b.deletedAt - a.deletedAt)
    .slice(0, TAB_RETENTION_POLICY.deletedHistoryLimit);
}
