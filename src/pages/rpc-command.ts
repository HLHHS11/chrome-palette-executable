import type { RpcCommand } from "./core/command";
import chatgptSuggestions from "./popup/commands/chatgpt";

// NOTE: #1 レガシーなコマンドと同じファイルに書いちゃうと、循環参照になっちゃう
// TODO: #1 REFACTOR だからファイルを分けてるけど、配置は絶対よくない。ディレクトリ構造はゴミ。死ね。
export function listRpcCommands(pageUrl: URL | undefined): RpcCommand[] {
  return [...chatgptSuggestions(pageUrl)];
}
