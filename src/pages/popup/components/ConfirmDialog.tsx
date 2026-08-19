import "./ConfirmDialog.scss";

import { onCleanup, onMount } from "solid-js";

export default function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  let dialogRef: HTMLDialogElement | undefined;
  let confirmButtonRef: HTMLButtonElement | undefined;
  let cancelButtonRef: HTMLButtonElement | undefined;

  const cancelPopupEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    props.onCancel();
  };

  onMount(() => {
    window.addEventListener("keydown", cancelPopupEscape, true);
    dialogRef?.showModal();
    requestAnimationFrame(() => confirmButtonRef?.focus());
  });
  onCleanup(() =>
    window.removeEventListener("keydown", cancelPopupEscape, true)
  );

  return (
    <dialog
      class="ConfirmDialog"
      ref={dialogRef}
      aria-labelledby="confirm_dialog_title"
      aria-describedby="confirm_dialog_message"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onCancel();
      }}
      onKeyDown={(event) => {
        // ダイアログ表示中のキー操作を背後の一覧へ渡さない。
        event.stopPropagation();
        if (event.isComposing) return;

        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          cancelButtonRef?.focus();
          return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          confirmButtonRef?.focus();
        }
      }}
    >
      <div class="confirm_dialog_content">
        <h2 id="confirm_dialog_title">{props.title}</h2>
        <p id="confirm_dialog_message">{props.message}</p>
        <div class="confirm_dialog_actions">
          <button
            ref={cancelButtonRef}
            type="button"
            class="confirm_dialog_cancel"
            onClick={() => props.onCancel()}
          >
            キャンセル
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            class="confirm_dialog_confirm"
            autofocus
            onClick={() => props.onConfirm()}
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
