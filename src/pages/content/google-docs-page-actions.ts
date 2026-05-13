import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClickSequence,
  waitUntilValue,
} from "../lib/dom/selector";

// NOTE: Google Docs は Closure UI 製で、メニュー操作には以下の癖がある:
// - 全メニューの DOM が最初から構築されていて、display の切替で開閉される。
//   そのため「セレクタが見つかるか」ではなく「可視メニュー内に項目が含まれるか」で判定する。
// - 項目の aria-label は内側の <span class="goog-menuitem-label"> に付与されているため、
//   closest('[role="menuitem"]') で外側の menuitem 本体に持ち上げる必要がある。
// - クリック判定は pointer 系ではなく mousedown / mouseup 系のため、
//   click + pointer のみ発火する simulateMouseClick ではメニューが反応しない。
//   hover/down/up/click を順に発火する simulateMouseClickSequence を使う。

function isVisibleGoogMenu(menu: Element): boolean {
  const style = window.getComputedStyle(menu);
  return style.display !== "none" && style.visibility !== "hidden";
}

export async function exportGoogleDocsAsMarkdown(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  const fileMenuButton = document.querySelector<HTMLElement>("#docs-file-menu");
  if (!fileMenuButton) {
    return { ok: false, error: "ファイルメニューボタンが見つかりません。" };
  }
  simulateMouseClickSequence(fileMenuButton);

  // ファイルメニュー (可視 goog-menu で「ダウンロード d」項目を含むもの) が開くのを待つ。
  // NOTE: UI上の文言が変更されたら、ここも修正が必要になる！
  const fileMenuResult = await waitUntilValue<HTMLElement>(
    () => {
      const menus = document.querySelectorAll<HTMLElement>(".goog-menu");
      const matched = [...menus].find(
        (m) =>
          isVisibleGoogMenu(m) &&
          m.querySelector('[aria-label="ダウンロード d"]') !== null
      );
      return matched
        ? { status: "found", value: matched }
        : { status: "pending", value: null };
    },
    { timeoutMs: 3000 }
  );
  if (fileMenuResult.status !== "found") {
    return { ok: false, error: "ファイルメニューが開きませんでした。" };
  }
  const fileMenu = fileMenuResult.value;

  const downloadItem = fileMenu
    .querySelector<HTMLElement>('[aria-label="ダウンロード d"]')
    ?.closest<HTMLElement>('[role="menuitem"]');
  if (!downloadItem) {
    return { ok: false, error: "ダウンロードメニュー項目が見つかりません。" };
  }
  simulateMouseClickSequence(downloadItem);

  // ダウンロードのサブメニュー (「マークダウン（.md） m」項目を含む可視 goog-menu) を待つ。
  const subMenuResult = await waitUntilValue<HTMLElement>(
    () => {
      const menus = document.querySelectorAll<HTMLElement>(".goog-menu");
      const matched = [...menus].find(
        (m) =>
          isVisibleGoogMenu(m) &&
          m.querySelector('[aria-label="マークダウン（.md） m"]') !== null
      );
      return matched
        ? { status: "found", value: matched }
        : { status: "pending", value: null };
    },
    { timeoutMs: 3000 }
  );
  if (subMenuResult.status !== "found") {
    return {
      ok: false,
      error: "ダウンロードのサブメニューが開きませんでした。",
    };
  }
  const subMenu = subMenuResult.value;

  const markdownItem = subMenu
    .querySelector<HTMLElement>('[aria-label="マークダウン（.md） m"]')
    ?.closest<HTMLElement>('[role="menuitem"]');
  if (!markdownItem) {
    return { ok: false, error: "マークダウンメニュー項目が見つかりません。" };
  }
  simulateMouseClickSequence(markdownItem);

  return { ok: true, data: {} };
}
