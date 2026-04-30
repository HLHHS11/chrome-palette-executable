import { RpcRouter } from "./router";
import { ExtractRpcRequest, ExtractRpcResponse, RpcRoute } from "./types";

export function createLpcClient<const RoutesT extends readonly RpcRoute[]>(
  routes: RoutesT
) {
  type ResponseT = ExtractRpcResponse<RoutesT[number]>;

  return async function sendLpcMessage(
    message: ExtractRpcRequest<RoutesT[number]>
  ): Promise<ResponseT> {
    const handler = new RpcRouter(routes);

    const response = await handler.handle(message, { source: "local" });

    return response;
  };
}
