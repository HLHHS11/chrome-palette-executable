import { RpcRouter } from "./router";
import { RpcResponse, RpcRoute } from "./types";

export function registerRoutes(routes: readonly RpcRoute[]): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const router = new RpcRouter(routes);

    router.handle(message, { sender, source: "runtime" }).then((response) => {
      if (!response) {
        // TODO: #1 REFACTOR responseがないってだけで、unknown routeであるとは限らないよな…
        sendResponse({
          ok: false,
          error: "Unknown RPC route.",
        } satisfies RpcResponse);
        return;
      }
      sendResponse(response);
      return;
    });

    // NOTE: 非同期でレスポンスを送信するには、 true を返す必要がある。
    // > ※Chrome 146以降ではPromiseを直接返すのに対応しているのだが、2026/05/01現在、まだ146は新しすぎるバージョンであるため、従来の方法に従う。
    // see https://developer.chrome.com/docs/extensions/develop/concepts/messaging?hl=ja#:~:text=%E9%9D%9E%E5%90%8C%E6%9C%9F%E3%81%A7%E3%83%AC%E3%82%B9%E3%83%9D%E3%83%B3%E3%82%B9%E3%82%92%E9%80%81%E4%BF%A1%E3%81%99%E3%82%8B%E3%81%AB%E3%81%AF%E3%80%81true%20%E3%82%92%E8%BF%94%E3%81%99%E3%81%8B%E3%80%81Promise%20%E3%82%92%E8%BF%94%E3%81%99%E3%81%8B%E3%81%AE%202%20%E3%81%A4%E3%81%AE%E6%96%B9%E6%B3%95%E3%81%8C%E3%81%82%E3%82%8A%E3%81%BE%E3%81%99%E3%80%82
    return true;
  });
}
