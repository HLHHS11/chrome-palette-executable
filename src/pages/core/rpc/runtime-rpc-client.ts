import type { ExtractRpcRequest, ExtractRpcResponse, RpcRoute } from "./types";

/**
 * @param options `tabId` を指定しない場合、アクティブタブに送信します。
 */
async function sendTabsMessage<R extends RpcRoute>(
  message: ExtractRpcRequest<R>,
  options?: { tabId?: number }
): Promise<ExtractRpcResponse<R>> {
  const maybeOptionsTabId = options?.tabId;

  const targetTabId =
    maybeOptionsTabId !== undefined
      ? maybeOptionsTabId
      : await chrome.tabs
          .query({
            active: true,
            lastFocusedWindow: true,
          })
          .then(([tab]) => {
            const id = tab?.id;
            if (typeof id === "undefined")
              throw new Error("Could not get active tab.");
            return id;
          });
  const response = (await chrome.tabs.sendMessage(
    targetTabId,
    message
  )) as ExtractRpcResponse<R>;

  return response;
}

async function sendRuntimeMessage<R extends RpcRoute>(
  message: ExtractRpcRequest<R>
): Promise<ExtractRpcResponse<R>> {
  const response = (await chrome.runtime.sendMessage(
    message
  )) as ExtractRpcResponse<R>;

  return response;
}

export function createTabsRpcClient<const R extends readonly RpcRoute[]>() {
  return sendTabsMessage<R[number]>;
}

export function createRuntimeRpcClient<const R extends readonly RpcRoute[]>() {
  return sendRuntimeMessage<R[number]>;
}
