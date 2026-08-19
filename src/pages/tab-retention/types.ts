export type TabRetention = "normal" | "auto-protected" | "manual-protected";

export type AutoProtectionReason = "active-time" | "visit-count";

export type TabRetentionRecord = {
  tabId: number;
  urlSnapshot: string;
  lastUsedAt: number;
  foregroundVisitCount: number;
  totalForegroundMs: number;
  retention: TabRetention;
  autoProtectionReason?: AutoProtectionReason;
  /** 同じ未使用期間について通知を重複させないため、通知時点の lastUsedAt を保持する。 */
  staleNotifiedForLastUsedAt?: number;
};

export type AutoDeletedTabRecord = {
  deletionId: string;
  deletedAt: number;
  title: string;
  url: string;
  originalWindowId: number;
  originalIndex: number;
  deletionReason: "inactive-transient";
  lastUsedAt: number;
  foregroundVisitCount: number;
  totalForegroundMs: number;
  restoredAt?: number;
};

export type TabRetentionState = {
  featureEnabledAt: number | null;
  records: Map<number, TabRetentionRecord>;
  deletedTabs: AutoDeletedTabRecord[];
  unmatchedManualUrls: string[];
};

export type TabRetentionRuntimeState = {
  idleState: chrome.idle.IdleState;
  focusedWindowId?: number;
  foregroundTabId?: number;
  foregroundStartedAt?: number;
};

export type TabBlockReason =
  | "active"
  | "pinned"
  | "audible"
  | "incognito"
  | "extension-page";

export type TabRetentionAssessment =
  | { kind: "waiting"; deleteAt: number }
  | { kind: "blocked"; reason: TabBlockReason; deleteAt: number }
  | { kind: "observe-only"; deleteAt: number }
  | { kind: "delete-eligible"; deleteAt: number }
  | { kind: "auto-protected"; staleAt: number }
  | { kind: "stale-recommended"; staleAt: number }
  | { kind: "manual-protected" };

export type OpenTabFacts = {
  active: boolean;
  pinned: boolean;
  audible: boolean;
  incognito: boolean;
  extensionPage: boolean;
};

export type TabRetentionTabItem = {
  tabId: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  faviconUrl?: string;
  lastUsedAt: number;
  foregroundVisitCount: number;
  totalForegroundMs: number;
  retention: TabRetention;
  autoProtectionReason?: AutoProtectionReason;
  assessment: TabRetentionAssessment;
  discarded: boolean;
  frozen: boolean;
};

export type TabRetentionOverview = {
  generatedAt: number;
  observeOnlyUntil: number;
  tabs: TabRetentionTabItem[];
  recentlyDeleted: AutoDeletedTabRecord[];
  unmatchedManualUrls: string[];
};

export type TabRetentionCategory = "closing" | "auto" | "manual" | "deleted";

export type TabRetentionLaunchIntent = {
  category: TabRetentionCategory;
};
