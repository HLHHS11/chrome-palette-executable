// TODO: #1 REFACTOR
import type { RpcHandlerContext, RpcVoidResponseBody } from "../lib/rpc/types";

const notificationTargets = new Map<
  string,
  { tabId: number; windowId?: number }
>();

// TODO: #1 これ、挙動を細かく変えたいケースどうすればいいのか？
// たとえばnotifyのparamsを変えるとかになるんだろうか？
export function bindNotificationClickHandler(): void {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const target = notificationTargets.get(notificationId);
    if (!target) return;

    if (typeof target.windowId === "number") {
      chrome.windows.update(target.windowId, { focused: true });
    }
    chrome.tabs.update(target.tabId, { active: true });
    notificationTargets.delete(notificationId);
    chrome.notifications.clear(notificationId);
  });
}

export function notify(
  params: {
    title: string;
    message: string;
  },
  context: RpcHandlerContext
): Promise<{ ok: true; data: RpcVoidResponseBody }> {
  return new Promise((resolve) => {
    chrome.notifications.create(
      {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128x128.png"),
        title: params.title,
        message: params.message,
      },
      (notificationId) => {
        const tabId = context.sender.tab?.id;
        if (typeof tabId === "number") {
          notificationTargets.set(notificationId, {
            tabId,
            windowId: context.sender.tab?.windowId,
          });
        }
        resolve({ ok: true, data: {} });
      }
    );
  });
}
