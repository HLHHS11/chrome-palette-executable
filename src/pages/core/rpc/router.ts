import type {
  ExtractRpcRequest,
  ExtractRpcResponse,
  RpcHandlerContext,
  RpcRequest,
  RpcResponse,
  RpcRoute,
} from "./types";

export class RpcRouter<const RoutesT extends readonly RpcRoute[]> {
  constructor(private readonly routes: RoutesT) {}

  async handle<RouteT extends RoutesT[number]>(
    request: ExtractRpcRequest<RouteT>,
    context: RpcHandlerContext
  ): Promise<ExtractRpcResponse<RouteT>>;
  async handle(
    request: RpcRequest,
    context: RpcHandlerContext
  ): Promise<RpcResponse> {
    const { name: name, ...requestBody } = request;

    const route = this.routes.find((r) => r.name === name);
    if (!route) {
      return {
        ok: false,
        error: `Route not found: ${name}`,
      };
    }

    try {
      return await route.handler(requestBody, context);
    } catch (e: unknown) {
      return {
        ok: false,
        error: `An error occurred during the extension RPC. Details: ${e}`,
      };
    }
  }
}
