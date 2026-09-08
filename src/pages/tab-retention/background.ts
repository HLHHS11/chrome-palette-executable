import { CrossRuntimeMessenger } from "@core/cross-runtime-message";
import type { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import { tabRetentionLaunchIntentMessage } from "./intents";
import { TAB_RETENTION_POLICY } from "./policy";
import {
  TAB_RETENTION_ALARM_NAME,
  TAB_RETENTION_STALE_NOTIFICATION_ID,
  TabRetentionService,
} from "./service";
import { ChromeTabRetentionStorage } from "./storage";
import type { TabRetention, TabRetentionOverview } from "./types";

const service = new TabRetentionService(new ChromeTabRetentionStorage());

function reportFailure(phase: string, error: unknown): void {
  console.error(`Tab retention ${phase} failed. Details:`, error);
}

export function bindTabRetention(): void {
  chrome.idle.setDetectionInterval(TAB_RETENTION_POLICY.idleDetectionSeconds);

  void service
    .initialize()
    .catch((error) => reportFailure("initialization", error));

  chrome.tabs.onCreated.addListener((tab) => {
    void service
      .recordTabCreated(tab)
      .catch((error) => reportFailure("tab creation recording", error));
  });
  chrome.tabs.onActivated.addListener((info) => {
    void service
      .recordTabActivated(info)
      .catch((error) => reportFailure("tab activation recording", error));
  });
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    void service
      .recordTabRemoved(tabId, removeInfo.isWindowClosing)
      .catch((error) => reportFailure("tab removal recording", error));
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url === undefined) return;
    void service
      .recordTabUrl(tabId, changeInfo.url)
      .catch((error) => reportFailure("tab URL recording", error));
  });
  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    void service
      .recordTabReplacement(addedTabId, removedTabId)
      .catch((error) => reportFailure("tab replacement recording", error));
  });
  chrome.windows.onFocusChanged.addListener((windowId) => {
    void service
      .recordWindowFocus(windowId)
      .catch((error) => reportFailure("window focus recording", error));
  });
  chrome.idle.onStateChanged.addListener((idleState) => {
    void service
      .recordIdleState(idleState)
      .catch((error) => reportFailure("idle state recording", error));
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== TAB_RETENTION_ALARM_NAME) return;
    void service
      .performScheduledCleanup()
      .catch((error) => reportFailure("scheduled cleanup", error));
  });
  void Promise.all([
    chrome.alarms.clear("watchdog"),
    chrome.alarms.clear("watchdog2"),
  ])
    .then(() => chrome.alarms.getAll())
    .then((alarms) => {
      if (alarms.some((alarm) => alarm.name === TAB_RETENTION_ALARM_NAME)) {
        return;
      }
      return chrome.alarms.create(TAB_RETENTION_ALARM_NAME, {
        delayInMinutes: TAB_RETENTION_POLICY.cleanupPeriodMinutes,
        periodInMinutes: TAB_RETENTION_POLICY.cleanupPeriodMinutes,
      });
    })
    .catch((error) => reportFailure("alarm registration", error));

  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== TAB_RETENTION_STALE_NOTIFICATION_ID) return;
    void new CrossRuntimeMessenger()
      .send(tabRetentionLaunchIntentMessage, { category: "auto" })
      .then(() => chrome.action.openPopup())
      .then(() => chrome.notifications.clear(notificationId))
      .catch((error) => reportFailure("notification opening", error));
  });
}

export async function listTabRetentionOverview(): Promise<
  RpcResponse<{ overview: TabRetentionOverview }>
> {
  return { ok: true, data: { overview: await service.listOverview() } };
}

export async function setTabRetentionProtection(params: {
  tabId: number;
  retention: "normal" | "manual-protected";
}): Promise<RpcResponse<{ retention: TabRetention }>> {
  if (!Number.isInteger(params.tabId) || params.tabId < 0) {
    return { ok: false, error: "Invalid tabId." };
  }
  if (
    params.retention !== "normal" &&
    params.retention !== "manual-protected"
  ) {
    return { ok: false, error: "Invalid retention." };
  }
  return {
    ok: true,
    data: {
      retention: await service.setProtection(params.tabId, params.retention),
    },
  };
}

export async function restoreAutoDeletedTab(params: {
  deletionId: string;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (!params.deletionId) {
    return { ok: false, error: "Invalid deletionId." };
  }
  const restored = await service.restoreDeletedTab(params.deletionId);
  if (!restored) {
    return {
      ok: true,
      info: "The deleted tab was already restored or expired.",
    };
  }
  return { ok: true, data: {} };
}

export async function reopenUnmatchedManualProtection(params: {
  url: string;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (!params.url) return { ok: false, error: "Invalid URL." };
  await service.reopenUnmatchedManualUrl(params.url);
  return { ok: true, data: {} };
}

export async function forgetUnmatchedManualProtection(params: {
  url: string;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (!params.url) return { ok: false, error: "Invalid URL." };
  await service.forgetUnmatchedManualUrl(params.url);
  return { ok: true, data: {} };
}

export { tabRetentionLaunchIntentMessage } from "./intents";
