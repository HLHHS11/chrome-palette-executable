import "./TimerFormView.scss";

import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { toDurationMs } from "@pages/timer";
import type { DurationFields, TimerSound } from "@pages/timer";
import { For, createSignal, onCleanup, onMount } from "solid-js";
import { tinykeys } from "tinykeys";

import { closeTimerView } from "./view-intent";

const callBackgroundRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const soundLabels: ReadonlyArray<{ value: TimerSound; label: string }> = [
  { value: "default", label: "短い音" },
  { value: "silent", label: "音なし" },
  { value: "persistent", label: "止めるまで鳴らす" },
];

/**
 * タイマーの詳細設定。時間に加えて、タイトルと鳴らし方を決められる。
 *
 * 確定を Cmd+Enter に置くのは、Enter を各入力欄の中で自由に使えるようにするため。
 */
export default function TimerFormView(props: { initial: DurationFields }) {
  const [hours, setHours] = createSignal(props.initial.hours);
  const [minutes, setMinutes] = createSignal(props.initial.minutes);
  const [seconds, setSeconds] = createSignal(props.initial.seconds);
  const [sound, setSound] = createSignal<TimerSound>("default");
  const [title, setTitle] = createSignal("");
  const [error, setError] = createSignal("");

  let firstFieldRef: HTMLInputElement | undefined;

  const submit = async (): Promise<void> => {
    const durationMs = toDurationMs({
      hours: hours(),
      minutes: minutes(),
      seconds: seconds(),
    });
    if (durationMs === null) {
      setError("時・分・秒のいずれかに、数字で長さを入れてください。");
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (tab?.id === undefined) throw new Error("Could not get active tab.");
      const response = await callBackgroundRpc({
        name: "timer.start",
        tabId: tab.id,
        durationMs,
        title: title().trim(),
        sound: sound(),
      });
      if (!response.ok) throw new Error(response.error);
      window.close();
    } catch (e: unknown) {
      setError(`エラーが発生しました。詳細: ${e}`);
    }
  };

  onMount(() => {
    firstFieldRef?.focus();
    const unsubscribe = tinykeys(window, {
      "$mod+Enter": (e) => {
        if (e.isComposing) return;
        e.preventDefault();
        void submit();
      },
      Escape: (e) => {
        if (e.isComposing) return;
        e.preventDefault();
        closeTimerView();
      },
    });
    onCleanup(unsubscribe);
  });

  return (
    <div class="TimerForm">
      <div class="form_row">
        <label for="timer-hours">時</label>
        <input
          id="timer-hours"
          ref={firstFieldRef}
          placeholder="0"
          value={hours()}
          onInput={(e) => setHours(e.target.value)}
        />
      </div>
      <div class="form_row">
        <label for="timer-minutes">分</label>
        <input
          id="timer-minutes"
          placeholder="00"
          value={minutes()}
          onInput={(e) => setMinutes(e.target.value)}
        />
      </div>
      <div class="form_row">
        <label for="timer-seconds">秒</label>
        <input
          id="timer-seconds"
          placeholder="00"
          value={seconds()}
          onInput={(e) => setSeconds(e.target.value)}
        />
      </div>
      <div class="form_row">
        <label for="timer-sound">通知音</label>
        <select
          id="timer-sound"
          value={sound()}
          onChange={(e) => setSound(e.target.value as TimerSound)}
        >
          <For each={soundLabels}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </div>
      <div class="form_row">
        <label for="timer-title">タイトル</label>
        <input
          id="timer-title"
          value={title()}
          onInput={(e) => setTitle(e.target.value)}
        />
      </div>
      <div class="form_error">{error()}</div>
      <div class="form_footer">
        <span>Cmd+Enter で開始 / Esc で戻る</span>
      </div>
    </div>
  );
}
