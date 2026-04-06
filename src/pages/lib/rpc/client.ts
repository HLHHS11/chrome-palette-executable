import type { ExtractRpcRequest, ExtractRpcResponse, RpcRoute } from "./types";

async function sendMessage<R extends RpcRoute>(
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

export function createRpcClient<const R extends readonly RpcRoute[]>() {
  return sendMessage<R[number]>;
}
