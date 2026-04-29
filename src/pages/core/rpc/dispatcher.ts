import { RequestHandler } from "./engine";
import { RpcRoute } from "./types";

// TODO: #1 HOTFIX 現行のRequestHandlerはよくない。のちのち修正されるべきであり、その際ここのregisterRoutesの責務はもう少し増える。あるいは増えたことによって更に分割される。
export function registerRoutes(routes: readonly RpcRoute[]): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = new RequestHandler(routes, sendResponse);
    return handler.dispatch(message, { sender });
  });
}
