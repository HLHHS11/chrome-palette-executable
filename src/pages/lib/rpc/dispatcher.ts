import type { RpcResponse, RpcRoute } from "./types";

export function registerRoutes(routes: readonly RpcRoute[]): void {
  // NOTE: このaddListenerにはasync関数を使えないので、Promise.resolve()のメソッドチェーンを利用している。
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const route = routes.find((r) => r.name === message?.name);
    if (!route) return false;

    const { name: _, ...params } = message;
    Promise.resolve()
      .then(() => route.handler(params, { sender }))
      .then((data) => sendResponse(data))
      .catch((e: unknown) =>
        sendResponse({
          ok: false,
          error: `An error occurred during the extension RPC. Details: ${e}`,
        } satisfies RpcResponse)
      );
    // NOTE: return trueすることで、chrome runtimeに同期的に結果を返しつつ非同期でレスポンスすることを表明
    return true;
  });
}
