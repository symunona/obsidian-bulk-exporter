import { App, Modal } from "obsidian";

type ConfirmSettings = {
    question: string,
    okText: string,
    okIcon: string,
    okClass: string,
    okCallback: ()=> void
}

export class ExampleModal extends Modal {
  settings: Partial<ConfirmSettings>;

  constructor(app: App, settings: Partial<ConfirmSettings>) {
    super(app);
    this.settings = settings
  }

  onOpen() {
    this.contentEl.classList.add('bulk-export-confirm')
    this.contentEl.setText(this.settings.question || "Are you sure?");
    const okBtn = this.containerEl.createEl('button', {
        text: this.settings.okText || 'Yes',
        cls: this.settings.okClass
    })
    okBtn.addEventListener('click', ()=>{if (this.settings.okCallback){
        this.settings.okCallback()
    }})
  }

  onClose() {
    this.contentEl.empty();
  }
}