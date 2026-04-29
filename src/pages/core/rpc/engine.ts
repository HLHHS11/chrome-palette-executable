import { RpcHandlerContext, RpcRequest, RpcResponse, RpcRoute } from "./types";

// TODO: #1 HOTFIX たぶん、handlerがcontext依存してたりboolean返さないといけない (それゆえ同期関数になってる) のが問題だと思うんだよな
// - 非同期関数でなくsendResponseという仕組みに依存している
// - contextを渡す必要がある
//   - これはそもそも、handlerがcontextを受け取ってるせいでもあるのだが…
//
// こうした問題が指摘できそうだ。本当にあるべきは、単にroutesとrequestを渡したら、対応するrouteを取ってきて、実行までする。だけ。
// それ以外が技術都合で変になってる。
/**
 * 他の命名候補: RequestRouter, RequestDispatcher, RequestProcessor
 *
 * このhandlerは、Chrome runtimeに依存しすぎている。が、それは本質的に防げないことかもしれない
 */
export class RequestHandler {
  constructor(
    private readonly routes: readonly RpcRoute[],
    private readonly sendResponse: (response?: unknown) => void
  ) {}

  dispatch(request: RpcRequest, context: RpcHandlerContext): boolean {
    const { name: name, ...requestBody } = request;

    const route = this.routes.find((r) => r.name === name);
    if (!route) {
      // TODO: #1 エラーハンドリングをどうするか悩ましい
      throw new Error(`Route not found: ${request.name}`);
    }

    // NOTE: このaddListenerにはasync関数を使えないので、Promise.resolve()のメソッドチェーンを利用している。
    Promise.resolve()
      .then(() => route.handler(requestBody, context))
      .then((rpcResponse) => this.sendResponse(rpcResponse))
      .catch((e: unknown) =>
        this.sendResponse({
          ok: false,
          error: `An error occurred during the extension RPC. Details: ${e}`,
        } satisfies RpcResponse)
      );

    // NOTE: return trueすることで、chrome runtimeに同期的に結果を返しつつ非同期でレスポンスすることを表明
    return true;
  }
}
