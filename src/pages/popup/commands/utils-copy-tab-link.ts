import { createTabsRpcClient } from "@core/rpc";
import type { routes } from "@pages/content/routes";
import type { Command } from "@pages/core/command";

import { inputSignal } from "~/util/signals";

const [, setInputValue] = inputSignal;
const callContentRpc = createTabsRpcClient<typeof routes>();

async function pickActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}

/**
 * ページ URL に Text Fragment の directive (`text=...`) を付与する。
 * `textDirective` が null のときは `rawPageUrl` をそのまま返す。
 *
 * 既に hash 内に `:~:` がある場合は、同セグメントの text directive を置き換える形で上書きする。
 */
function applyTextFragmentDirectiveToPageUrl(
  rawPageUrl: string,
  textDirective: string | null
): string {
  if (!textDirective) return rawPageUrl;

  const [base, hash = ""] = rawPageUrl.split("#");
  const baseHash = hash.split(":~:")[0];
  return baseHash
    ? `${base}#${baseHash}:~:${textDirective}`
    : `${base}#:~:${textDirective}`;
}

function buildMarkdownLinkSnippet(
  documentTitle: string,
  pageUrl: string
): string {
  // マークダウンのリンク構文を壊しうる文字 ([, ]) をエスケープし、\はエスケープ記号として二重化する
  const escapedLinkLabel = documentTitle
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
  return `[${escapedLinkLabel}](${pageUrl})`;
}

/** 貼り付け先が HTML を解釈できる場合に読み込むアンカータグ */
function buildRichTextHtmlFragment(
  documentTitle: string,
  pageUrl: string
): string {
  // href属性値として埋め込むため、HTML属性値として埋め込んで問題になる文字 (&,")をエスケープ
  const escapedPageUrl = pageUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  // アンカーのテキストとして埋め込むため、HTMLとして解釈される文字 (&,<,>) をエスケープ
  const escapedHtmlTextContent = documentTitle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<a href="${escapedPageUrl}">${escapedHtmlTextContent}</a>`;
}

async function runCopyMarkdownTabLink(): Promise<void> {
  try {
    const activeTab = await pickActiveTab();
    const rawPageUrl = activeTab?.url;
    const documentTitle = activeTab?.title ?? "";

    if (!rawPageUrl) throw new Error("現在のタブの URL が取得できません。");

    const maybeTextDirective = await callContentRpc({
      name: "linkCopy.getSelectionTextDirective",
    }).then((res) => {
      if (!res.ok) return null;
      if (!("data" in res)) return null;
      return res.data.textDirective;
    });
    const pageUrl = applyTextFragmentDirectiveToPageUrl(
      rawPageUrl,
      maybeTextDirective
    );
    const markdownSnippet = buildMarkdownLinkSnippet(documentTitle, pageUrl);
    await navigator.clipboard.writeText(markdownSnippet);
    window.close();
  } catch (err) {
    console.error(err);
    setInputValue("エラーが発生しました。");
  }
}

async function runCopyRichTextTabLink(): Promise<void> {
  try {
    const activeTab = await pickActiveTab();
    const rawPageUrl = activeTab?.url;
    const documentTitle = activeTab?.title ?? "";

    if (!rawPageUrl) throw new Error("現在のタブの URL が取得できません。");

    const maybeTextDirective = await callContentRpc({
      name: "linkCopy.getSelectionTextDirective",
    }).then((res) => {
      if (!res.ok) return null;
      if (!("data" in res)) return null;
      return res.data.textDirective;
    });
    const pageUrl = applyTextFragmentDirectiveToPageUrl(
      rawPageUrl,
      maybeTextDirective
    );
    const htmlFragment = buildRichTextHtmlFragment(documentTitle, pageUrl);
    const plainTextFallback = `${documentTitle} ${pageUrl}`;
    const htmlBlob = new Blob([htmlFragment], { type: "text/html" });
    const plainBlob = new Blob([plainTextFallback], { type: "text/plain" });

    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": plainBlob,
      }),
    ]);
    window.close();
  } catch (err) {
    console.error(err);
    setInputValue("エラーが発生しました。");
  }
}

export default function getUtilsCopyTabLinkCommands(): Command[] {
  return [
    {
      title: "Utils: マークダウン形式で現在のタブのリンクをコピー",
      subtitle: "Utils: Copy Active Tab Link as Markdown",
      handler: runCopyMarkdownTabLink,
    },
    {
      title: "Utils: リッチテキストで現在のタブのリンクをコピー",
      subtitle: "Utils: Copy Active Tab Link as Rich Text",
      handler: runCopyRichTextTabLink,
    },
  ];
}
