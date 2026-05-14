import type { RpcCommand } from "./core/command";
import chatgptSuggestions from "./popup/commands/chatgpt";
import { getGeminiRpcCommands } from "./popup/commands/gemini";
import { getGoogleDocsRpcCommands } from "./popup/commands/google-docs";
import { getRovoRpcCommands } from "./popup/commands/rovo";

// NOTE: #1 レガシーなコマンドと同じファイルに書いちゃうと、循環参照になっちゃう
// TODO: #1 REFACTOR だからファイルを分けてるけど、配置は絶対よくない。ディレクトリ構造はゴミ。死ね。
export function listRpcCommands(pageUrl: URL | undefined): RpcCommand[] {
  return [
    ...chatgptSuggestions(pageUrl),
    ...getGeminiRpcCommands(pageUrl),
    ...getGoogleDocsRpcCommands(pageUrl),
    ...getRovoRpcCommands(pageUrl),
  ];
}
