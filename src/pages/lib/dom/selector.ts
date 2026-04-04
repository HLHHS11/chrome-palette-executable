export async function waitForSelector(
  selector: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<Element> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const intervalMs = options?.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;

  return await new Promise((resolve, reject) => {
    const tick = () => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`waitForSelector timeout: ${selector}`));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export type PollResult<T> =
  | { status: "found"; value: T }
  | { status: "pending"; value: null }
  | { status: "notFound"; value: null }
  | { status: "timeout"; value: null };

export async function waitUntilValue<T>(
  poll: () => PollResult<T>,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<PollResult<T>> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const intervalMs = options?.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  for (;;) {
    const result = poll();
    switch (result.status) {
      case "found":
      case "notFound":
        return result;
      case "pending":
        if (Date.now() >= deadline) {
          return { status: "timeout", value: null };
        }
        await sleep(intervalMs);
    }
  }
}

// NOTE: この関数の置き場が本ファイルで良いのかちょっと微妙な所
/**
 * pointerdown, pointerup, clickイベントを組み合わせて、マウスのクリックを再現します。
 * フレームワーク・UIライブラリによっては `HTMLElement.click()` が反応しないケースがあるためです。
 */
export function simulateMouseClick(el: Element): void {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    // NOTE: `allowNoSide` みたいなoptional引数を追加して、エラー吐かないようにしても良いかもしれない
    throw new Error(`Element has no size. (element: ${el})`);
  }
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const base: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: cx,
    clientY: cy,
    // pointerIdは一連のpointerdown/upイベントを一つの連続した操作として扱うために用いられる
    pointerId: Math.floor(Math.random() * 1000) + 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: 1,
  };

  el.dispatchEvent(new PointerEvent("pointerdown", base));
  el.dispatchEvent(
    new PointerEvent("pointerup", {
      ...base,
      buttons: 0,
    })
  );
  el.dispatchEvent(new MouseEvent("click", base));
}
