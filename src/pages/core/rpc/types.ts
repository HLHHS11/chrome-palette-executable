// Record<string, never> は空オブジェクト {} を意味する
export type RpcVoidResponseBody = Record<string, never>;

export type RpcResponse<RpcResponseBody extends object = object> =
  | {
      ok: true;
      data: RpcResponseBody;
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

// RPCリクエストの送り主の詳細情報
export type RpcHandlerContext =
  | {
      /** RPCリクエストの送り主の詳細情報 */
      sender: chrome.runtime.MessageSender;
      source: "runtime";
    }
  | {
      sender?: never;
      source: "local";
    };

// TODO: #1 Handlerのレスポンスの方に型引数がないのおかしい。
// NOTE: Handlerのデフォルト型引数にanyを使っている理由:
// 異なるパラメータ型を持つhandlerを1つのRpcRoute[]に収めるには、関数引数の反変性を回避する必要がある。
// unknown等では具体的なパラメータ型を持つhandlerが代入不可になるため、anyで型チェックを緩和している。
// 各ルートの具体的なhandlerシグネチャはas constで推論され、消費側（client等）で型安全に扱われる。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcHandler<RpcRequestBody extends object = any> = (
  params: RpcRequestBody,
  context: RpcHandlerContext
) => RpcResponse | Promise<RpcResponse>;

export type RpcRoute<
  Name extends string = string,
  Handler extends RpcHandler = RpcHandler,
> = {
  name: Name;
  handler: Handler;
};

export type RpcRequest<
  Name extends string = string,
  RpcRequestBody extends object = object,
> = { name: Name } & RpcRequestBody;

type ExtractRpcRequestBody<RouteT extends RpcRoute> = Parameters<
  RouteT["handler"]
>[0];

export type ExtractRpcRequest<RouteT extends RpcRoute> = RouteT extends RpcRoute
  ? ExtractRpcRequestBody<RouteT> extends undefined
    ? RpcRequest<RouteT["name"], object>
    : RpcRequest<RouteT["name"], ExtractRpcRequestBody<RouteT>>
  : never;

export type ExtractRpcResponse<RouteT extends RpcRoute> = Awaited<
  ReturnType<RouteT["handler"]>
>;

/**
 * ルート配列 `R` で受け付ける `name` リテラルの union を取り出すユーティリティ。
 *
 * RPC クライアントの呼び出し時にユーザが書いた `name` が、ここで定義したリテラル
 * union のどれかであることを TypeScript に強制するために使う。
 */
export type RouteName<R extends readonly RpcRoute[]> = R[number]["name"];

/**
 * ルート配列 `R` から、`name` が `N` に一致するルートを取り出す。
 */
export type ExtractRouteByName<
  R extends readonly RpcRoute[],
  N extends string,
> = Extract<R[number], { name: N }>;
