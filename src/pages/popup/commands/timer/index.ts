import type { Command, CommandRunContext } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { toDurationMs } from "@pages/timer";
import type { DurationFields, TimerEntry } from "@pages/timer";

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

/** 出す行を決めるためだけに読む。一覧の中身は表示側が読み直す。 */
const entries = createLazyResource<TimerEntry[]>([], async () => {
  const response = await callBackgroundRpc({ name: "timer.listAll" });
  if (!response.ok || !("data" in response)) return [];
  return response.data.entries;
});

/**
 * 止める順。鳴り終えたものを先に置き、その先は新しく仕掛けたものから消す。
 *
 * 鳴り終えたタイマーは通知とページ上の表示が残ったままなので、音の有無に
 * かかわらず、まずそれを黙らせたい。残りのうち関心が近いのは、たった今
 * 自分で仕掛けたものである。
 */
const stoppableTimers = (): TimerEntry[] => {
  const all = entries();
  const fired = all
    .filter((entry) => entry.timer.status === "fired")
    .sort((a, b) => (b.timer.firedAt ?? 0) - (a.timer.firedAt ?? 0));
  const pending = all
    .filter((entry) => entry.timer.status === "pending")
    .sort((a, b) => b.timer.startedAt - a.timer.startedAt);
  return [...fired, ...pending];
};

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

async function stopTimer(timerId: string): Promise<void> {
  const response = await callBackgroundRpc({ name: "timer.remove", timerId });
  if (!response.ok) throw new Error(response.error);
}

function fieldsOf(context: CommandRunContext): DurationFields {
  return {
    hours: "",
    minutes: context.args.minutes ?? "",
    seconds: context.args.seconds ?? "",
  };
}

const commands: Command[] = [
  {
    title: "Timer: Start Timer",
    subtitle: "タイマーを開始する",
    icon: faviconURL("about:blank"),
    // 時の欄は置かない。その場で打ち込んで済ませたいのは短い待ち時間であり、
    // 数時間先の予定ならタイトルも決めたくなって詳細設定へ回るため。
    args: [
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

/**
 * 選ばせずに 1 本ずつ止める。複数あっても順に呼べば消えていくので、
 * 素早く黙らせたいだけの用に選択の手間を挟まない。
 * どれを残すかまで決めたいときは、一覧から選ぶ。
 */
function stopCommands(): Command[] {
  const stoppable = stoppableTimers();
  if (stoppable.length === 0) return [];
  return [
    {
      title: "Timer: Stop Running Timer",
      subtitle: "タイマーを止める",
      icon: faviconURL("about:blank"),
      handler: () => {
        void stopTimer(stoppable[0].timer.id)
          .then(() => window.close())
          .catch((e: unknown) => setInput(`エラーが発生しました。詳細: ${e}`));
      },
    },
  ];
}

/** 0 件のときは入口ごと隠す。普段は無い状態なので、常設すると邪魔なだけ。 */
function manageCommands(): Command[] {
  const count = entries().length;
  if (count === 0) return [];
  return [
    {
      title: `Timer: Manage Timers (${count})`,
      subtitle: "タイマーを管理する",
      icon: faviconURL("about:blank"),
      handler: () => openTimerList(),
    },
  ];
}

export default function timerSuggestions(): Command[] {
  return [...commands, ...stopCommands(), ...manageCommands()];
}
