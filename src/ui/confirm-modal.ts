import { App, Modal } from "obsidian";

type ConfirmSettings = {
  question: string,
  okText: string,
  okIcon: string,
  okClass: string,
  cancelText: string,
  okCallback: () => void
}

const DEFAULT_SETTINGS: ConfirmSettings = {
  question: "Are you sure?",
  okText: "Yes",
  okIcon: "check",
  okClass: "",
  cancelText: 'Cancel',
  okCallback: () => { }
}

export class ConfirmModal extends Modal {
  settings: ConfirmSettings;

  constructor(app: App, settings: Partial<ConfirmSettings>) {
    super(app);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settings)
  }

  onOpen() {
    this.contentEl.classList.add('bulk-export-confirm')
    this.contentEl.setText(this.settings.question);
    this.contentEl.createDiv({ cls: 'footer' })
    const okBtn = this.contentEl.createEl('button', {
      text: this.settings.okText,
      cls: this.settings.okClass + ' yes'
    })
    okBtn.addEventListener('click', () => {
      if (this.settings.okCallback) {
        this.settings.okCallback()
      }
      this.close()
    })
    const cancelBtn = this.contentEl.createEl('button', {
        text: this.settings.cancelText,
        cls: 'cancel'
    })
    cancelBtn.addEventListener('click', this.close)
  }

  onClose() {
    this.contentEl.empty();
  }
}