import "obsidian";

declare module "obsidian" {
	export class SecretComponent extends ValueComponent<string> {
		constructor(app: App, containerEl: HTMLElement);
		getValue(): string;
		setValue(value: string): this;
		onChange(callback: (value: string) => unknown): this;
	}

	interface App {
		secretStorage: {
			get(name: string): Promise<string | null> | string | null;
		};
	}
}
