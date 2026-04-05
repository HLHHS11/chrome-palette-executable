import type {
  ExtractMessageType,
  ExtractResponseType,
  RpcRoute,
} from "./types";

async function sendMessage<R extends RpcRoute>(
  message: ExtractMessageType<R>
): Promise<ExtractResponseType<R>> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab.id === undefined) throw new Error("Could not get active tab.");

  const response = (await chrome.tabs.sendMessage(
    tab.id,
    message
  )) as ExtractResponseType<R>;

  return response;
}

export function createRpcClient<const R extends readonly RpcRoute[]>() {
  return sendMessage<R[number]>;
}
