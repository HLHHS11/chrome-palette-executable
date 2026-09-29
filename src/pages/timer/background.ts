import { createTabsRpcClient } from "@core/rpc";
import type {
  RpcHandlerContext,
  RpcResponse,
  RpcVoidResponseBody,
} from "@core/rpc";
import {
  startPersistentSound,
  stopPersistentSound,
} from "@pages/background/notification-sound";

import { routes as contentRoutes } from "../content/routes";
import { formatDuration } from "./duration";
import { TimerService } from "./service";
import type {
  FiredTimer,
  TabTimers,
  Timer,
  TimerEntry,
  TimerOverlayLayout,
  TimerSound,
} from "./types";

const service = new TimerService();
const callContentRpc = createTabsRpcClient<typeof contentRoutes>();

/** アラーム名と通知 ID に共通で使う前置き。他の用途と混ざらないよう印を付ける。 */
const TIMER_KEY_PREFIX = "timer:";

function alarmNameOf(timerId: string): string {
  return `${TIMER_KEY_PREFIX}${timerId}`;
}

function timerIdOf(key: string): string | null {
  return key.startsWith(TIMER_KEY_PREFIX)
    ? key.slice(TIMER_KEY_PREFIX.length)
    : null;
}

/**
 * ページ上の表示を作り直させる。パレットから変更しても、そのタブは気付けない。
 * content script が動いていないページでは失敗するが、それは想定内。
 */
function refreshOverlay(tabId: number | undefined): void {
  if (tabId === undefined) return;
  void callContentRpc({ name: "timer.refreshOverlay" }, { tabId }).catch(
    () => undefined
  );
}

function reportFailure(phase: string, error: unknown): void {
  console.error(`Timer ${phase} failed. Details:`, error);
}

function resolveTabId(
  tabId: number | undefined,
  context: RpcHandlerContext
): number | null {
  const resolved = tabId ?? context.sender?.tab?.id;
  if (!Number.isInteger(resolved) || (resolved as number) < 0) return null;
  return resolved as number;
}

function notifyFired(fired: FiredTimer): void {
  const elapsed = formatDuration(fired.timer.deadline - fired.timer.startedAt);
  const origin = fired.tabTitle ? ` · ${fired.tabTitle}` : "";
  chrome.notifications.create(alarmNameOf(fired.timer.id), {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/128x128.png"),
    title: fired.timer.title || "タイマー",
    message: `${elapsed}が経過しました${origin}`,
    // Windows などでは通知が消えなくなる。macOS では効かないため、
    // 消えない側の役割はページ上のオーバーレイが担う。
    requireInteraction: true,
    silent: fired.timer.sound !== "default",
    priority: 2,
  });
  if (fired.timer.sound === "persistent") void startPersistentSound();
}

/**
 * 期限の来たタイマーを鳴らす。
 *
 * 状態が実際に動いたものだけが返るので、アラームとページ側の申告の
 * どちらから呼ばれても通知が重なることはない。
 */
async function fireDueTimers(): Promise<void> {
  const fired = await service.fireDue(Date.now());
  for (const entry of fired) {
    notifyFired(entry);
    refreshOverlay(entry.tabId);
  }
}

/** 未発火のタイマーぶんのアラームを張り直す。再起動や更新で失われるため。 */
async function restoreAlarms(): Promise<void> {
  const entries = await service.listAll();
  for (const entry of entries) {
    if (entry.timer.status !== "pending") continue;
    chrome.alarms.create(alarmNameOf(entry.timer.id), {
      when: entry.timer.deadline,
    });
  }
}

export function bindTimer(): void {
  chrome.runtime.onStartup.addListener(() => {
    void service
      .rematchAll()
      .then(restoreAlarms)
      .then(fireDueTimers)
      .catch((error) => reportFailure("session restore", error));
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (timerIdOf(alarm.name) === null) return;
    void fireDueTimers().catch((error) => reportFailure("fire", error));
  });

  // タブを閉じても期限は生きている。結びつきだけ解く。
  chrome.tabs.onRemoved.addListener((tabId) => {
    void service.detach(tabId).catch((error) => reportFailure("detach", error));
  });

  // 再結合の手がかりを新鮮に保つ。
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url === undefined && changeInfo.title === undefined) return;
    void service
      .syncBinding(tabId)
      .catch((error) => reportFailure("binding sync", error));
  });
  chrome.tabs.onMoved.addListener((tabId) => {
    void service
      .syncBinding(tabId)
      .catch((error) => reportFailure("binding sync", error));
  });

  chrome.notifications.onClicked.addListener((notificationId) => {
    const timerId = timerIdOf(notificationId);
    if (timerId === null) return;
    void returnToTimerTab(notificationId, timerId).catch((error) =>
      reportFailure("notification click", error)
    );
  });

  chrome.notifications.onClosed.addListener((notificationId, byUser) => {
    if (timerIdOf(notificationId) === null) return;
    // 自動で閉じただけなら鳴らし続ける。席を外している間に消えるのが
    // まさに鳴らし続けたい場面だからである。
    if (byUser) void stopPersistentSound();
  });
}

/**
 * 通知をクリックされたときに、待っていたタブへ戻す。
 * タブが既に無ければ、記録に残っている URL を開き直す。
 */
async function returnToTimerTab(
  notificationId: string,
  timerId: string
): Promise<void> {
  const found = await service.find(timerId);
  chrome.notifications.clear(notificationId);
  void stopPersistentSound();
  if (!found) return;

  await service.remove(timerId);
  if (found.tabId !== undefined) {
    const tab = await chrome.tabs.get(found.tabId).catch(() => undefined);
    if (tab) {
      await chrome.tabs.update(found.tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      refreshOverlay(found.tabId);
      return;
    }
  }
  if (found.url) await chrome.tabs.create({ url: found.url });
}

export async function startTimer(
  params: {
    tabId?: number;
    durationMs: number;
    title?: string;
    sound?: TimerSound;
  },
  context: RpcHandlerContext
): Promise<RpcResponse<{ timer: Timer }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  if (!Number.isFinite(params.durationMs) || params.durationMs <= 0) {
    return { ok: false, error: "時間を入力してください。" };
  }

  const timer = await service.start(tabId, {
    durationMs: params.durationMs,
    title: params.title ?? "",
    sound: params.sound ?? "default",
  });
  chrome.alarms.create(alarmNameOf(timer.id), { when: timer.deadline });
  refreshOverlay(tabId);
  return { ok: true, data: { timer } };
}

export async function listTabTimers(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<TabTimers>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  return { ok: true, data: await service.listForTab(tabId) };
}

export async function listAllTimers(): Promise<
  RpcResponse<{ entries: TimerEntry[] }>
> {
  return { ok: true, data: { entries: await service.listAll() } };
}

export async function removeTimer(params: {
  timerId: string;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (typeof params.timerId !== "string" || params.timerId.length === 0) {
    return { ok: false, error: "Invalid timerId." };
  }
  const found = await service.find(params.timerId);
  const removed = await service.remove(params.timerId);
  if (!removed) return { ok: false, error: "そのタイマーはありません。" };

  chrome.alarms.clear(alarmNameOf(params.timerId));
  chrome.notifications.clear(alarmNameOf(params.timerId));
  if (found?.timer.sound === "persistent") void stopPersistentSound();
  refreshOverlay(found?.tabId);
  return { ok: true, data: {} };
}

export async function moveTimerOverlay(
  params: { tabId?: number; layout: TimerOverlayLayout },
  context: RpcHandlerContext
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  await service.moveOverlay(tabId, params.layout);
  return { ok: true, data: {} };
}

/**
 * 期限が来たことをページ側から知らせてもらう入口。
 *
 * `chrome.alarms` は 30 秒より細かい粒度を守らない。短いタイマーを
 * 秒単位で鳴らすために、開いているタブからの申告も受け付ける。
 * 申告された内容は信用せず、保存済みの期限だけを見て判断する。
 */
export async function reportTimersDue(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  await fireDueTimers();
  return { ok: true, data: {} };
}
