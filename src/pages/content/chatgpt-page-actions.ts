import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClick,
  simulateMouseClickSequence,
  waitForSelector,
  waitUntilValue,
} from "../lib/dom/selector";

// TODO: #1 REVERT symbolを返すのは型チェックのため
export async function enableChatGptWebSearch(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  // NOTE: 既にメニューが開いている状態で本コマンドを実行すると、メニューが閉じてしまう。
  // 再度実行すれば良いので今 (260405 Issue #1) 時点では無視するが、丁寧に作り込みたいならメニューの開閉状況確認のロジックを入れても良い。
  const optionMenuButton = await waitForSelector("button.composer-btn");
  simulateMouseClick(optionMenuButton);

  const optionMenu = await waitForSelector(
    'div[role="menu"][data-state="open"]'
  );

  const webSearchButtonResult = await waitUntilValue(() => {
    const items = optionMenu.querySelectorAll('div[role="menuitemradio"]');
    const maybeWebSearchItem = [...items].find((e) => {
      // NOTE: UI上の文言が変更されたら、ここも修正が必要になる！
      const isWebSearch = e.textContent?.includes("ウェブ検索") ?? false;
      return isWebSearch;
    });

    return typeof maybeWebSearchItem !== "undefined"
      ? { status: "found", value: maybeWebSearchItem }
      : { status: "pending", value: null };
  });

  if (webSearchButtonResult.status !== "found") {
    throw new Error("ウェブ検索のメニュー項目が見つかりません。");
  }

  simulateMouseClick(webSearchButtonResult.value);
  return { ok: true, data: {} };
}

export function disableChatGptWebSearch(): RpcResponse<RpcVoidResponseBody> {
  const btn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="検索：クリックして削除"]'
  );
  // 無効化ボタンが見つからない場合は何もしない
  if (!btn) {
    return { ok: false, error: "無効化ボタンが見つかりません。" };
  }
  btn.click();

  return { ok: true, data: {} };
}

export function toggleChatGptSidebar(): RpcResponse<RpcVoidResponseBody> {
  const closeBtn = document.querySelector(
    'button[aria-label="サイドバーを閉じる"]'
  );
  const openBtn = document.querySelector(
    'button[aria-label="サイドバーを開く"]'
  );

  const isExpanded = closeBtn?.getAttribute("aria-expanded") === "true";
  if (isExpanded) {
    if (!closeBtn)
      return { ok: false, error: "閉じるボタンが見つかりません。" };
    simulateMouseClick(closeBtn);
  } else {
    if (!openBtn) return { ok: false, error: "開くボタンが見つかりません。" };
    simulateMouseClick(openBtn);
  }

  return { ok: true, data: {} };
}

type SelectChatGptModelParams =
  | {
      model: "gpt-5.3";
    }
  | {
      model: "gpt-5.5-thinking";
      thinkingEffort: "standard" | "extended";
    };

export async function selectChatGptModel(
  params: SelectChatGptModelParams
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const modelSwitchDropdownButtonResult = await waitUntilValue(() => {
    const buttons = document
      .querySelector("div#thread-bottom-container")
      ?.querySelectorAll("button");
    const selectModelButton =
      typeof buttons !== "undefined"
        ? ([...buttons].find((button) => {
            const text = button.textContent?.trim();
            return text === "Instant" || text === "思考" || text === "拡張";
          }) ?? null)
        : null;
    if (selectModelButton) {
      return { status: "found", value: selectModelButton };
    }

    return { status: "pending", value: null };
  });
  if (modelSwitchDropdownButtonResult.status !== "found") {
    return {
      ok: false,
      error: "モデル選択ドロップダウンボタンが見つかりません。",
    };
  }
  simulateMouseClick(modelSwitchDropdownButtonResult.value);

  const model = (() => {
    switch (params.model) {
      case "gpt-5.3":
        return "model-switcher-gpt-5-3";
      case "gpt-5.5-thinking":
        return "model-switcher-gpt-5-5-thinking";
    }
  })();
  const modelButtonResult = await waitUntilValue(() => {
    const modelButton = document.querySelector(`div[data-testid="${model}"]`);
    if (!modelButton) {
      return { status: "pending", value: null };
    }
    const modelSpan = modelButton.children[0];
    if (!(modelSpan instanceof Element)) {
      return { status: "pending", value: null };
    }

    return { status: "found", value: modelSpan };
  });
  if (modelButtonResult.status !== "found") {
    return { ok: false, error: "モデル選択のメニュー項目が見つかりません。" };
  }

  if (params.model === "gpt-5.3") {
    simulateMouseClickSequence(modelButtonResult.value);
    return { ok: true, data: {} };
  } else {
    // thinkingモデルの場合、さらにthinking effortを選択
    const thinkingEffortExpandButtonResult = await waitUntilValue(() => {
      const expandButton = document.querySelector(
        'button[aria-label="思考強度"]'
      );
      if (expandButton) {
        return { status: "found", value: expandButton };
      }
      return { status: "pending", value: null };
    });
    if (thinkingEffortExpandButtonResult.status !== "found") {
      return {
        ok: false,
        error:
          "thinking effortの選択ドロップダウンを開くためのボタンが見つかりません。",
      };
    }
    if (!(thinkingEffortExpandButtonResult.value instanceof HTMLElement)) {
      return {
        ok: false,
        error:
          "thinking effortの選択ドロップダウンを開くためのボタンが見つかりません。",
      };
    }
    thinkingEffortExpandButtonResult.value.click();

    const label = (() => {
      switch (params.thinkingEffort) {
        case "standard":
          return "標準";
        case "extended":
          return "拡張";
      }
    })();

    const effortDivResult = await waitUntilValue(() => {
      const candidateDivElms = document.querySelectorAll("div.truncate");
      const target = [...candidateDivElms].find(
        (el) => el.textContent?.trim() === label
      );
      return target
        ? { status: "found", value: target }
        : { status: "pending", value: null };
    });

    if (effortDivResult.status !== "found") {
      return {
        ok: false,
        error: `Thinking effort "${label}" の選択肢が見つかりません。`,
      };
    }

    if (!(effortDivResult.value instanceof HTMLElement)) {
      return {
        ok: false,
        error: `Thinking effort "${label}" の選択肢が見つかりません。`,
      };
    }
    effortDivResult.value.click();
    return { ok: true, data: {} };
  }
}

export function openChatGptFileAttach(): RpcResponse<RpcVoidResponseBody> {
  // ChatGPT は Cmd + U のショートカットをサポートしているため、そのキーボードイベントを発火させる
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "u",
      code: "KeyU",
      metaKey: true, // Cmd (MacOS) / Ctrl (Windows) の押下状態
      bubbles: true,
      cancelable: true,
    })
  );
  return { ok: true, data: {} };
}

export function stopChatGptGeneration(): RpcResponse<RpcVoidResponseBody> {
  const stopButton = document.querySelector<HTMLElement>(
    'button[data-testid="stop-button"]'
  );
  if (!stopButton) {
    return { ok: false, error: "回答生成停止ボタンが見つかりません。" };
  }
  simulateMouseClick(stopButton);
  return { ok: true, data: {} };
}
