import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClickSequence,
  waitForSelector,
  waitUntilValue,
} from "../lib/dom/selector";

type SelectClaudeModelParams = {
  model: "sonnet-4.6" | "opus-4.7";
  // アダプティブ思考スイッチの状態を表す。 thinking=ON, instant=OFF。
  mode: "instant" | "thinking";
};

// NOTE: Claude UI 上のモデル表示名 (英語表記) が変更されたら、ここも修正が必要になる！
const CLAUDE_MODEL_LABEL: Record<SelectClaudeModelParams["model"], string> = {
  "sonnet-4.6": "Sonnet 4.6",
  "opus-4.7": "Opus 4.7",
};

// NOTE: UI 文言が変更されたら、ここも修正が必要になる！日本語 UI 前提。
const ADAPTIVE_THINKING_SWITCH_LABEL = "アダプティブ思考";
const OTHER_MODELS_MENU_LABEL = "他のモデル";

const TRIGGER_SELECTOR = 'button[data-testid="model-selector-dropdown"]';

type OpenMenuRefs = {
  activeItem: HTMLElement;
  switchInput: HTMLInputElement;
};

async function openModelMenu(
  trigger: HTMLElement
): Promise<OpenMenuRefs | null> {
  // ブラウザコンソールで .click() がメニューを開けることが確認済。
  // simulateMouseClick 系では Base UI 側がメニューを開かないため、素の click() を使う。
  trigger.click();
  const result = await waitUntilValue<OpenMenuRefs>(() => {
    const activeItem = document.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]'
    );
    const switchInput = document.querySelector<HTMLInputElement>(
      `input[role="switch"][aria-label="${ADAPTIVE_THINKING_SWITCH_LABEL}"]`
    );
    if (!activeItem || !switchInput) {
      return { status: "pending", value: null };
    }
    return { status: "found", value: { activeItem, switchInput } };
  });
  return result.status === "found" ? result.value : null;
}

async function waitForMenuClosed(): Promise<boolean> {
  const result = await waitUntilValue<true>(() => {
    const stillOpen = document.querySelector(
      '[role="menuitemradio"][aria-checked="true"]'
    );
    return stillOpen
      ? { status: "pending", value: null }
      : { status: "found", value: true };
  });
  return result.status === "found";
}

function dispatchEscape(): void {
  const target =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : document.body;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );
}

function toggleAdaptiveThinking(
  switchInput: HTMLInputElement
): RpcResponse<RpcVoidResponseBody> | null {
  const switchTarget = switchInput.closest("label");
  if (!(switchTarget instanceof HTMLElement)) {
    return {
      ok: false,
      error: "アダプティブ思考スイッチの操作対象が見つかりません。",
    };
  }
  simulateMouseClickSequence(switchTarget);
  return null;
}

export async function selectClaudeModel(
  params: SelectClaudeModelParams
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const trigger = await waitForSelector(TRIGGER_SELECTOR, {
    timeoutMs: 3000,
  }).catch(() => null);
  if (!(trigger instanceof HTMLElement)) {
    return { ok: false, error: "モデル選択ドロップダウンが見つかりません。" };
  }

  const initial = await openModelMenu(trigger);
  if (!initial) {
    return { ok: false, error: "モデル選択メニューが開きませんでした。" };
  }

  const targetLabel = CLAUDE_MODEL_LABEL[params.model];
  const wantThinking = params.mode === "thinking";
  const initialActiveLabel = initial.activeItem.textContent?.trim() ?? "";
  const needsModelChange = !initialActiveLabel.includes(targetLabel);

  // -----------------------------------------------------------------------
  // 本来やりたかったシンプルな実装:
  //   1 回ドロップダウンを開く → その場で switch を望む状態に合わせる →
  //   サブメニューから目的モデルを選ぶ → メニューを閉じる
  // この順序で 1 ラウンドで両方を完結させたかった。
  //
  // ところが実機で観測した挙動:
  //   モデルをまたぐ変更 (例: Opus instant → Sonnet thinking) で、
  //     - switch の label クリック自体は React 側にちゃんと届いていて、
  //       約 +500ms 後にはトリガーの aria-label が「Sonnet 4.6 アダプティブ」に
  //       一度切り替わる (= thinking ON が見える)
  //     - しかしその後、サブメニューでのモデル選択処理が走り切ると、Claude 側で
  //       「新しいモデルのデフォルト thinking 状態」に内部で書き直してしまう
  //     - 結果、 +1500ms 後には aria-label が「Sonnet 4.6」(thinking OFF) に戻る
  //   ユーザー体感としては「一瞬正しく見えるが、直後に thinking だけ外れる」になり、
  //   モデルとアダプティブ思考の両方を変えたいケースで片方しか反映されない。
  //
  // つまり 「switch のトグル」 と 「モデル変更」 は独立操作ではなく、
  // モデル変更の方が switch を上書きする副作用を持っている。
  // 同じメニュー内で順番を入れ替えても、モデル変更が後に走る限り上書きされる。
  //
  // 解決方針: モデル変更がある場合に限り、操作を二段階に分ける。
  //   (a) 先にサブメニューでモデルだけ変える (この回では switch を触らない)
  //   (b) メニューが閉じ、モデル切替に伴う thinking のリセットも含めて
  //       内部状態が確定するのを待つ
  //   (c) ドロップダウンを再オープンし、確定した新モデル上での switch の現状を
  //       読んでから、必要なら switch をトグルする
  // (c) の switch トグルはモデル変更より後に走るので、もう上書きされない。
  // モデル変更がないケースでは元のシンプルな 1 ラウンドフローで済むので分岐させる。
  // -----------------------------------------------------------------------
  if (needsModelChange) {
    const otherModelsItem = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((el) => el.textContent?.trim().startsWith(OTHER_MODELS_MENU_LABEL));
    if (!otherModelsItem) {
      return {
        ok: false,
        error: "「他のモデル」メニュー項目が見つかりません。",
      };
    }
    // Base UI の submenu は click/pointer では安定して開かないため
    // ARIA メニュー標準どおり ArrowRight キーで開く。
    otherModelsItem.focus();
    const arrowRightInit: KeyboardEventInit = {
      key: "ArrowRight",
      code: "ArrowRight",
      keyCode: 39,
      bubbles: true,
      cancelable: true,
    };
    otherModelsItem.dispatchEvent(new KeyboardEvent("keydown", arrowRightInit));
    otherModelsItem.dispatchEvent(new KeyboardEvent("keyup", arrowRightInit));

    const submenuItemResult = await waitUntilValue<HTMLElement>(() => {
      const items = document.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"]'
      );
      const found = [...items].find(
        (item) =>
          item !== initial.activeItem &&
          (item.textContent?.includes(targetLabel) ?? false)
      );
      return typeof found !== "undefined"
        ? { status: "found", value: found }
        : { status: "pending", value: null };
    });
    if (submenuItemResult.status !== "found") {
      return {
        ok: false,
        error: `モデル「${targetLabel}」の項目が見つかりません。`,
      };
    }
    simulateMouseClickSequence(submenuItemResult.value);

    // モデル切替に伴ってメニューが閉じる & 内部状態の確定を待つ。
    const closed = await waitForMenuClosed();
    if (!closed) {
      return {
        ok: false,
        error: "モデル切替後にメニューが閉じませんでした。",
      };
    }

    // 新モデルの thinking デフォルトに合わせて switch を確認するため、メニューを再オープン。
    const reopened = await openModelMenu(trigger);
    if (!reopened) {
      return {
        ok: false,
        error: "モデル切替後にメニューを再オープンできませんでした。",
      };
    }
    if (reopened.switchInput.checked !== wantThinking) {
      const err = toggleAdaptiveThinking(reopened.switchInput);
      if (err) return err;
    }
  } else {
    // モデル変更なし。 switch だけ調整すれば良い。
    if (initial.switchInput.checked !== wantThinking) {
      const err = toggleAdaptiveThinking(initial.switchInput);
      if (err) return err;
    }
  }

  dispatchEscape();
  return { ok: true, data: {} };
}
