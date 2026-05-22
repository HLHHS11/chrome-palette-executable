import type { RpcCommand } from "./types";

type RpcResult = {
  ok: boolean;
  error?: string;
};

type PopupRpcRunnerDeps<RpcRequest extends object> = {
  callTabsRpc: (message: RpcRequest) => Promise<RpcResult>;
  setInputValue: (value: string) => void;
};

// TODO: #1 REFACTOR 完全にAI生成。別にひどい実装ってわけでもないが、ファイル命名とか好みじゃないわ。
export async function runRpcCommandInPopup<RpcRequest extends object>(
  command: RpcCommand<RpcRequest>,
  deps: PopupRpcRunnerDeps<RpcRequest>
): Promise<void> {
  const res = await deps.callTabsRpc(command.message);
  if (!res.ok) {
    deps.setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }
  window.close();
}
