// TODO: #1 REFACTOR
import type {
  RpcHandlerContext,
  RpcResponse,
  RpcVoidResponseBody,
} from "../lib/rpc/types";

const tabFocusTargetByNotificationId = new Map<
  string,
  { tabId: number; windowId?: number }
>();

export function bindNotificationClickHandler(): void {
  chrome.notifications.onClicked.addListener((notificationId) => {
    const target = tabFocusTargetByNotificationId.get(notificationId);
    if (!target) return;

    if (typeof target.windowId === "number") {
      chrome.windows.update(target.windowId, { focused: true });
    }
    chrome.tabs.update(target.tabId, { active: true });
    tabFocusTargetByNotificationId.delete(notificationId);
    chrome.notifications.clear(notificationId);
  });

  chrome.notifications.onClosed.addListener((notificationId) => {
    // 手元に保持している通知とタブの対応関係をクリーンアップ
    tabFocusTargetByNotificationId.delete(notificationId);
  });
}

type NotifyParams = {
  notificationId?: string;
  /** notificationを作成するときのパラメータ */
  options: chrome.notifications.NotificationOptions<true>;
  /** 永続させる必要のない通知 (揮発させて良い通知) を明示的にdeleteするまでの時間 */
  ttlMs?: number;
};

export function notify(
  params: NotifyParams,
  context: RpcHandlerContext
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const isValidTtl =
    typeof params.ttlMs === "undefined" ? true : params.ttlMs >= 0;
  if (!isValidTtl) {
    return Promise.resolve({
      ok: false,
      error: "Invalid ttlMs: must be greater than or equal to 0.",
    });
  }

  return new Promise((resolve) => {
    const callback = (notificationId: string) => {
      const tabId = context.sender.tab?.id;
      if (typeof tabId === "number") {
        tabFocusTargetByNotificationId.set(notificationId, {
          tabId,
          windowId: context.sender.tab?.windowId,
        });
      }

      // ttlMsが存在すれば、通知を削除する処理までセットしておく
      if (params.ttlMs !== undefined) {
        setTimeout(() => {
          chrome.notifications.clear(notificationId);
        }, params.ttlMs);
      }

      resolve({ ok: true, data: {} });
    };

    if (typeof params.notificationId !== "undefined") {
      chrome.notifications.create(
        params.notificationId,
        params.options,
        callback
      );
      return;
    }

    chrome.notifications.create(params.options, callback);
  });
}
