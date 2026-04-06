export type VoidResponseBody = Record<string, never>;

export type RpcResponse<ResponseBody extends object = object> =
  | {
      ok: true;
      data: ResponseBody;
    }
  | {
      // 何も操作をしなかった場合などに用いる
      ok: true;
      info: string;
    }
  | {
      ok: false;
      error: string;
    };

// TODO: #1 Handlerのレスポンスの方に型引数がないのおかしい。
// NOTE: Handlerのデフォルト型引数にanyを使っている理由:
// 異なるパラメータ型を持つhandlerを1つのRpcRoute[]に収めるには、関数引数の反変性を回避する必要がある。
// unknown等では具体的なパラメータ型を持つhandlerが代入不可になるため、anyで型チェックを緩和している。
// 各ルートの具体的なhandlerシグネチャはas constで推論され、消費側（client等）で型安全に扱われる。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcHandler<Params extends object = any> = (
  params: Params
) => RpcResponse | Promise<RpcResponse>;

export type RpcRoute<
  Name extends string = string,
  Handler extends RpcHandler = RpcHandler,
> = {
  name: Name;
  handler: Handler;
};

export type ExtractRpcParams<RouteT extends RpcRoute> = Parameters<
  RouteT["handler"]
>[0];

export type ExtractRpcResponse<RouteT extends RpcRoute> = Awaited<
  ReturnType<RouteT["handler"]>
>;

export type RpcClientMessage<R extends RpcRoute> = R extends RpcRoute
  ? ExtractRpcParams<R> extends undefined
    ? { name: R["name"] }
    : { name: R["name"] } & ExtractRpcParams<R>
  : never;
