import {
  type ExtractRpcRequest,
  type RpcResponse,
  type RpcVoidResponseBody,
  createTabsRpcClient,
} from "@core/rpc";

import { routes as contentRoutes } from "../content/routes";

const NUMBERING_SAFETY_TIMEOUT_MS = 10_000;

/**
 * 表示順 idx (0-origin) に対応する Cmd+数字 ショートカット番号を返す純粋関数。
 *
 * 0から7までは、1-originの値を返し、最後のタブは9を返す。
 * それ以外 (8以上、最後以外) `Cmd + 数字` キーバインドを割り当てられないので、 null を返す。
 */
function pickTabNumberForIndex(idx: number, total: number): number | null {
  if (idx < 8) return idx + 1;
  if (idx === total - 1) return 9;
  return null;
}

const callContentRpc = createTabsRpcClient<typeof contentRoutes>();

type ContentRpcMessage = ExtractRpcRequest<(typeof contentRoutes)[number]>;

/**
 * エラーが発生した場合に意図的に失敗を握りつぶすための、RPCクライアントラッパー。
 * `chrome://` 等の特殊なタブには content script が注入できず、RPCが失敗するが、それは無視して良いため。
 */
async function callBestEffortRpcToTab(
  tabId: number,
  message: ContentRpcMessage
): Promise<void> {
  await callContentRpc(message, { tabId }).catch(() => undefined);
}

class TabNumberingController {
  // 番号付け対象のウィンドウ ID。 null の間は「番号付け非適用中」を表す。
  private activeWindowId: number | null = null;
  // keyup を取り逃した場合のフォールバック復元用タイマー。
  private safetyTimerId: ReturnType<typeof setTimeout> | null = null;

  private clearSafetyTimer(): void {
    if (this.safetyTimerId !== null) {
      clearTimeout(this.safetyTimerId);
      this.safetyTimerId = null;
    }
  }

  private async applyNumbersToActiveWindow(): Promise<void> {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab || activeTab.windowId === undefined) return;
    this.activeWindowId = activeTab.windowId;

    const tabs = await chrome.tabs.query({ windowId: this.activeWindowId });
    const collapsedGroupIds = await chrome.tabGroups
      .query({ windowId: this.activeWindowId, collapsed: true })
      .then((groups) => new Set(groups.map((g) => g.id)))
      .catch(() => new Set<number>());

    const visibleTabs = tabs
      .slice()
      .sort((a, b) => a.index - b.index)
      .filter((t) => !collapsedGroupIds.has(t.groupId));

    const applyNumberingPromises = visibleTabs.map((tab, idx) => {
      if (tab.id === undefined) return;
      const number = pickTabNumberForIndex(idx, visibleTabs.length);
      if (number === null) return;
      return callBestEffortRpcToTab(tab.id, {
        name: "tabNumbering.applyTitleInFrame",
        number,
      });
    });

    await Promise.all(applyNumberingPromises);
  }

  private async restoreNumbersInActiveWindow(): Promise<void> {
    if (this.activeWindowId === null) return;
    const windowIdToRestore = this.activeWindowId;
    this.activeWindowId = null;
    this.clearSafetyTimer();

    const tabs = await chrome.tabs.query({ windowId: windowIdToRestore });
    const restoreTitlePromises = tabs.map((tab) => {
      if (tab.id === undefined) return;
      return callBestEffortRpcToTab(tab.id, {
        name: "tabNumbering.restoreTitleInFrame",
      });
    });

    await Promise.all(restoreTitlePromises);
  }

  async show(): Promise<RpcResponse<RpcVoidResponseBody>> {
    await this.applyNumbersToActiveWindow();

    // safety timeout: keyup を取り逃しても確実に hide される保険。
    this.clearSafetyTimer();
    this.safetyTimerId = setTimeout(() => {
      void this.restoreNumbersInActiveWindow();
    }, NUMBERING_SAFETY_TIMEOUT_MS);

    return { ok: true, data: {} };
  }

  async hide(): Promise<RpcResponse<RpcVoidResponseBody>> {
    await this.restoreNumbersInActiveWindow();
    return { ok: true, data: {} };
  }

  bindAutoHide(): void {
    // Cmd+数字 でタブ切替が走ると keyup を取り逃すことがあるため、 同一ウィンドウ内で
    // active タブが変わったタイミングで強制 hide する保険。
    chrome.tabs.onActivated.addListener((info) => {
      if (this.activeWindowId === null) return;
      if (info.windowId !== this.activeWindowId) return;
      void this.restoreNumbersInActiveWindow();
    });
  }
}

// シングルトンを生成し、クロージャ関数としてエクスポートする。
const controller = new TabNumberingController();

export function showTabNumbers(): Promise<RpcResponse<RpcVoidResponseBody>> {
  return controller.show();
}
export function hideTabNumbers(): Promise<RpcResponse<RpcVoidResponseBody>> {
  return controller.hide();
}
export function bindTabNumberingAutoHide(): void {
  controller.bindAutoHide();
}
