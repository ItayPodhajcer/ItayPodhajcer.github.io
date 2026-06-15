// @ts-check

import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://itaypodhajcer.com',
	// Redirect legacy Medium article routes (slug + post id) to their new blog posts.
	redirects: {
		'/a-simple-uniswapv3-assistant-with-azure-openai-semantic-kernel-f47b138959af':
			'/blog/a-simple-uniswapv3-assistant-with-azure-openai-semantic-kernel/',
		'/building-deploying-a-gatsby-website-to-ipfs-using-azure-pipelines-7dd095a861fb':
			'/blog/building-deploying-a-gatsby-website-to-ipfs-using-azure-pipelines/',
		'/creating-a-custom-azure-function-trigger-that-listens-to-ethereum-contract-events-e4e1a70a524a':
			'/blog/creating-a-custom-azure-function-trigger-that-listens-to-ethereum-contract-events/',
		'/creating-a-custom-parity-docker-image-b59fc8aa2140':
			'/blog/creating-a-custom-parity-docker-image/',
		'/creating-a-javascript-github-action-for-generating-ethereum-addresses-793ed1b82627':
			'/blog/creating-a-javascript-github-action-for-generating-ethereum-addresses/',
		'/deploying-a-geo-redundant-serverless-rabbitmq-cluster-on-azure-using-pulumi-for-net-71e6b417378d':
			'/blog/deploying-a-geo-redundant-serverless-rabbitmq-cluster-on-azure-using-pulumi-for-net/',
		'/deploying-ion-nodes-microservices-on-azure-virtual-machines-b5c7c70cb3f5':
			'/blog/deploying-ion-node-s-microservices-on-azure-virtual-machines/',
		'/easily-create-azure-vm-custom-linux-images-for-asp-net-core-services-with-github-actions-and-packer-4abd34540980':
			'/blog/easily-create-azure-vm-custom-linux-images-for-asp-net-core-services-with-github-actions-and-packer/',
		'/easily-running-stability-ais-stablestudio-on-azure-312042feec6d':
			'/blog/easily-running-stability-ai-s-stablestudio-on-azure/',
		'/easily-terraforming-an-ethsigner-with-an-azure-key-vault-hsm-based-key-110e25dcc588':
			'/blog/easily-terraforming-an-ethsigner-with-an-azure-key-vault-hsm-based-key/',
		'/easily-terraforming-interacting-with-an-azure-confidential-ledger-374c75a582b':
			'/blog/easily-terraforming-interacting-with-an-azure-confidential-ledger/',
		'/easy-terraforming-of-an-azure-batch-service-with-an-auto-scaling-pool-1938e9ffab6f':
			'/blog/easy-terraforming-of-an-azure-batch-service-with-an-auto-scaling-pool/',
		'/effortlessly-pulling-ethereum-block-data-into-azure-machine-learning-c37d181a0f23':
			'/blog/effortlessly-pulling-ethereum-block-data-into-azure-machine-learning/',
		'/geo-redundant-stateful-service-made-easy-with-asp-net-core-next-and-azure-virtual-machines-950843bb26fd':
			'/blog/geo-redundant-stateful-service-made-easy-with-asp-net-core-next-and-azure-virtual-machines/',
		'/getting-a-bitcoin-full-node-up-and-running-on-azure-in-no-time-with-bicep-a5fcb3080633':
			'/blog/getting-a-bitcoin-full-node-up-and-running-on-azure-in-no-time-with-bicep/',
		'/getting-a-fast-syncing-go-ethereum-node-up-and-running-on-azure-in-less-than-10-minutes-cb805864c051':
			'/blog/getting-a-fast-syncing-go-ethereum-node-up-and-running-on-azure-in-less-than-10-minutes/',
		'/load-balancing-azure-container-instances-with-envoy-4daf1f4c378c':
			'/blog/load-balancing-azure-container-instances-with-envoy/',
		'/making-the-most-of-gpu-nodes-on-azure-kubernetes-service-using-the-nvidia-gpu-operator-39b9f1431549':
			'/blog/making-the-most-of-gpu-nodes-on-azure-kubernetes-service-using-the-nvidia-gpu-operator/',
		'/running-a-parity-docker-container-with-custom-configuration-938ba0ecde3e':
			'/blog/running-a-parity-docker-container-with-custom-configuration/',
		'/running-an-interplanetary-file-system-node-using-azure-container-instances-5627814a48f5':
			'/blog/running-an-interplanetary-file-system-node-using-azure-container-instances/',
		'/running-automatic1111s-stable-diffusion-web-ui-on-azure-22b3299413ba':
			'/blog/running-automatic1111-s-stable-diffusion-web-ui-on-azure/',
		'/running-ethereums-execution-consensus-nodes-on-azure-kubernetes-service-f433ab3f0737':
			'/blog/running-ethereum-s-execution-consensus-nodes-on-azure-kubernetes-service/',
		'/running-ollama-on-azure-kubernetes-service-d98378e10ef7':
			'/blog/running-ollama-on-azure-kubernetes-service/',
		'/running-quorum-in-a-single-docker-container-configuration-fa1cc3552e48':
			'/blog/running-quorum-in-a-single-docker-container-configuration/',
		'/setting-up-consensyss-quorum-key-manager-on-azure-7929c53ab1ff':
			'/blog/setting-up-consensys-s-quorum-key-manager-on-azure/',
		'/simple-decentralized-identifier-did-document-hosting-on-azure-ec8b5b139d1':
			'/blog/simple-decentralized-identifier-did-document-hosting-on-azure/',
		'/simple-ethereum-wallets-management-with-azure-key-vault-2b701bc0505':
			'/blog/simple-ethereum-wallets-management-with-azure-key-vault/',
		'/simple-mastodon-node-deployment-on-azure-f79f40114d74':
			'/blog/simple-mastodon-node-deployment-on-azure/',
		'/simple-nft-interacting-azure-bot-cabcf1dc4ca9':
			'/blog/simple-nft-interacting-azure-bot/',
		'/simple-terraform-wrapper-module-for-deploying-an-azure-blockchain-service-9cf294b2f112':
			'/blog/simple-terraform-wrapper-module-for-deploying-an-azure-blockchain-service/',
		'/terraforming-a-serverless-etcd-cluster-on-azure-112cf9891c9':
			'/blog/terraforming-a-serverless-etcd-cluster-on-azure/',
		'/terraforming-a-serverless-mongodb-replica-set-with-split-horizon-dns-on-azure-and-cloudflare-9687e37dacf1':
			'/blog/terraforming-a-serverless-mongodb-replica-set-with-split-horizon-dns-on-azure-and-cloudflare/',
		'/terraforming-load-balanced-multi-region-hyperledger-besu-nodes-on-azure-c9c705b72728':
			'/blog/terraforming-load-balanced-multi-region-hyperledger-besu-nodes-on-azure/',
		'/use-auth0-jwt-tokens-for-authenticating-to-a-hyperledger-besu-node-dae6b9c1ceba':
			'/blog/use-auth0-jwt-tokens-for-authenticating-to-a-hyperledger-besu-node/',
		'/using-a-node-js-script-to-upload-a-folder-to-a-remote-ipfs-node-255fa9e3b766':
			'/blog/using-a-node-js-script-to-upload-a-folder-to-a-remote-ipfs-node/',
		'/using-azure-api-management-to-limit-access-to-a-parity-ethereum-node-3449226e29e5':
			'/blog/using-azure-api-management-to-limit-access-to-a-parity-ethereum-node/',
		'/using-azure-devops-pipelines-to-build-a-solidity-smart-contract-a5b448d540fd':
			'/blog/using-azure-devops-pipelines-to-build-a-solidity-smart-contract/',
		'/using-azure-pipelines-to-generate-a-net-package-from-a-solidity-contracts-abi-bd6002198184':
			'/blog/using-azure-pipelines-to-generate-a-net-package-from-a-solidity-contract-s-abi/',
		'/using-generative-ai-for-a-self-evolving-software-component-1d090d8974b2':
			'/blog/using-generative-ai-for-a-self-evolving-software-component/',
	},
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
