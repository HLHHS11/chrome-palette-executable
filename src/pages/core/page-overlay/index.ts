/**
 * ページ上に浮かせる箱の、位置まわりの共通処理。
 *
 * 付箋とタイマーはどちらも「ページに重ねて置き、掴んで動かせて、
 * ウィンドウが狭まっても画面内に留まる」箱であり、その部分だけを共有する。
 * 中身の組み立てや保存の仕方は機能ごとに異なるため、ここには持ち込まない。
 */

export interface OverlayPosition {
  x: number;
  y: number;
}

/**
 * 保存された位置を、そのウィンドウで実際に見える位置へ寄せる。
 *
 * 丸めるのは表示位置だけで、保存値は呼び出し側で触らないこと。ウィンドウが
 * 元の幅に戻れば元の位置に戻る。箱の方がウィンドウより大きければ 0 に寄せ、
 * 少なくとも掴める状態は保つ。
 */
export function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number
): OverlayPosition {
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

/**
 * 掴んでの移動。移動は箱の必須要件なので、ビューポート外に出て掴めなくなる
 * ことがないよう位置を丸める。ボタンの上から始まったドラッグは無視する。
 */
export function bindDrag(
  handleEl: HTMLElement,
  panel: HTMLElement,
  readOrigin: () => OverlayPosition | null,
  onMove: (x: number, y: number) => void
): void {
  handleEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "BUTTON") return;
    const origin = readOrigin();
    if (!origin) return;

    event.preventDefault();
    handleEl.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = origin.x;
    const originY = origin.y;

    const onPointerMove = (move: PointerEvent): void => {
      const { x, y } = clampToViewport(
        originX + move.clientX - startX,
        originY + move.clientY - startY,
        panel.offsetWidth,
        panel.offsetHeight
      );
      onMove(Math.round(x), Math.round(y));
    };
    const onPointerUp = (): void => {
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);
      handleEl.removeEventListener("pointercancel", onPointerUp);
    };
    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
    handleEl.addEventListener("pointercancel", onPointerUp);
  });
}
