import { App, Plugin, PluginSettingTab } from "obsidian";

interface ThemedTagsPluginSettings {}

const DEFAULT_SETTINGS: ThemedTagsPluginSettings = {};

export default class ThemedTagsPlugin extends Plugin {
	settings: ThemedTagsPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ThemedTagsPlugnSettings(this.app, this));
	}

	onunload() {}

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
}

class ThemedTagsPlugnSettings extends PluginSettingTab {
	plugin: ThemedTagsPlugin;

	constructor(app: App, plugin: ThemedTagsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {}
}
