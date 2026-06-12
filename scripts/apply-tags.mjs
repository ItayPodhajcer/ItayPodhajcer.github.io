// Applies the tags crawled from Medium into each post's frontmatter.
// Re-runnable: replaces any existing `tags:` block.

import fs from 'node:fs/promises';
import path from 'node:path';

const TAGS = {
	'a-simple-uniswapv3-assistant-with-azure-openai-semantic-kernel': ['OpenAI', 'Web3', 'Software Engineering', 'Cloud Computing', 'Azure'],
	'building-deploying-a-gatsby-website-to-ipfs-using-azure-pipelines': ['IPFS', 'Azure DevOps', 'Azure Pipelines', 'GatsbyJS'],
	'creating-a-custom-azure-function-trigger-that-listens-to-ethereum-contract-events': ['Ethereum', 'Azure Functions', 'Solidity', 'Azure', 'CSharp'],
	'creating-a-custom-parity-docker-image': ['Docker', 'Ethereum', 'Docker Compose', 'Dockerfiles', 'Ethereum Blockchain'],
	'creating-a-javascript-github-action-for-generating-ethereum-addresses': ['GitHub', 'NodeJS', 'JavaScript', 'Ethereum', 'Solidity'],
	'deploying-a-geo-redundant-serverless-rabbitmq-cluster-on-azure-using-pulumi-for-net': ['Azure', 'RabbitMQ', 'Pulumi', 'Dotnet Core', 'DevOps'],
	'deploying-ion-node-s-microservices-on-azure-virtual-machines': ['Web3', 'Azure', 'Cloud Computing', 'Software Engineering', 'DevOps'],
	'easily-create-azure-vm-custom-linux-images-for-asp-net-core-services-with-github-actions-and-packer': ['Azure', 'GitHub Actions', 'Dotnet', 'Software Development', 'Cloud Computing'],
	'easily-running-stability-ai-s-stablestudio-on-azure': ['AI', 'Azure', 'DevOps', 'Cloud Computing', 'Software Engineering'],
	'easily-terraforming-an-ethsigner-with-an-azure-key-vault-hsm-based-key': ['Azure', 'Ethereum', 'Software Development', 'Cloud Computing', 'DevOps'],
	'easily-terraforming-interacting-with-an-azure-confidential-ledger': ['Azure', 'Cloud Computing', 'Software Development', 'Software Engineering', 'Blockchain'],
	'easy-terraforming-of-an-azure-batch-service-with-an-auto-scaling-pool': ['Azure', 'DevOps', 'Terraform', 'Software Engineering', 'Cloud Computing'],
	'effortlessly-pulling-ethereum-block-data-into-azure-machine-learning': ['Azure', 'Ethereum', 'Software Development', 'Cloud Computing', 'Smart Contracts'],
	'geo-redundant-stateful-service-made-easy-with-asp-net-core-next-and-azure-virtual-machines': ['AspNetCore', 'Dotnet', 'Azure', 'Software Development', 'Cloud Computing'],
	'getting-a-bitcoin-full-node-up-and-running-on-azure-in-no-time-with-bicep': ['Azure', 'Bitcoin', 'DevOps', 'Cloud Computing', 'Software Engineering'],
	'getting-a-fast-syncing-go-ethereum-node-up-and-running-on-azure-in-less-than-10-minutes': ['Azure', 'Ethereum', 'DevOps', 'Cloud Computing', 'Software Engineering'],
	'load-balancing-azure-container-instances-with-envoy': ['Azure', 'Terraform', 'Software Engineering', 'DevOps', 'Cloud Computing'],
	'making-the-most-of-gpu-nodes-on-azure-kubernetes-service-using-the-nvidia-gpu-operator': ['AI', 'Cloud Computing', 'Software Engineering', 'Azure', 'Nvidia'],
	'running-a-parity-docker-container-with-custom-configuration': ['Docker', 'Ethereum', 'Parity', 'Docker Compose'],
	'running-an-interplanetary-file-system-node-using-azure-container-instances': ['IPFS', 'Azure', 'Azure Container Instances', 'YAML', 'Azure Storage'],
	'running-automatic1111-s-stable-diffusion-web-ui-on-azure': ['AI', 'Software Engineering', 'Cloud Computing', 'Azure', 'Generative AI Tools'],
	'running-ethereum-s-execution-consensus-nodes-on-azure-kubernetes-service': ['Azure', 'Ethereum', 'Web3', 'Cloud Computing', 'Software Engineering'],
	'running-ollama-on-azure-kubernetes-service': ['AI', 'Cloud Computing', 'Software Engineering', 'Azure', 'Kubernetes'],
	'running-quorum-in-a-single-docker-container-configuration': ['Quorum', 'Jp Morgan', 'Docker', 'Docker Compose', 'Ethereum'],
	'setting-up-consensys-s-quorum-key-manager-on-azure': ['Web3', 'Software Engineering', 'Cloud Computing', 'Azure', 'Ethereum'],
	'simple-decentralized-identifier-did-document-hosting-on-azure': ['Web3', 'Cloud Computing', 'Software Engineering', 'Azure', 'DevOps'],
	'simple-ethereum-wallets-management-with-azure-key-vault': ['Azure', 'Azure Functions', 'Software Development', 'Ethereum', 'Cloud Computing'],
	'simple-mastodon-node-deployment-on-azure': ['Azure', 'Web3', 'Software Engineering', 'Cloud Computing', 'Decentralization'],
	'simple-nft-interacting-azure-bot': ['Azure', 'NFT', 'Software Development', 'Cloud Computing', 'Bots'],
	'simple-terraform-wrapper-module-for-deploying-an-azure-blockchain-service': ['Azure', 'DevOps', 'Terraform', 'Blockchain', 'Cloud Computing'],
	'terraforming-a-serverless-etcd-cluster-on-azure': ['Azure', 'Etcd', 'Terraform', 'Kubernetes', 'DevOps'],
	'terraforming-a-serverless-mongodb-replica-set-with-split-horizon-dns-on-azure-and-cloudflare': ['Azure', 'DevOps', 'MongoDB', 'Terraform', 'Cloudflare'],
	'terraforming-load-balanced-multi-region-hyperledger-besu-nodes-on-azure': ['Azure', 'Terraform', 'Ethereum', 'Cloud Computing', 'Cryptocurrency'],
	'use-auth0-jwt-tokens-for-authenticating-to-a-hyperledger-besu-node': ['Hyperledger', 'Auth0', 'Ethereum', 'OAuth', 'JWT'],
	'using-a-node-js-script-to-upload-a-folder-to-a-remote-ipfs-node': ['IPFS', 'NodeJS', 'NPM'],
	'using-azure-api-management-to-limit-access-to-a-parity-ethereum-node': ['Ethereum', 'Azure', 'Containers', 'Parity', 'Api Management'],
	'using-azure-devops-pipelines-to-build-a-solidity-smart-contract': ['Solidity', 'Azure DevOps', 'Azure Pipelines', 'Ethereum', 'Smart Contracts'],
	'using-azure-pipelines-to-generate-a-net-package-from-a-solidity-contract-s-abi': ['Solidity', 'Ethereum', 'Smart Contracts', 'DevOps', 'Dotnet'],
	'using-generative-ai-for-a-self-evolving-software-component': ['OpenAI', 'Software Development', 'Cloud Computing', 'Software Engineering', 'AI'],
};

const base = path.resolve('src/content/blog');
let updated = 0;
const missing = [];

for (const [slug, tags] of Object.entries(TAGS)) {
	const file = path.join(base, slug, 'index.md');
	let txt;
	try {
		txt = await fs.readFile(file, 'utf8');
	} catch {
		missing.push(slug);
		continue;
	}

	// Split frontmatter (between the first two `---`) from the body.
	const close = txt.indexOf('\n---', 4);
	let fm = txt.slice(0, close);
	const body = txt.slice(close); // begins with "\n---"

	// Drop any pre-existing tags block, then append a fresh one.
	fm = fm.replace(/\ntags:(?:\n {2}- .*)*/g, '');
	const yaml = '\ntags:\n' + tags.map((t) => `  - ${JSON.stringify(t)}`).join('\n');

	await fs.writeFile(file, fm + yaml + body, 'utf8');
	updated++;
}

console.log(`Tagged ${updated} posts.`);
if (missing.length) console.warn('Missing folders:', missing.join(', '));
