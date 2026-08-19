import {
  TAB_RETENTION_POLICY,
  applyUsageProtection,
  assessTabRetention,
  retainRecentDeletionHistory,
} from "./policy";
import { ChromeTabRetentionStorage } from "./storage";
import type {
  AutoDeletedTabRecord,
  OpenTabFacts,
  TabRetention,
  TabRetentionOverview,
  TabRetentionRecord,
  TabRetentionRuntimeState,
  TabRetentionState,
  TabRetentionTabItem,
} from "./types";

type IdentifiedTab = chrome.tabs.Tab & { id: number };

export const TAB_RETENTION_ALARM_NAME = "tab-retention-cleanup";
export const TAB_RETENTION_STALE_NOTIFICATION_ID =
  "tab-retention-stale-recommendation";

function tabUrl(tab: chrome.tabs.Tab): string {
  return tab.url ?? tab.pendingUrl ?? "";
}

function hasTabId(tab: chrome.tabs.Tab): tab is IdentifiedTab {
  return typeof tab.id === "number";
}

export class TabRetentionService {
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(private readonly storage: ChromeTabRetentionStorage) {}

  private queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingOperation.then(operation, operation);
    this.pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async queryManagedTabs(): Promise<IdentifiedTab[]> {
    const windows = await chrome.windows.getAll({
      populate: true,
      windowTypes: ["normal"],
    });
    return windows
      .flatMap((window) => window.tabs ?? [])
      .filter(hasTabId)
      .filter((tab) => !tab.incognito);
  }

  private createRecord(tab: IdentifiedTab, now: number): TabRetentionRecord {
    return {
      tabId: tab.id,
      urlSnapshot: tabUrl(tab),
      lastUsedAt: now,
      foregroundVisitCount: 0,
      totalForegroundMs: 0,
      retention: "normal",
    };
  }

  private ensureRecord(
    state: TabRetentionState,
    tab: IdentifiedTab,
    now: number
  ): TabRetentionRecord {
    const existing = state.records.get(tab.id);
    if (existing) {
      existing.urlSnapshot = tabUrl(tab);
      return existing;
    }
    const created = this.createRecord(tab, now);
    state.records.set(tab.id, created);
    return created;
  }

  private reconcileOpenTabs(
    state: TabRetentionState,
    tabs: readonly IdentifiedTab[],
    now: number
  ): void {
    const openTabIds = new Set<number>();
    for (const tab of tabs) {
      openTabIds.add(tab.id);
      this.ensureRecord(state, tab, now);
    }
    for (const tabId of state.records.keys()) {
      if (!openTabIds.has(tabId)) state.records.delete(tabId);
    }
  }

  private checkpointForeground(
    state: TabRetentionState,
    runtime: TabRetentionRuntimeState,
    now: number
  ): void {
    if (
      runtime.foregroundTabId === undefined ||
      runtime.foregroundStartedAt === undefined
    ) {
      return;
    }
    const record = state.records.get(runtime.foregroundTabId);
    if (!record) {
      delete runtime.foregroundTabId;
      delete runtime.foregroundStartedAt;
      return;
    }

    record.totalForegroundMs += Math.max(0, now - runtime.foregroundStartedAt);
    record.lastUsedAt = now;
    state.records.set(record.tabId, applyUsageProtection(record));
    runtime.foregroundStartedAt = now;
  }

  private endForeground(
    state: TabRetentionState,
    runtime: TabRetentionRuntimeState,
    now: number
  ): void {
    this.checkpointForeground(state, runtime, now);
    delete runtime.foregroundTabId;
    delete runtime.foregroundStartedAt;
  }

  private startForeground(
    state: TabRetentionState,
    runtime: TabRetentionRuntimeState,
    tab: IdentifiedTab,
    now: number,
    countVisit: boolean
  ): void {
    if (runtime.foregroundTabId === tab.id) return;
    this.endForeground(state, runtime, now);

    const record = this.ensureRecord(state, tab, now);
    record.lastUsedAt = now;
    if (countVisit) record.foregroundVisitCount += 1;
    state.records.set(record.tabId, applyUsageProtection(record));
    runtime.foregroundTabId = tab.id;
    runtime.foregroundStartedAt = now;
  }

  private factsForTab(tab: IdentifiedTab): OpenTabFacts {
    return {
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible === true,
      incognito: tab.incognito,
      extensionPage: tabUrl(tab).startsWith(chrome.runtime.getURL("")),
    };
  }

  private async initializeSession(now: number): Promise<void> {
    const existingRuntime = await this.storage.loadRuntime();
    const tabs = await this.queryManagedTabs();
    const state = await this.storage.loadPersistent();
    state.featureEnabledAt ??= now;
    state.deletedTabs = retainRecentDeletionHistory(state.deletedTabs, now);

    if (existingRuntime) {
      this.reconcileOpenTabs(state, tabs, now);
      if (
        existingRuntime.foregroundTabId !== undefined &&
        !state.records.has(existingRuntime.foregroundTabId)
      ) {
        delete existingRuntime.foregroundTabId;
        delete existingRuntime.foregroundStartedAt;
      }
      await this.storage.savePersistent(state);
      await this.storage.saveRuntime(existingRuntime);
      return;
    }

    // tabId はブラウザセッションを越えて安定しない。新しいセッションでは利用統計を
    // 作り直し、一意な完全一致 URL に限って明示保持だけを引き継ぐ。
    const manualUrls = new Set(state.unmatchedManualUrls);
    for (const record of state.records.values()) {
      if (record.retention !== "manual-protected" || !record.urlSnapshot) {
        continue;
      }
      manualUrls.add(record.urlSnapshot);
    }
    const openTabsByUrl = new Map<string, IdentifiedTab[]>();
    for (const tab of tabs) {
      const url = tabUrl(tab);
      const sameUrlTabs = openTabsByUrl.get(url) ?? [];
      sameUrlTabs.push(tab);
      openTabsByUrl.set(url, sameUrlTabs);
    }

    state.records = new Map();
    for (const tab of tabs) {
      const record = this.createRecord(tab, now);
      const url = tabUrl(tab);
      if (url && manualUrls.has(url) && openTabsByUrl.get(url)?.length === 1) {
        record.retention = "manual-protected";
        manualUrls.delete(url);
      }
      state.records.set(tab.id, record);
    }
    state.unmatchedManualUrls = Array.from(manualUrls);

    const idleState = await chrome.idle.queryState(
      TAB_RETENTION_POLICY.idleDetectionSeconds
    );
    const focusedWindow = await chrome.windows
      .getLastFocused({ windowTypes: ["normal"] })
      .catch(() => undefined);
    const runtime: TabRetentionRuntimeState = {
      idleState,
      focusedWindowId:
        focusedWindow?.focused && focusedWindow.id !== undefined
          ? focusedWindow.id
          : undefined,
    };

    if (
      runtime.idleState === "active" &&
      runtime.focusedWindowId !== undefined
    ) {
      const activeTab = tabs.find(
        (tab) => tab.windowId === runtime.focusedWindowId && tab.active
      );
      if (activeTab) this.startForeground(state, runtime, activeTab, now, true);
    }

    await this.storage.savePersistent(state);
    await this.storage.saveRuntime(runtime);
  }

  initialize(): Promise<void> {
    return this.queueOperation(() => this.initializeSession(Date.now()));
  }

  recordTabCreated(tab: chrome.tabs.Tab): Promise<void> {
    return this.queueOperation(async () => {
      if (!hasTabId(tab) || tab.incognito) return;
      const state = await this.storage.loadPersistent();
      this.ensureRecord(state, tab, Date.now());
      await this.storage.savePersistent(state);
    });
  }

  recordTabActivated(info: chrome.tabs.TabActiveInfo): Promise<void> {
    return this.queueOperation(async () => {
      const now = Date.now();
      const [state, runtime, tab] = await Promise.all([
        this.storage.loadPersistent(),
        this.storage.loadRuntime(),
        chrome.tabs.get(info.tabId),
      ]);
      if (!runtime || tab.incognito || !hasTabId(tab)) return;
      this.ensureRecord(state, tab, now);
      if (
        runtime.idleState === "active" &&
        runtime.focusedWindowId === info.windowId
      ) {
        this.startForeground(state, runtime, tab, now, true);
      }
      await this.storage.savePersistent(state);
      await this.storage.saveRuntime(runtime);
    });
  }

  recordWindowFocus(windowId: number): Promise<void> {
    return this.queueOperation(async () => {
      const now = Date.now();
      const [state, runtime] = await Promise.all([
        this.storage.loadPersistent(),
        this.storage.loadRuntime(),
      ]);
      if (!runtime) return;
      this.endForeground(state, runtime, now);
      runtime.focusedWindowId =
        windowId === chrome.windows.WINDOW_ID_NONE ? undefined : windowId;

      if (
        runtime.idleState === "active" &&
        runtime.focusedWindowId !== undefined
      ) {
        const [tab] = await chrome.tabs.query({
          active: true,
          windowId: runtime.focusedWindowId,
        });
        if (tab && hasTabId(tab) && !tab.incognito) {
          this.startForeground(state, runtime, tab, now, true);
        }
      }

      await this.storage.savePersistent(state);
      await this.storage.saveRuntime(runtime);
    });
  }

  recordIdleState(idleState: chrome.idle.IdleState): Promise<void> {
    return this.queueOperation(async () => {
      const now = Date.now();
      const [state, runtime] = await Promise.all([
        this.storage.loadPersistent(),
        this.storage.loadRuntime(),
      ]);
      if (!runtime || runtime.idleState === idleState) return;
      this.endForeground(state, runtime, now);
      runtime.idleState = idleState;

      if (idleState === "active" && runtime.focusedWindowId !== undefined) {
        const [tab] = await chrome.tabs.query({
          active: true,
          windowId: runtime.focusedWindowId,
        });
        if (tab && hasTabId(tab) && !tab.incognito) {
          this.startForeground(state, runtime, tab, now, true);
        }
      }

      await this.storage.savePersistent(state);
      await this.storage.saveRuntime(runtime);
    });
  }

  recordTabRemoved(tabId: number, isWindowClosing: boolean): Promise<void> {
    return this.queueOperation(async () => {
      const [state, runtime] = await Promise.all([
        this.storage.loadPersistent(),
        this.storage.loadRuntime(),
      ]);
      const removedRecord = state.records.get(tabId);
      // ブラウザ終了も window closing として通知されるため、明示保持の URL は次回起動時の
      // best-effort 復元用に残す。同一セッションで閉じたウィンドウの残骸は次回照合で消える。
      if (!isWindowClosing || removedRecord?.retention !== "manual-protected") {
        state.records.delete(tabId);
      }
      if (runtime?.foregroundTabId === tabId) {
        delete runtime.foregroundTabId;
        delete runtime.foregroundStartedAt;
        await this.storage.saveRuntime(runtime);
      }
      await this.storage.savePersistent(state);
    });
  }

  recordTabUrl(tabId: number, url: string): Promise<void> {
    return this.queueOperation(async () => {
      const state = await this.storage.loadPersistent();
      const record = state.records.get(tabId);
      if (!record) return;
      record.urlSnapshot = url;
      await this.storage.savePersistent(state);
    });
  }

  recordTabReplacement(
    addedTabId: number,
    removedTabId: number
  ): Promise<void> {
    return this.queueOperation(async () => {
      const [state, runtime, addedTab] = await Promise.all([
        this.storage.loadPersistent(),
        this.storage.loadRuntime(),
        chrome.tabs.get(addedTabId),
      ]);
      const previous = state.records.get(removedTabId);
      state.records.delete(removedTabId);
      if (previous) {
        previous.tabId = addedTabId;
        previous.urlSnapshot = tabUrl(addedTab);
        state.records.set(addedTabId, previous);
      } else if (hasTabId(addedTab) && !addedTab.incognito) {
        state.records.set(addedTabId, this.createRecord(addedTab, Date.now()));
      }
      if (runtime?.foregroundTabId === removedTabId) {
        runtime.foregroundTabId = addedTabId;
        await this.storage.saveRuntime(runtime);
      }
      await this.storage.savePersistent(state);
    });
  }

  setProtection(tabId: number, retention: "normal" | "manual-protected") {
    return this.queueOperation(async (): Promise<TabRetention> => {
      const now = Date.now();
      const [state, runtime, tab] = await Promise.all([
        this.storage.loadPersistent(),
        this.storage.loadRuntime(),
        chrome.tabs.get(tabId),
      ]);
      if (!hasTabId(tab) || tab.incognito) {
        throw new Error("The tab can not be managed.");
      }
      if (runtime) this.checkpointForeground(state, runtime, now);
      const record = this.ensureRecord(state, tab, now);

      if (retention === "manual-protected") {
        record.retention = "manual-protected";
        delete record.autoProtectionReason;
      } else {
        record.retention = "normal";
        record.lastUsedAt = now;
        record.foregroundVisitCount = 0;
        record.totalForegroundMs = 0;
        delete record.autoProtectionReason;
        delete record.staleNotifiedForLastUsedAt;
        if (runtime?.foregroundTabId === tabId) {
          runtime.foregroundStartedAt = now;
        }
      }
      state.unmatchedManualUrls = state.unmatchedManualUrls.filter(
        (url) => url !== record.urlSnapshot
      );

      await this.storage.savePersistent(state);
      if (runtime) await this.storage.saveRuntime(runtime);
      return record.retention;
    });
  }

  forgetUnmatchedManualUrl(url: string): Promise<void> {
    return this.queueOperation(async () => {
      const state = await this.storage.loadPersistent();
      state.unmatchedManualUrls = state.unmatchedManualUrls.filter(
        (candidate) => candidate !== url
      );
      await this.storage.savePersistent(state);
    });
  }

  private async refreshOpenTabState(now: number): Promise<{
    state: TabRetentionState;
    runtime: TabRetentionRuntimeState | null;
    tabs: IdentifiedTab[];
  }> {
    const [state, runtime, tabs] = await Promise.all([
      this.storage.loadPersistent(),
      this.storage.loadRuntime(),
      this.queryManagedTabs(),
    ]);
    state.featureEnabledAt ??= now;
    if (runtime) this.checkpointForeground(state, runtime, now);
    this.reconcileOpenTabs(state, tabs, now);
    for (const [tabId, record] of state.records) {
      state.records.set(tabId, applyUsageProtection(record));
    }
    state.deletedTabs = retainRecentDeletionHistory(state.deletedTabs, now);
    return { state, runtime, tabs };
  }

  listOverview(): Promise<TabRetentionOverview> {
    return this.queueOperation(async () => {
      const now = Date.now();
      const { state, runtime, tabs } = await this.refreshOpenTabState(now);
      const featureEnabledAt = state.featureEnabledAt ?? now;
      const items: TabRetentionTabItem[] = tabs.map((tab) => {
        const record = state.records.get(tab.id) ?? this.createRecord(tab, now);
        return {
          tabId: tab.id,
          windowId: tab.windowId,
          index: tab.index,
          title: tab.title || "Untitled",
          url: tabUrl(tab),
          faviconUrl: tab.favIconUrl,
          lastUsedAt: record.lastUsedAt,
          foregroundVisitCount: record.foregroundVisitCount,
          totalForegroundMs: record.totalForegroundMs,
          retention: record.retention,
          autoProtectionReason: record.autoProtectionReason,
          assessment: assessTabRetention(
            record,
            this.factsForTab(tab),
            featureEnabledAt,
            now
          ),
          discarded: tab.discarded,
          frozen: tab.frozen,
        };
      });

      await this.storage.savePersistent(state);
      if (runtime) await this.storage.saveRuntime(runtime);
      return {
        generatedAt: now,
        observeOnlyUntil: featureEnabledAt + TAB_RETENTION_POLICY.observeOnlyMs,
        tabs: items,
        recentlyDeleted: state.deletedTabs,
        unmatchedManualUrls: state.unmatchedManualUrls,
      };
    });
  }

  performScheduledCleanup(): Promise<void> {
    return this.queueOperation(async () => {
      const now = Date.now();
      const { state, runtime, tabs } = await this.refreshOpenTabState(now);
      const featureEnabledAt = state.featureEnabledAt ?? now;

      for (const tab of tabs) {
        const record = state.records.get(tab.id);
        if (!record) continue;
        const assessment = assessTabRetention(
          record,
          this.factsForTab(tab),
          featureEnabledAt,
          now
        );
        if (assessment.kind !== "delete-eligible") continue;

        const freshTab = await chrome.tabs.get(tab.id).catch(() => undefined);
        if (!freshTab || !hasTabId(freshTab)) continue;
        const freshUrl = tabUrl(freshTab);
        if (
          freshUrl !== record.urlSnapshot ||
          (freshTab.lastAccessed !== undefined &&
            freshTab.lastAccessed > record.lastUsedAt)
        ) {
          record.urlSnapshot = freshUrl;
          record.lastUsedAt = Math.max(
            record.lastUsedAt,
            freshTab.lastAccessed ?? now
          );
          continue;
        }
        const finalAssessment = assessTabRetention(
          record,
          this.factsForTab(freshTab),
          featureEnabledAt,
          Date.now()
        );
        if (finalAssessment.kind !== "delete-eligible") continue;

        await chrome.tabs.remove(tab.id);
        const deleted: AutoDeletedTabRecord = {
          deletionId: crypto.randomUUID(),
          deletedAt: Date.now(),
          title: freshTab.title || "Untitled",
          url: freshUrl,
          originalWindowId: freshTab.windowId,
          originalIndex: freshTab.index,
          deletionReason: "inactive-transient",
          lastUsedAt: record.lastUsedAt,
          foregroundVisitCount: record.foregroundVisitCount,
          totalForegroundMs: record.totalForegroundMs,
        };
        state.records.delete(tab.id);
        state.deletedTabs = retainRecentDeletionHistory(
          [deleted, ...state.deletedTabs],
          deleted.deletedAt
        );
        // 削除履歴は復元手段なので、各 tabs.remove の直後に永続化する。
        await this.storage.savePersistent(state);
      }

      const staleRecords = tabs
        .map((tab) => ({ tab, record: state.records.get(tab.id) }))
        .filter(
          (
            value
          ): value is { tab: IdentifiedTab; record: TabRetentionRecord } =>
            value.record !== undefined
        )
        .filter(({ tab, record }) => {
          const assessment = assessTabRetention(
            record,
            this.factsForTab(tab),
            featureEnabledAt,
            now
          );
          return (
            assessment.kind === "stale-recommended" &&
            record.staleNotifiedForLastUsedAt !== record.lastUsedAt
          );
        });

      if (staleRecords.length > 0) {
        await chrome.notifications.create(TAB_RETENTION_STALE_NOTIFICATION_ID, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/128x128.png"),
          title: "保持タブを見直しますか？",
          message: `24時間近く使っていない自動保持タブが${staleRecords.length}件あります。`,
        });
        for (const { record } of staleRecords) {
          record.staleNotifiedForLastUsedAt = record.lastUsedAt;
        }
      }

      state.deletedTabs = retainRecentDeletionHistory(state.deletedTabs, now);
      await this.storage.savePersistent(state);
      if (runtime) await this.storage.saveRuntime(runtime);
    });
  }

  restoreDeletedTab(deletionId: string): Promise<IdentifiedTab | null> {
    return this.queueOperation(async () => {
      const state = await this.storage.loadPersistent();
      const entry = state.deletedTabs.find(
        (deletedTab) => deletedTab.deletionId === deletionId
      );
      if (!entry || entry.restoredAt !== undefined) return null;

      const originalWindow = await chrome.windows
        .get(entry.originalWindowId)
        .catch(() => undefined);
      const restoredTab = await chrome.tabs.create({
        url: entry.url || undefined,
        active: true,
        windowId:
          originalWindow && !originalWindow.incognito
            ? entry.originalWindowId
            : undefined,
        index:
          originalWindow && !originalWindow.incognito
            ? entry.originalIndex
            : undefined,
      });
      if (!hasTabId(restoredTab)) return null;
      entry.restoredAt = Date.now();
      await this.storage.savePersistent(state);
      await chrome.windows.update(restoredTab.windowId, { focused: true });
      return restoredTab;
    });
  }
}
