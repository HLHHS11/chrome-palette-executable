import { RpcRouter } from "./router";
import type {
  ExtractRouteByName,
  ExtractRpcRequest,
  ExtractRpcResponse,
  RouteName,
  RpcRoute,
} from "./types";

/** 同一実行コンテキスト内のルータに直接ディスパッチする LPC クライアント。型付けは {@link createTabsRpcClient} と同じ。 */
export function createLpcClient<const R extends readonly RpcRoute[]>(
  routes: R
) {
  const router = new RpcRouter(routes);
  return async function call<N extends RouteName<R>>(
    message: { name: N } & ExtractRpcRequest<ExtractRouteByName<R, N>>
  ): Promise<ExtractRpcResponse<ExtractRouteByName<R, N>>> {
    return (await router.handle(message, {
      source: "local",
    })) as ExtractRpcResponse<ExtractRouteByName<R, N>>;
  };
}
