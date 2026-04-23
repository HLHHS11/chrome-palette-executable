import "./Shortcut.scss";

import { For, Show } from "solid-js";

export default function Shortcut(props: {
  keys?: string;
  onClick?: () => void;
}) {
  return (
    <Show when={props.keys}>
      {(keys) => (
        <span
          class="Shortcut"
          classList={{
            clickable: !!props.onClick,
          }}
          title={props.onClick && "Click to set extension shortcut"}
          onClick={props.onClick}
        >
          <For each={keys().replaceAll(" ", "").split("")}>
            {(c) => <kbd>{c}</kbd>}
          </For>
        </span>
      )}
    </Show>
  );
}
