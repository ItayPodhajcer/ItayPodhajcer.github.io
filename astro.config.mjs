// @ts-check

import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://itaypodhajcer.com',
	vite: {
		plugins: [tailwindcss()],
	},
	integrations: [
		expressiveCode({
			themes: ['github-light', 'github-dark'],
			plugins: [pluginLineNumbers()],
			defaultProps: {
				wrap: true,
				showLineNumbers: false,
			},
			styleOverrides: {
				codeFontSize: '0.875rem',
				codeFontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
				codeLineHeight: '1.7142857em',
				borderRadius: '0.5rem',
				borderWidth: '1px',
				codePaddingBlock: '0.75rem',
				codePaddingInline: '1rem',
				frames: {
					frameBoxShadowCssValue: '0 2px 12px rgba(0, 0, 0, 0.1)',
				},
			},
			frames: {
				showCopyToClipboardButton: true,
			},
			useDarkModeMediaQuery: false,
			themeCssSelector: (theme) => {
				if (theme.name === 'github-dark') return '.dark';
				return false;
			},
		}),
		sitemap(),
	],
	markdown: {
		syntaxHighlight: false,
	},
});
