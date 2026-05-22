import type { RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

export function getGoogleDocsRpcCommands(
  pageUrl: URL | undefined
): RpcCommand<ContentRpcMessage>[] {
  // docs.google.com 配下には Sheets (/spreadsheets) や Slides (/presentation) も
  // 含まれるため、Document に限定するため pathname で絞り込む。
  const isGoogleDocsPage =
    pageUrl?.hostname === "docs.google.com" &&
    pageUrl.pathname.startsWith("/document/");
  if (!isGoogleDocsPage) return [];

  return [
    {
      title: "Google Docs: マークダウン形式でエクスポート",
      subtitle: "Google Docs: Export as Markdown",
      message: { name: "googleDocs.exportAsMarkdown" },
    },
  ];
}
