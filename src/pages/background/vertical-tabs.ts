import { CrossRuntimeMessenger } from "@core/cross-runtime-message";
import type { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  verticalTabsCloseIntentMessage,
  verticalTabsLaunchIntentMessage,
} from "../popup/commands/vertical-tabs/intents";

const DEFAULT_POPUP_PATH = "src/pages/popup/index.html";

type ActiveVerticalTabsPopup = {
  requestId: string;
  windowId: number;
  tabId: number;
  openedAt: number;
};

let activeVerticalTabsPopup: ActiveVerticalTabsPopup | null = null;

export async function showEphemeralVerticalTabs(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (activeTab?.id === undefined || activeTab.windowId === undefined) {
    return {
      ok: false,
      error: "Could not resolve active tab for vertical tabs popup.",
    };
  }

  const messenger = new CrossRuntimeMessenger();
  if (activeVerticalTabsPopup) {
    await messenger.send(verticalTabsCloseIntentMessage, {
      source: "ephemeral",
      requestId: activeVerticalTabsPopup.requestId,
      reason: "superseded",
    });
  }

  const requestId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  activeVerticalTabsPopup = {
    requestId,
    windowId: activeTab.windowId,
    tabId: activeTab.id,
    openedAt: Date.now(),
  };
  await messenger.send(verticalTabsLaunchIntentMessage, {
    source: "ephemeral",
    requestId,
    windowId: activeTab.windowId,
  });

  const popupUrl = `${DEFAULT_POPUP_PATH}?surface=vertical-tabs&requestId=${encodeURIComponent(
    requestId
  )}&windowId=${activeTab.windowId}`;
  await chrome.action.setPopup({ popup: popupUrl });
  try {
    await chrome.action.openPopup();
  } finally {
    await chrome.action.setPopup({ popup: DEFAULT_POPUP_PATH });
  }
  return { ok: true, data: {} };
}

export async function hideEphemeralVerticalTabs(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  const messenger = new CrossRuntimeMessenger();
  await messenger.send(verticalTabsCloseIntentMessage, {
    source: "ephemeral",
    requestId: activeVerticalTabsPopup?.requestId,
    reason: "manual",
  });
  activeVerticalTabsPopup = null;
  return { ok: true, data: {} };
}
