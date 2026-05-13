import { RpcResponse } from "@core/rpc";
import {
  GenerateFragmentStatus,
  generateFragment,
} from "text-fragments-polyfill/dist/fragment-generation-utils.js";

type GetSelectionTextDirectiveResponseBody = {
  /**
   * Text Fragment 仕様の text directive 文字列 (例: `text=foo,-bar`)。
   * 選択範囲が無い、もしくは一意な fragment が生成できなかった場合は null。
   */
  textDirective: string | null;
};

/**
 * 文字列を Unicode NFC (合成形) に正規化したうえで URL エンコードする。
 *
 * > 例: 「ブ」が `フ + 結合用濁点` (NFD) になっているものを `ブ` (NFC) に揃える。
 *
 * NFCへの変換は {@link getSelectionTextDirective} 内で、選択範囲の取得結果がNFDで返された場合に、
 * Text Fragmentの文字列照合が失敗するのを防ぐために用いる。
 */
function toNfcUriComponent(s: string) {
  return encodeURIComponent(s.normalize("NFC"));
}

export function getSelectionTextDirective(): RpcResponse<GetSelectionTextDirectiveResponseBody> {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return { ok: true, data: { textDirective: null } };
  }

  const result = generateFragment(selection);
  if (result.status !== GenerateFragmentStatus.SUCCESS || !result.fragment) {
    // INVALID_SELECTION / AMBIGUOUS / TIMEOUT / EXECUTION_FAILED いずれの場合も
    // 「fragment 付きにできなかった」として null を返し、呼び出し側で生URLにフォールバックさせる。
    return { ok: true, data: { textDirective: null } };
  }

  // Text Fragment 構文: text=[prefix-,]textStart[,textEnd][,-suffix]に従った文字列を構築する
  const textDirective = (() => {
    const { textStart, textEnd, prefix, suffix } = result.fragment;

    const parts: string[] = [];
    // NOTE: 各パーツは toNfcUriComponent で NFC 化してからエンコードする。
    // macOS の Selection は日本語等を NFD (分解形) で返すことがある一方、ページ本体の
    // HTML は NFC (合成形) で書かれているのがふつう。NFD のまま URL に載せると Chrome の
    // テキスト照合が「フ + 結合濁点」と「ブ」を別物として扱い、ハイライトのテキスト照合に失敗する。
    if (prefix) parts.push(`${toNfcUriComponent(prefix)}-`);
    parts.push(toNfcUriComponent(textStart));
    if (textEnd) parts.push(toNfcUriComponent(textEnd));
    if (suffix) parts.push(`-${toNfcUriComponent(suffix)}`);
    return `text=${parts.join(",")}`;
  })();

  return { ok: true, data: { textDirective } };
}
