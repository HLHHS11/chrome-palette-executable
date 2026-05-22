import {
  type UserKeydownFollowupOptions,
  attachUserKeydownFollowup,
} from "./user-keydown-followup";

export type StartUserKeydownOverlayOptions = Pick<
  UserKeydownFollowupOptions,
  "shouldExecute" | "execute"
> & {
  /** バナーに表示する文言 */
  message: string;
  /**
   * オーバーレイ・バナー要素の id 接頭辞。`-overlay` / `-popup` を付与する。
   * 省略時は呼び出しごとにユニークな接頭辞を生成する。
   */
  modeDomIdPrefix?: string;
};

/**
 * 半透明オーバーレイと上部バナーで簡易確認を出し、{@link attachUserKeydownFollowup} で
 * 次のキー入力まで待つ。キャンセル時も UI を確実に外す teardown を内包する。
 */
export function startUserKeydownOverlay(
  options: StartUserKeydownOverlayOptions
): () => void {
  const prefix =
    options.modeDomIdPrefix ??
    `chrome-palette-mode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const overlayId = `${prefix}-overlay`;
  const popupId = `${prefix}-popup`;

  const removeModeUi = (): void => {
    document.getElementById(overlayId)?.remove();
    document.getElementById(popupId)?.remove();
  };

  removeModeUi();

  const overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0, 0, 0, 0.35)";
  overlay.style.backdropFilter = "blur(1px)";
  overlay.style.zIndex = "2147483646";
  overlay.style.pointerEvents = "none";

  const popup = document.createElement("div");
  popup.id = popupId;
  popup.setAttribute("role", "status");
  popup.setAttribute("aria-live", "polite");
  popup.style.position = "fixed";
  popup.style.left = "50%";
  popup.style.top = "24px";
  popup.style.transform = "translateX(-50%)";
  popup.style.padding = "12px 16px";
  popup.style.borderRadius = "10px";
  popup.style.background = "rgba(24, 24, 24, 0.92)";
  popup.style.color = "#fff";
  popup.style.fontSize = "14px";
  popup.style.fontWeight = "600";
  popup.style.letterSpacing = "0.02em";
  popup.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.4)";
  popup.style.zIndex = "2147483647";
  popup.style.pointerEvents = "none";
  popup.textContent = options.message;

  document.documentElement.append(overlay, popup);

  const detachKeydown = attachUserKeydownFollowup({
    shouldExecute: options.shouldExecute,
    execute: options.execute,
    onConsumed: removeModeUi,
  });

  return () => {
    detachKeydown();
    removeModeUi();
  };
}
