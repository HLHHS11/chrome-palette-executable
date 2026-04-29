import { RequestHandler } from "./engine";
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

// TODO: #1 HOTFIX 置き場がここで合ってるのかは微妙！！
export function createLpcClient<const R extends readonly RpcRoute[]>(
  routes: readonly RpcRoute[]
) {
  type Response = ExtractRpcResponse<R[number]>;

  return async function sendLpcMessage<const R extends readonly RpcRoute[]>(
    message: ExtractRpcRequest<R[number]>
  ): Promise<Response> {
    let resolvedResponse: Response;
    /** {@link RequestHandler} に渡すコールバック。設計上直接値を返せないので、ローカルの {@link resolvedResponse} に値をセットする */
    const sendResponse = (response: unknown) => {
      resolvedResponse = response as Response;
    };

    const handler = new RequestHandler(routes, sendResponse);
    // TODO: #1 HOTFIX ここでcontextを要求されるのが問題
    void handler.dispatch(message, { sender: {} });

    // @ts-expect-error resolvedResponseが割り当てられる前に使用されていると怒られるが、handler.dispatch()内部でsendResponse経由で必ず呼ばれるので問題ない
    return resolvedResponse;
  };
}
