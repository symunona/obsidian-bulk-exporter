import { Modal } from "obsidian";
import { AttachmentLink, LinkParseResults } from "src/export/get-links-and-attachments";
import BulkExporterPlugin from "src/main";
import { ExportProperties } from "src/models/export-properties";
import { getIcon } from "src/obsidian-api-helpers/get-icon";
import { DiffView } from "src/utils/diff";

const LINK_LISTS = [
  'internalLinks',
  'externalLinks',
  'internalAttachments',
  'internalHeaderAttachments',
  'externalAttachments',
  'headerAttachments'
]

/**
 * `LINK_LISTS` is looked up dynamically by name, but `LinkParseResults` has
 * no index signature (and one of the names above, 'headerAttachments', isn't
 * even a real key on it). Every key that does exist on it holds an
 * `AttachmentLink[]`, so this describes that slice honestly instead of
 * indexing the typed object with an arbitrary string.
 */
type LinkGroupMap = Partial<Record<string, Array<AttachmentLink>>>

function getLinkGroup(
  linksAndAttachments: LinkParseResults | undefined,
  groupKey: string
): Array<AttachmentLink> | undefined {
  if (!linksAndAttachments) {
    return undefined
  }
  return (linksAndAttachments as unknown as LinkGroupMap)[groupKey]
}

export class StatsModal extends Modal {
  item: ExportProperties
  plugin: BulkExporterPlugin

  constructor(plugin: BulkExporterPlugin, item: ExportProperties) {
    super(plugin.app);
    this.item = item
    this.plugin = plugin
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.classList.add('bulk-export-stat-modal')

    contentEl.createEl("h1", { text: this.item.from })

    const content = contentEl.createDiv({ cls: 'content' })
    this.linkStats(content)
    this.globStats(content)
    new DiffView(content, this.item, this.plugin)
  }


  globStats(content: HTMLElement) {
    if (this.item.copyGlob) {
      content.createEl('h2', 'body raw files')
      Object.keys(this.item.copyGlob).forEach((selector) => {
        const groupDiv = content.createDiv()
        groupDiv.createEl('h3', { text: selector })

        // @ts-ignore
        if (this.item.copyGlob[selector] && this.item.copyGlob[selector].length) {
          // @ts-ignore
          this.item.copyGlob[selector].forEach((link: AttachmentLink) => {
            this.renderLink(link, groupDiv)
          })
        } else {
          groupDiv.createSpan({ text: 'no files found' })
        }
      })
    }
  }

  linkStats(content: HTMLElement) {
    if (this.noLinksOrAttachments()) {
      content.createEl('p', { text: 'No attachments or links in file.' })
    }
    LINK_LISTS.forEach((linkOrAttachmentGroupKey) => {
      const linkGroup = getLinkGroup(this.item.linksAndAttachments, linkOrAttachmentGroupKey)
      if (linkGroup && linkGroup.length) {
        const groupDiv = content.createDiv()
        groupDiv.createEl('h3', { text: linkOrAttachmentGroupKey })

        linkGroup.forEach((link: AttachmentLink) => {
          this.renderLink(link, groupDiv)
        })
      }
    })
  }

  noLinksOrAttachments() {
    return !LINK_LISTS.find((linkOrAttachmentGroupKey) => {
      const linkGroup = getLinkGroup(this.item.linksAndAttachments, linkOrAttachmentGroupKey)
      return Boolean(linkGroup && linkGroup.length)
    })
  }

  renderLink(link: AttachmentLink, groupDiv: HTMLElement) {
    const linkDisplay = groupDiv.createDiv({
      cls: link.error ? 'error link' : (link.newPath ? 'success link' : 'link')
    })
    linkDisplay.createEl('a', {
      text: link.text,
      title: link.normalizedOriginalPath,
      cls: 'title',
      href: link.originalPath
    })
    linkDisplay.createSpan({ text: link.normalizedOriginalPath, cls: 'url' })
    if (link.newPath) {
      linkDisplay.createSpan({ text: `=> ${link.newPath}`, cls: 'replaced' })
    }
    if (link.error) {
      linkDisplay.createDiv({ cls: 'error', text: link.error })
      linkDisplay.prepend(getIcon('alert-triangle'));
    } else if (link.newPath) {
      linkDisplay.prepend(getIcon('check'));
    }
  }


  onClose() {
    this.contentEl.empty();
  }
}