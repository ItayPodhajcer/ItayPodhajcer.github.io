---
title: "Creating a JavaScript GitHub Action for Generating Ethereum Addresses"
description: "GitHub Actions allow us to automate software workflows, such as continuous integration and deployment (CI and CD), directly from our…"
pubDate: "2020-07-13T14:36:15.965Z"
heroImage: "./1_R_cytTlgLFDi3_H0Qh8lGQ.png"
heroImageAlt: "Creating a JavaScript GitHub Action for Generating Ethereum Addresses"
tags:
  - "GitHub"
  - "NodeJS"
  - "JavaScript"
  - "Ethereum"
  - "Solidity"
---

GitHub Actions allow us to automate software workflows, such as continuous integration and deployment (CI and CD), directly from our GitHub repositories. A GitHub action is a step inside a workflow that performs a specific task, which in our case, will enable generating an Ethereum address inside a workflow, using an arbitrary string as input (usually a public key).

Such action can be useful for a scenario such as a `genesis.json` file that is being generated as part as a workflow (that is later copied to a Docker image), which includes pre-population of a compiled smart contract, or an account with pre-allocated balance, both requiring an address as part of their configuration.

### Prerequisites

We will be using GitHub’s `npm` packages in our action, so Node.js needs to be installed on our workstation, which is available [here](https://nodejs.org/en/download/).

### Example Repository

The complete GitHub action example can be downloaded or cloned from the following GitHub repository:

> [**GitHub - ItayPodhajcer/generate-eth-address: GitHub action for generating Ethereum addresses**](https://github.com/ItayPodhajcer/generate-eth-address)
> 
> GitHub action for generating Ethereum addresses. Contribute to ItayPodhajcer/generate-eth-address development by…

The GitHub action is also published from the above repository to the GitHub marketplace and can be used in other GitHub workflows:

> [**Generate Ethereum Address - GitHub Marketplace**](https://github.com/marketplace/actions/generate-ethereum-address)
> 
> Generates an Ethereum address using a given source data value

### Setup the Project

The initial setup for our action is simple:

-   Create a new directory
-   Run `npm init` and set the package name to something like `generate-eth-address` (you can leave the rest with the defaults).
-   Run `npm install @actions/core` which holds core functionality for GitHub actions.
-   Run `npm install keccak256` which we will be using to generate a hash for the Ethereum address.

### Writing the Action

We will start by writing the `action.yml` metadata file required by GitHub, which includes information such as the inputs and outputs of the action, the main entry point, the required Node.js version, the action name, the description and more:

```yaml
name: 'Generate Ethereum Address'
description: 'Generates an Ethereum address using a given source data value'
branding:
  icon: command
  color: green
inputs:
  data:  # Source data
    description: 'Source data used to generate the address (usually a public key)'
    required: true
outputs:
  address: # Ethereum address
    description: 'Generated Ethereum address'
runs:
  using: 'node12'
  main: 'index.js'
```

Next, we will write the action’s code inside the `index.js` file. The code will take the input passed to the action using `core.getInput(‘data’)`, create a has from it using `keccak256`, create a `hex` string from the result using `toString(‘hex’)`, take the rightmost 20 (2 characters per byte) using `slice(-40)` (as defined by the [Ethereum yellow paper](https://ethereum.github.io/yellowpaper/paper.pdf)) and lastly, pass the result out using `core.setOutput(‘address’, address)`:

```javascript
const core = require('@actions/core');
const keccak256 = require('keccak256');

try {
    const data = core.getInput('data') || 'VelocityDidRegistry';
    
    if (!data) {
        throw new Error('No source data provided')
    }

    console.log(`Source data: ${data}`);

    const address = `0x${keccak256(data)
        .toString('hex')
        .slice(-40)}`;
    core.setOutput('address', address);
    console.log(`Generated address: ${address}`);
} catch (ex) {
    core.setFailed(ex.message);
    console.error(ex.message);
}
```

### Testing the Action

To test the action, we can write a simple GitHub workflow and include it ubnder the `.github/workflows` directory, which in turn, is located under the actions root directory. The workflow will check out the repository, install dependencies, run the action and print the result, like the following:

```yaml
name: Test Action Workflow
on:
  push:
    paths-ignore:
      - '**/*.md'

jobs:
  test-action:
    name: Test Action
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v1
      - name: Install Dependencies
        run: npm install
      - name: Generate Ethereum Address
        uses: ./
        id: ethgen
        with:
          data: '...PUBLIC-KEY...'
      - name: Print Gernerated Address
        run: 'echo "Ethereum address: ${{ steps.ethgen.outputs.address }}"'
```

### Conclusion

Writing GitHub actions is a straightforward process, both for published actions and actions that are used locally in the same repository. On top of allowing us to encapsulate redundant tasks, they can also help us in other aspects, such as improving security by allowing as to pass secrets as input parameters instead of environment variables that get printed in the execution logs. Overall, they are a great tool for improving our GitHub workflows, therefore it is highly encouraged to write them and even publish them if you feel like giving back to the community.
