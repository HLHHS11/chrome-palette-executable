// TODO: #1 Messageって名前よりRpcRequestって名前のほうがいいかも。そしたらRequestBodyって言葉が使える
type RpcMessageBase = { name: string };

// TODO: #1 abstract rpc messageとかにしてもいいかも？あるいはdefault rpc messageとか？
export type RpcMessage = RpcMessageBase & object;

export type VoidResponseBody = Record<string, never>;

export type RpcResponse<ResponseBody extends object = VoidResponseBody> =
  | {
      ok: true;
      data: ResponseBody;
    }
  | {
      ok: false;
      error: string;
    };

export type RpcRoute<
  Message extends RpcMessageBase = RpcMessage,
  ResponseBody extends object = object,
> = {
  message: Message;
  // TODO: #1 ここの返り値どうするか怪しい。Promiseと同期の管理
  handler: (
    params: Omit<Message, "name">
  ) => RpcResponse<ResponseBody> | Promise<RpcResponse<ResponseBody>>;
};

export type ExtractMessageType<RouteT extends RpcRoute> = RouteT["message"];

export type ExtractResponseType<RouteT extends RpcRoute> =
  RouteT["handler"] extends (
    params: Omit<ExtractMessageType<RouteT>, "name">
  ) => infer Return
    ? Awaited<Return>
    : never;
