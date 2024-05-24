import { App, Plugin, PluginSettingTab, Setting, MarkdownView } from "obsidian";

// Define interface for plugin settings
interface ThemedTagsPluginSettings {
	tagColors: { [tag: string]: string };
}

const DEFAULT_SETTINGS: ThemedTagsPluginSettings = {
	tagColors: {},
};

export default class ThemedTagsPlugin extends Plugin {
	settings: ThemedTagsPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ThemedTagsPluginSettingTab(this.app, this));

		// Apply the colors to the tags in the markdown preview
		this.applyTagColors();

		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.applyTagColors();
			})
		);

		// Detect when a file is opened in the reading view
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.applyFileThemeColor();
			})
		);
	}

	onunload() {
		this.removeTagColors();
		this.removeFileThemeColor();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	applyTagColors() {
		const style = document.createElement("style");
		style.id = "themed-tags-plugin-style";
		document.head.appendChild(style);

		const { tagColors } = this.settings;
		let css = "";

		for (const tag in tagColors) {
			const color = tagColors[tag];
			css += `.tag[href="#${tag}"] { color: ${color} !important; }`;
		}

		style.textContent = css;
	}

	removeTagColors() {
		const style = document.getElementById("themed-tags-plugin-style");
		if (style) {
			style.remove();
		}
	}

	applyFileThemeColor() {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
			const file = activeLeaf.view.file;
			if (file) {
				const fileCache = this.app.metadataCache.getFileCache(file);
				if (fileCache?.tags && fileCache.tags.length > 0) {
					const firstTag = fileCache.tags[0].tag.replace(/^#/, "");
					const color = this.settings.tagColors[firstTag];
					if (color) {
						this.setFileThemeColor(color);
					} else {
						this.removeFileThemeColor();
					}
				} else {
					this.removeFileThemeColor();
				}
			}
		}
	}

	setFileThemeColor(color: string) {
		const style = document.createElement("style");
		style.id = "themed-tags-file-theme-color";
		style.textContent = `
			.markdown-preview-view {
				--file-theme-color: ${color};
			}
		`;
		document.head.appendChild(style);
	}

	removeFileThemeColor() {
		const style = document.getElementById("themed-tags-file-theme-color");
		if (style) {
			style.remove();
		}
	}
}

class ThemedTagsPluginSettingTab extends PluginSettingTab {
	plugin: ThemedTagsPlugin;

	constructor(app: App, plugin: ThemedTagsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "Themed Tags Plugin Settings" });

		// Create a search bar
		const searchBar = containerEl.createEl("input", {
			type: "text",
			placeholder: "Search tags...",
		});
		const tagListContainer = containerEl.createEl("div", {
			cls: "tag-list-container",
		});

		// Retrieve all tags in the vault
		const tags = this.getAllTags();

		const accentColorHSL = getComputedStyle(document.body)
			.getPropertyValue("--color-accent")
			.trim();
		const accentColorHex = this.hslToHex(accentColorHSL);

		const renderTags = (filter: string) => {
			tagListContainer.empty();

			const filteredTags = tags.filter((tag) => tag.includes(filter));

			filteredTags.forEach((tag) => {
				const setting = new Setting(tagListContainer)
					.setName(tag)
					.addColorPicker((colorPicker) => {
						colorPicker
							.setValue(
								this.plugin.settings.tagColors[tag] ||
									accentColorHex
							)
							.onChange(async (value) => {
								this.plugin.settings.tagColors[tag] = value;
								await this.plugin.saveSettings();
								this.plugin.applyTagColors();
							});
					});
			});
		};

		renderTags("");

		searchBar.addEventListener("input", () => {
			const filter = searchBar.value.toLowerCase();
			renderTags(filter);
		});
	}

	getAllTags(): string[] {
		const tags: Set<string> = new Set();
		const files = this.app.vault.getMarkdownFiles();

		files.forEach((file) => {
			const fileCache = this.app.metadataCache.getFileCache(file);
			if (fileCache?.tags) {
				fileCache.tags.forEach((tag) =>
					tags.add(tag.tag.replace(/^#/, ""))
				);
			}
		});

		return Array.from(tags);
	}

	hslToHex(hsl: string): string {
		const hslMatch = hsl.match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/);
		if (!hslMatch) {
			return "#000000"; // fallback to black if parsing fails
		}
		let [_, h, s, l] = hslMatch.map(Number);
		s /= 100;
		l /= 100;

		const a = s * Math.min(l, 1 - l);
		const f = (n: number) => {
			const k = (n + h / 30) % 12;
			const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
			return Math.round(255 * color)
				.toString(16)
				.padStart(2, "0");
		};

		return `#${f(0)}${f(8)}${f(4)}`;
	}
}

// Adding styles for the search bar and tag list container
const style = document.createElement("style");
style.textContent = `
	.tag-list-container {
		max-height: 400px;
		overflow-y: auto;
	}
	input[type="text"] {
		margin-bottom: 10px;
		padding: 5px;
		width: 100%;
		box-sizing: border-box;
	}
`;
document.head.appendChild(style);
