import type { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import { TabMemoService } from "./service";
import type {
  OrphanTabMemo,
  TabMemo,
  TabMemoDisplayState,
  TabMemoLayout,
  TabMemoSummary,
} from "./types";

const service = new TabMemoService();

function reportFailure(phase: string, error: unknown): void {
  console.error(`Tab memo ${phase} failed. Details:`, error);
}

function invalidTabId(tabId: unknown): boolean {
  return !Number.isInteger(tabId) || (tabId as number) < 0;
}

export function bindTabMemo(): void {
  // 新しいブラウザセッションの開始時に、保持しているメモを開いているタブへ結び直す。
  chrome.runtime.onStartup.addListener(() => {
    void service
      .rematchAll()
      .catch((error) => reportFailure("session rematch", error));
  });

  // タブを閉じても本文は捨てない。結びつきだけ解いて孤児として残す。
  chrome.tabs.onRemoved.addListener((tabId) => {
    void service.detach(tabId).catch((error) => reportFailure("detach", error));
  });

  // 再結合の手がかりを新鮮に保つ。URL・タイトル・位置のいずれかが変わったら更新する。
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
}

export async function getTabMemo(params: {
  tabId: number;
}): Promise<RpcResponse<{ memo: TabMemo | null }>> {
  if (invalidTabId(params.tabId)) return { ok: false, error: "Invalid tabId." };
  const memo = await service.get(params.tabId);
  return { ok: true, data: { memo: memo ?? null } };
}

export async function setTabMemoText(params: {
  tabId: number;
  text: string;
}): Promise<RpcResponse<{ memo: TabMemo }>> {
  if (invalidTabId(params.tabId)) return { ok: false, error: "Invalid tabId." };
  if (typeof params.text !== "string") {
    return { ok: false, error: "Invalid text." };
  }
  return {
    ok: true,
    data: { memo: await service.setText(params.tabId, params.text) },
  };
}

export async function updateTabMemoLayout(params: {
  tabId: number;
  layout: Partial<TabMemoLayout>;
}): Promise<RpcResponse<{ memo: TabMemo | null }>> {
  if (invalidTabId(params.tabId)) return { ok: false, error: "Invalid tabId." };
  const memo = await service.updateLayout(params.tabId, params.layout ?? {});
  return { ok: true, data: { memo: memo ?? null } };
}

export async function setTabMemoDisplayState(params: {
  tabId: number;
  state: TabMemoDisplayState;
}): Promise<RpcResponse<{ memo: TabMemo | null }>> {
  if (invalidTabId(params.tabId)) return { ok: false, error: "Invalid tabId." };
  if (
    params.state !== "minimized" &&
    params.state !== "normal" &&
    params.state !== "expanded"
  ) {
    return { ok: false, error: "Invalid display state." };
  }
  const memo = await service.setDisplayState(params.tabId, params.state);
  return { ok: true, data: { memo: memo ?? null } };
}

export async function removeTabMemo(params: {
  tabId: number;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (invalidTabId(params.tabId)) return { ok: false, error: "Invalid tabId." };
  await service.remove(params.tabId);
  return { ok: true, data: {} };
}

export async function listTabMemos(): Promise<
  RpcResponse<{ memos: TabMemoSummary[] }>
> {
  return { ok: true, data: { memos: await service.listSummaries() } };
}

export async function listOrphanTabMemos(): Promise<
  RpcResponse<{ orphans: OrphanTabMemo[] }>
> {
  return { ok: true, data: { orphans: await service.listOrphans() } };
}

export async function adoptOrphanTabMemo(params: {
  recordId: string;
  tabId: number;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (invalidTabId(params.tabId)) return { ok: false, error: "Invalid tabId." };
  if (typeof params.recordId !== "string" || params.recordId.length === 0) {
    return { ok: false, error: "Invalid recordId." };
  }
  const adopted = await service.adoptOrphan(params.recordId, params.tabId);
  if (!adopted) return { ok: false, error: "Memo is already attached." };
  return { ok: true, data: {} };
}

export async function forgetOrphanTabMemo(params: {
  recordId: string;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (typeof params.recordId !== "string" || params.recordId.length === 0) {
    return { ok: false, error: "Invalid recordId." };
  }
  const forgotten = await service.forgetOrphan(params.recordId);
  if (!forgotten) return { ok: false, error: "Memo not found." };
  return { ok: true, data: {} };
}
