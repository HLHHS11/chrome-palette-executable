import type { RpcResponse } from "@core/rpc";

/**
 * 本文取得時の最大文字数。これを超えるページは打ち切る。
 *
 * 大きすぎるページの `document.body.innerText` 取得とその後の文字列処理は
 * popup 表示の体感を悪化させる。200KB 程度を上限とする。
 */
const MAX_TEXT_LENGTH = 200_000;

export type GetPageTextResponseBody = {
  /** 本文 (innerText)。空白は連続を1つに畳んである。MAX_TEXT_LENGTH で打ち切る。 */
  text: string;
  /** `<html lang>` 等から取得した言語ヒント。なければ空文字。 */
  lang: string;
};

/**
 * このタブの本文テキストスナップショットを返す。
 *
 * クロスタブ全文検索のために、popup から各タブへ並列にこの RPC を送る。
 * 失敗するタブ (`chrome://`、Web Store、discarded など) は popup 側で
 * URL/title フォールバック扱いになるので、ここでは握りつぶさず通常通り返す。
 */
export function getPageText(): RpcResponse<GetPageTextResponseBody> {
  const hasBody = !!document.body;
  const raw = document.body?.innerText ?? "";
  const normalized = raw
    .replace(/[\r\n\f]+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
  const lang = document.documentElement.lang || "";

  // フル本文も別行で吐く (DevTools でコピー → 検証ワードを目視 grep できるように)。
  // 構造化ログの方は文字数や preview のサマリだけ。
  console.log("[tabsearch][content] getPageText", {
    url: location.href,
    hasBody,
    rawLength: raw.length,
    normalizedLength: normalized.length,
    readyState: document.readyState,
    lang,
  });
  console.log(
    "[tabsearch][content] FULL TEXT BEGIN url=" +
      location.href +
      "\n" +
      normalized +
      "\n[tabsearch][content] FULL TEXT END"
  );
  return { ok: true, data: { text: normalized, lang } };
}
