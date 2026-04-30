import type { ExtractRpcRequest, ExtractRpcResponse, RpcRoute } from "./types";

async function sendTabsMessage<R extends RpcRoute>(
  message: ExtractRpcRequest<R>
): Promise<ExtractRpcResponse<R>> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab.id === undefined) throw new Error("Could not get active tab.");

  const response = (await chrome.tabs.sendMessage(
    tab.id,
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
