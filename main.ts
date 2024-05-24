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
		const hslColor = this.hexToHsl(color);
		const style = document.createElement("style");
		style.id = "themed-tags-file-theme-color";
		const accentVariables = this.getAccentVariables();
		let css = ":root {";
		accentVariables.forEach((variable) => {
			const originalValue = this.getCssVariableValue(variable);
			let newValue = originalValue;

			if (!originalValue.includes("var(") && originalValue !== "") {
				let skip = false;

				if (variable.endsWith("-h") || variable.endsWith("-s")) {
					// For 'h', 's', 'l' variables, we just replace the respective part
					if (variable.endsWith("-h")) {
						newValue = `${hslColor.h}`;
					} else if (variable.endsWith("-s")) {
						newValue = `${hslColor.s}%`;
					}
				} else if (variable.endsWith("-rgb")) {
					// For 'rgb' variables, we need to convert HSL to RGB and apply the new hue and saturation
					const { r, g, b } = this.parseRgbValue(originalValue);

					const hslParts = this.rgbToHsl(r, g, b);
					const rgbColor = this.hslToRgb(
						hslColor.h,
						hslColor.s,
						hslParts.l
					);
					newValue = `rgb(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b})`;
				} else if (originalValue.startsWith("hsl(")) {
					// For 'hsl' variables, we replace the hue and saturation but keep the luminance
					const hslParts = this.parseHslValue(originalValue);
					newValue = `hsl(${hslColor.h}, ${hslColor.s}%, ${hslParts.l}%)`;
				} else skip = true;

				if (!skip) {
					css += `--${variable}: ${newValue} !important;`;
				}
			}
		});
		css += " }";
		style.textContent = css;
		document.head.appendChild(style);

		// Directly modify body styles to override existing variables
		document.body.style.setProperty(
			"--accent-h",
			`${hslColor.h}`,
			"important"
		);
		document.body.style.setProperty(
			"--accent-s",
			`${hslColor.s}%`,
			"important"
		);
	}

	removeFileThemeColor() {
		const style = document.getElementById("themed-tags-file-theme-color");
		if (style) {
			style.remove();
		}

		// Remove the body styles modifications
		document.body.style.removeProperty("--accent-h");
		document.body.style.removeProperty("--accent-s");
	}

	getAccentVariables(): string[] {
		const styleSheets = Array.from(document.styleSheets);
		const accentVariables: Set<string> = new Set();

		for (const sheet of styleSheets) {
			try {
				const rules = Array.from((sheet as CSSStyleSheet).cssRules);
				for (const rule of rules) {
					if (rule instanceof CSSStyleRule) {
						const style = rule.style;
						for (let i = 0; i < style.length; i++) {
							const name = style[i];
							if (name.includes("accent")) {
								accentVariables.add(name);
							}
						}
					}
				}
			} catch (e) {
				// Ignore rules we can't access (e.g., from external stylesheets)
			}
		}

		return Array.from(accentVariables);
	}

	getCssVariableValue(variable: string): string {
		return getComputedStyle(document.documentElement)
			.getPropertyValue(`--${variable}`)
			.trim();
	}

	parseHslValue(hsl: string): { h: number; s: number; l: number } {
		const hslMatch = hsl.match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/);
		if (!hslMatch) {
			console.error(`Failed to parse HSL value: ${hsl}`); // Debugging statement
			return { h: 0, s: 0, l: 50 }; // fallback with 50% luminance
		}
		let [_, h, s, l] = hslMatch.map(Number);
		return { h, s, l };
	}

	parseRgbValue(rgb: string): { r: number; g: number; b: number } {
		const rgbMatch = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
		if (!rgbMatch) {
			console.error(`Failed to parse RGB value: ${rgb}`);
			return { r: 0, g: 0, b: 0 }; // fallback to black if parsing fails
		}
		const [_, r, g, b] = rgbMatch.map(Number);
		return { r, g, b };
	}

	hexToHsl(hex: string): { h: number; s: number; l: number } {
		hex = hex.replace(/^#/, "");
		let r = parseInt(hex.substring(0, 2), 16) / 255;
		let g = parseInt(hex.substring(2, 4), 16) / 255;
		let b = parseInt(hex.substring(4, 6), 16) / 255;

		let max = Math.max(r, g, b);
		let min = Math.min(r, g, b);
		let h: number = 0,
			s: number = 0,
			l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
			h /= 6;
		}

		return { h: h * 360, s: s * 100, l: l * 100 };
	}

	hslToRgb(
		h: number,
		s: number,
		l: number
	): { r: number; g: number; b: number } {
		h /= 360;
		s /= 100;
		l /= 100;
		let r: number, g: number, b: number;

		if (s === 0) {
			r = g = b = l; // achromatic
		} else {
			const hue2rgb = (p: number, q: number, t: number) => {
				if (t < 0) t += 1;
				if (t > 1) t -= 1;
				if (t < 1 / 6) return p + (q - p) * 6 * t;
				if (t < 1 / 3) return q;
				if (t < 1 / 2) return p + (q - p) * (2 / 3 - t) * 6;
				return p;
			};

			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;
			r = hue2rgb(p, q, h + 1 / 3);
			g = hue2rgb(p, q, h);
			b = hue2rgb(p, q, h - 1 / 3);
		}

		return {
			r: Math.round(r * 255),
			g: Math.round(g * 255),
			b: Math.round(b * 255),
		};
	}

	rgbToHsl(
		r: number,
		g: number,
		b: number
	): { h: number; s: number; l: number } {
		// Convert r, g, b values from 0-255 to 0-1
		r /= 255;
		g /= 255;
		b /= 255;

		// Find the maximum and minimum values among r, g, b
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);

		let h = 0,
			s = 0,
			l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
			h /= 6;
		}

		return {
			h: h * 360,
			s: s * 100,
			l: l * 100,
		};
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
		containerEl.createEl("h2", { text: "Themed Tags" });

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
				new Setting(tagListContainer)
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
