import type { Command, CommandRunContext } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { toDurationMs } from "@pages/timer";
import type { DurationFields } from "@pages/timer";

import { createLazyResource, setInput } from "~/util/signals";

import { faviconURL } from "../../util/favicon";
import { openTimerForm, openTimerList } from "./view-intent";

const callBackgroundRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

async function currentTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id === undefined) throw new Error("Could not get active tab.");
  return tab.id;
}

/** 一覧の入口を出すかどうかの判断にだけ使う。中身は一覧ビューが読み直す。 */
const timerCount = createLazyResource<number>(0, async () => {
  const response = await callBackgroundRpc({ name: "timer.listAll" });
  if (!response.ok || !("data" in response)) return 0;
  return response.data.entries.length;
});

/** 入力された時間でタイマーを仕掛ける。タイトルと鳴らし方は既定のまま。 */
async function startTimer(fields: DurationFields): Promise<void> {
  const durationMs = toDurationMs(fields);
  if (durationMs === null) throw new Error("時間を入力してください。");
  const response = await callBackgroundRpc({
    name: "timer.start",
    tabId: await currentTabId(),
    durationMs,
    title: "",
    sound: "default",
  });
  if (!response.ok) throw new Error(response.error);
}

function fieldsOf(context: CommandRunContext): DurationFields {
  return {
    hours: context.args.hours ?? "",
    minutes: context.args.minutes ?? "",
    seconds: context.args.seconds ?? "",
  };
}

const commands: Command[] = [
  {
    title: "Timer: Start Timer",
    subtitle: "タイマーを開始する",
    icon: faviconURL("about:blank"),
    args: [
      { name: "hours", placeholder: "時" },
      { name: "minutes", placeholder: "分" },
      { name: "seconds", placeholder: "秒" },
    ],
    // Enter は詳細設定へ、Cmd+Enter はその場で開始。時間だけで足りるときに
    // 画面を挟まずに済ませられる。
    handler: (context) => {
      if (context.intent === "primary") {
        openTimerForm(fieldsOf(context));
        return;
      }
      void startTimer(fieldsOf(context))
        .then(() => window.close())
        .catch((e: unknown) => setInput(`エラーが発生しました。詳細: ${e}`));
    },
  },
];

/** 0 件のときは入口ごと隠す。普段は無い状態なので、常設すると邪魔なだけ。 */
function listEntryCommands(): Command[] {
  const count = timerCount();
  if (count === 0) return [];
  return [
    {
      title: `Timer: Timers (${count})`,
      subtitle: "タイマーを一覧する",
      icon: faviconURL("about:blank"),
      handler: () => openTimerList(),
    },
  ];
}

export default function timerSuggestions(): Command[] {
  return [...commands, ...listEntryCommands()];
}
