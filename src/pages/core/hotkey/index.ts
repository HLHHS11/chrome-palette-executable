export type CommandRegistration = {
  /** manifest.commands に登録したショートカットのラベル */
  hotkeyName: string;
  handler: () => void;
};

/** manifest.commands に登録したショートカット名と handler を紐付けるルーター。 */
export class HotkeyLauncher {
  private readonly handlers = new Map<string, () => void>();
  private started = false;

  register(handler: CommandRegistration): void {
    if (this.handlers.has(handler.hotkeyName)) {
      console.warn(
        `Hotkey "${handler.hotkeyName}" was registered twice; overwriting.`
      );
    }
    this.handlers.set(handler.hotkeyName, handler.handler);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    chrome.commands.onCommand.addListener((command) => {
      this.handlers.get(command)?.();
    });
  }
}
