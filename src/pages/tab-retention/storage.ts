import type {
  AutoDeletedTabRecord,
  TabRetentionRecord,
  TabRetentionRuntimeState,
  TabRetentionState,
} from "./types";

const PERSISTENT_KEY = "tab-retention.v1";
const RUNTIME_KEY = "tab-retention.runtime.v1";

type StoredPersistentState = {
  featureEnabledAt: number | null;
  records: TabRetentionRecord[];
  deletedTabs: AutoDeletedTabRecord[];
  unmatchedManualUrls: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTabRetentionRecord(value: unknown): value is TabRetentionRecord {
  if (!isObject(value)) return false;
  return (
    typeof value.tabId === "number" &&
    typeof value.urlSnapshot === "string" &&
    typeof value.lastUsedAt === "number" &&
    typeof value.foregroundVisitCount === "number" &&
    typeof value.totalForegroundMs === "number" &&
    (value.retention === "normal" ||
      value.retention === "auto-protected" ||
      value.retention === "manual-protected")
  );
}

function isDeletedTabRecord(value: unknown): value is AutoDeletedTabRecord {
  if (!isObject(value)) return false;
  return (
    typeof value.deletionId === "string" &&
    typeof value.deletedAt === "number" &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    typeof value.originalWindowId === "number" &&
    typeof value.originalIndex === "number" &&
    value.deletionReason === "inactive-transient" &&
    typeof value.lastUsedAt === "number" &&
    typeof value.foregroundVisitCount === "number" &&
    typeof value.totalForegroundMs === "number"
  );
}

function isRuntimeState(value: unknown): value is TabRetentionRuntimeState {
  if (!isObject(value)) return false;
  return (
    value.idleState === "active" ||
    value.idleState === "idle" ||
    value.idleState === "locked"
  );
}

export class ChromeTabRetentionStorage {
  async loadPersistent(): Promise<TabRetentionState> {
    const stored = (await chrome.storage.local.get(PERSISTENT_KEY))[
      PERSISTENT_KEY
    ];
    if (!isObject(stored)) {
      return {
        featureEnabledAt: null,
        records: new Map(),
        deletedTabs: [],
        unmatchedManualUrls: [],
      };
    }

    const records = Array.isArray(stored.records)
      ? stored.records.filter(isTabRetentionRecord)
      : [];
    const deletedTabs = Array.isArray(stored.deletedTabs)
      ? stored.deletedTabs.filter(isDeletedTabRecord)
      : [];

    return {
      featureEnabledAt:
        typeof stored.featureEnabledAt === "number"
          ? stored.featureEnabledAt
          : null,
      records: new Map(records.map((record) => [record.tabId, record])),
      deletedTabs,
      unmatchedManualUrls: Array.isArray(stored.unmatchedManualUrls)
        ? stored.unmatchedManualUrls.filter(
            (url): url is string => typeof url === "string"
          )
        : [],
    };
  }

  async savePersistent(state: TabRetentionState): Promise<void> {
    const stored: StoredPersistentState = {
      featureEnabledAt: state.featureEnabledAt,
      records: Array.from(state.records.values()),
      deletedTabs: state.deletedTabs,
      unmatchedManualUrls: state.unmatchedManualUrls,
    };
    await chrome.storage.local.set({ [PERSISTENT_KEY]: stored });
  }

  async loadRuntime(): Promise<TabRetentionRuntimeState | null> {
    const stored = (await chrome.storage.session.get(RUNTIME_KEY))[RUNTIME_KEY];
    return isRuntimeState(stored) ? stored : null;
  }

  async saveRuntime(state: TabRetentionRuntimeState): Promise<void> {
    await chrome.storage.session.set({ [RUNTIME_KEY]: state });
  }
}
