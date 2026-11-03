import { App, Modal } from 'obsidian';

export interface ConfirmDeleteOptions {
	title: string;
	message: string;
	confirmLabel: string;
	onConfirm: () => void | Promise<void>;
}

/**
 * Destructive actions always go through a modal — the plugin never deletes a
 * note without an explicit, separate confirmation.
 */
export class ConfirmDeleteModal extends Modal {
	private readonly options: ConfirmDeleteOptions;

	constructor(app: App, options: ConfirmDeleteOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: this.options.title });
		contentEl.createEl('p', { cls: 'life-map-delete-message', text: this.options.message });

		const actions = contentEl.createDiv({ cls: 'life-map-delete-actions' });
		const cancel = actions.createEl('button', { text: '取消' });
		cancel.addEventListener('click', () => this.close());

		const confirm = actions.createEl('button', {
			cls: 'mod-warning',
			text: this.options.confirmLabel,
		});
		confirm.addEventListener('click', () => {
			confirm.disabled = true;
			void (async () => {
				try {
					await this.options.onConfirm();
				} finally {
					this.close();
				}
			})();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
