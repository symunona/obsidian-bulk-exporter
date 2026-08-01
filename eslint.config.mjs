import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

// Flat config, matching the official obsidianmd/obsidian-sample-plugin setup
// (eslint 9 + eslint-plugin-obsidianmd). Upstream keeps this in an
// `eslint.config.mts`, which needs jiti to load; this package is CommonJS
// (jest.config.js), so plain `.mjs` avoids adding a TypeScript-config loader
// for no benefit.
export default defineConfig(
	globalIgnores([
		"node_modules",
		"main.js",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"package.json",
		"tsconfig.json",
		"test-vault",
		"data.json",
	]),
	{
		languageOptions: {
			globals: {
				// The plugin runs inside Electron: DOM plus Node built-ins.
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					// tsconfig.json only includes **/*.ts, so the JS config
					// files at the root have no project and must be parsed
					// with the default one.
					allowDefaultProject: [
						"eslint.config.mjs",
						"jest.config.js",
						"manifest.json",
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Carried over from the previous .eslintrc so this change is a config
		// migration, not a silent tightening/loosening of what the code must
		// satisfy. `no-explicit-any` is deliberately NOT disabled here.
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
		},
	},
	{
		files: ["src/test/**/*.ts", "**/*.test.ts"],
		languageOptions: {
			globals: {
				...globals.jest,
			},
		},
		rules: {
			// `createEl` is an Obsidian helper that only exists inside the app.
			// Under jest the test harness has to build it out of the real DOM
			// primitive first, so the rule that forbids that primitive cannot
			// apply to the code implementing it.
			"obsidianmd/prefer-create-el": "off",
		},
	},
);
