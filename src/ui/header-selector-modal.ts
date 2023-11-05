import { Modal, Setting } from "obsidian";
import BulkExporterPlugin from "src/main";
import { BulkExportSettings } from "src/models/bulk-export-settings";

export class HeaderFieldSelectorModal extends Modal {
  result: Array<string>;
  enabled: Array<string>;
  toggles: Array<Setting>;
  onSubmit: (result: Array<string>) => void;
  headerFields: Array<string>;
  preview: HTMLInputElement;
  plugin: BulkExporterPlugin;
  toggleWrapper: HTMLElement;
  settings: BulkExportSettings;

  constructor(plugin: BulkExporterPlugin, settings: BulkExportSettings, headerFields: Array<string>, onSubmit: (result: Array<string>) => void) {
    super(plugin.app);
    this.plugin = plugin
    this.onSubmit = onSubmit;
    this.enabled = settings.headerFieldsToShow;
    this.settings = settings
    this.headerFields = headerFields
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h1", { text: "Select metadata header display order" })

    this.preview = contentEl.createEl('input',{
        value: this.enabled.join(', '),
        cls: 'meta-data-header-selector-input',
        placeholder: '*'
    })

    this.preview.addEventListener('change', () => {
        this.enabled = this.preview.value.split(',').map((s)=>s.trim());
    })

    this.toggleWrapper = contentEl.createDiv({cls: 'meta-data-header-selector-scroller'})

    new Setting(contentEl)
        .addButton((button) => {
            button.setButtonText('Clear')
            button.onClick(()=>this.clear())
    }).addButton((btn) =>
        btn
            .setButtonText("Save")
            .setCta()
            .onClick(() => {
        this.close();

        this.enabled = this.preview.value.split(',').map((s)=>s.trim());
        this.settings.headerFieldsToShow = this.preview.value.split(',').map((s)=>s.trim()).filter(s=>s);
        this.plugin.saveSettings()
        this.onSubmit(this.enabled);
      }));

      this.renderToggles()

  }
  clear(){
    this.enabled = []
    this.preview.value = ''
    this.renderToggles()
  }

  renderToggles(){
    this.toggleWrapper.innerHTML = '';
    (this.headerFields || []).sort().map((fieldName)=>{
        const isSelected = this.enabled.indexOf(fieldName) > -1
        const toggler = this.toggleWrapper.createSpan({text: fieldName, cls: isSelected?'active':''})
        toggler.addEventListener('click', ()=>{
            if (this.enabled.indexOf(fieldName) === -1){
                this.enabled.push(fieldName)
            } else {
                this.enabled.splice(this.enabled.indexOf(fieldName), 1)
            }
            this.preview.value = this.enabled.join(', ')
            toggler.classList.toggle('active')
        })
    })
  }

  onClose() {
    this.contentEl.empty();
  }
}