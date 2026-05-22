import type {
  ExtractRouteByName,
  ExtractRpcRequest,
  ExtractRpcResponse,
  RouteName,
  RpcRoute,
} from "./types";

async function pickActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const id = tab?.id;
  if (id === undefined) throw new Error("Could not get active tab.");
  return id;
}

/**
 * タブ宛 RPC クライアントを生成する。
 * 呼び出し時の `name` リテラルからルートを 1 本に narrow し、そのルートの
 * リクエスト / レスポンス型だけを要求 / 返却する。
 *
 * `{ name: N } & ...` の交差は N をリテラル位置に出して推論を確実にするための型の細工。
 * これがないと N が RouteName<R> 全体に滑って narrow が効かなくなる。
 */
export function createTabsRpcClient<const R extends readonly RpcRoute[]>() {
  return async function call<N extends RouteName<R>>(
    message: { name: N } & ExtractRpcRequest<ExtractRouteByName<R, N>>,
    options?: { tabId?: number }
  ): Promise<ExtractRpcResponse<ExtractRouteByName<R, N>>> {
    const targetTabId = options?.tabId ?? (await pickActiveTabId());
    return (await chrome.tabs.sendMessage(
      targetTabId,
      message
    )) as ExtractRpcResponse<ExtractRouteByName<R, N>>;
  };
}

/** runtime 宛 RPC クライアントを生成する。型付けの考え方は {@link createTabsRpcClient} と同じ。 */
export function createRuntimeRpcClient<const R extends readonly RpcRoute[]>() {
  return async function call<N extends RouteName<R>>(
    message: { name: N } & ExtractRpcRequest<ExtractRouteByName<R, N>>
  ): Promise<ExtractRpcResponse<ExtractRouteByName<R, N>>> {
    return (await chrome.runtime.sendMessage(message)) as ExtractRpcResponse<
      ExtractRouteByName<R, N>
    >;
  };
}
