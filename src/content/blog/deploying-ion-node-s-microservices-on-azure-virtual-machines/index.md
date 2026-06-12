---
title: "Deploying ION Node’s Microservices on Azure Virtual Machines"
description: "ION is a decentralized layer two, public, permissionless network for decentralized identifiers, which is developed and maintained by…"
pubDate: "2022-08-22T17:58:24.996Z"
heroImage: "./1_Bkn0QunN7HzW0Z6G4fmXQw.png"
heroImageAlt: "Deploying ION Node’s Microservices on Azure Virtual Machines"
mediumUrl: "https://medium.com/@itaypodhajcer/deploying-ion-nodes-microservices-on-azure-virtual-machines-b5c7c70cb3f5"
tags:
  - "Web3"
  - "Azure"
  - "Cloud Computing"
  - "Software Engineering"
  - "DevOps"
---

ION is a decentralized layer two, public, permissionless network for decentralized identifiers, which is developed and maintained by Decentralized Identity Foundation members and the community. Although its name, ION node, might suggest that the node is a single piece of software, like an Ethereum node for example, it is in fact comprised of a few pieces, which include a few non-ION specific components:

-   MongoDB database.
-   Bitcoin node.
-   IPFS node.

And two custom, purpose-built microservices:

-   ION’s bitcoin microservice (not to be confused with the bitcoin node).
-   ION’s core microservice.

In this article we will be covering the deployment of ION’s microservices on Azure Virtual Machines using terraform. For the other required components, you can take a look at some of my past articles for deployment examples:

-   MongoDB:   
    [Terraforming a Serverless MongoDB Replica Set with Split Horizon DNS on Azure and Cloudflare | by Itay Podhajcer | Microsoft Azure | Medium](https://medium.com/microsoftazure/terraforming-a-serverless-mongodb-replica-set-with-split-horizon-dns-on-azure-and-cloudflare-9687e37dacf1)
-   Bitcoin node:  
    [Getting a Bitcoin Full Node Up and Running on Azure in No Time with Bicep | by Itay Podhajcer | Microsoft Azure | Medium](https://medium.com/microsoftazure/getting-a-bitcoin-full-node-up-and-running-on-azure-in-no-time-with-bicep-a5fcb3080633?source=user_profile---------0----------------------------)
-   IPFS node:  
    [Running an InterPlanetary File System Node Using Azure Container Instances | by Itay Podhajcer | Cladular | Medium](https://medium.com/cladular/running-an-interplanetary-file-system-node-using-azure-container-instances-5627814a48f5?source=user_profile---------22----------------------------)

Or use any other deployment instructions from across the web.

### Prerequisites

Will be using Terraform and its `azurerm` provider, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

### Example Repository

A complete example Terraform script, which creates two virtual machines, installs the microservices and configures them as `systed` services, is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-ion-azure-vms**](https://github.com/ItayPodhajcer/terraform-ion-azure-vms)
> 
> Contribute to ItayPodhajcer/terraform-ion-azure-vms development by creating an account on GitHub.

### The Script

For brevity, I will only cover the area of the Terraform script that specifically installs and configures the microservices on the virtual machines using using scripts passed to the virtual machine resources through the `custom_data` field.

We will start by creating four JSON configuration files, two for the bitcoin microservice:

-   `bitcoin-config.tpl`

```json
{
  "bitcoinDataDirectory": "",
  "bitcoinFeeSpendingCutoffPeriodInBlocks": 1,
  "bitcoinFeeSpendingCutoff": 0.001,
  "bitcoinPeerUri": "http://${bitcoin_host}:8332",
  "bitcoinRpcUsername": "${bitcoin_user}",
  "bitcoinRpcPassword": "${bitcoin_password}",
  "bitcoinWalletOrImportString": "${bitcoin_wallet}",
  "databaseName": "ion-mainnet-bitcoin",
  "genesisBlockNumber": 667000,
  "logRequestError": true,
  "mongoDbConnectionString": "${mongo_uri}",
  "port": 3002,
  "sidetreeTransactionFeeMarkupPercentage": 1,
  "sidetreeTransactionPrefix": "ion:",
  "transactionPollPeriodInSeconds": 60,
  "valueTimeLockUpdateEnabled": false,
  "valueTimeLockAmountInBitcoins": 0,
  "valueTimeLockPollPeriodInSeconds": 600,
  "valueTimeLockTransactionFeesAmountInBitcoins": 0.0001
}
```

-   `bitcoin-versioning.tpl`

```
[
  {
    "startingBlockchainTime": 667000,
    "version": "1.0",
    "protocolParameters": {
      "feeLookBackWindowInBlocks": 100,
      "feeMaxFluctuationMultiplierPerBlock": 0.00001,
      "initialNormalizedFeeInSatoshis": 1000,
      "valueTimeLockDurationInBlocks": 4500
    }
  }
]
```

And two files for the core microservice:

-   `core-config.tpl`

```json
{
  "batchingIntervalInSeconds": 600,
  "blockchainServiceUri": "http://${ion_bitcoin_host}:3002",
  "databaseName": "ion-mainnet-core",
  "didMethodName": "ion",
  "ipfsHttpApiEndpointUri": "http://${ipfs_host}:5001",
  "maxConcurrentDownloads": 20,
  "mongoDbConnectionString": "${mongo_uri}",
  "observingIntervalInSeconds": 60,
  "port": 3000
}
```

-   `core-versioning.tpl`

```
[
  {
    "startingBlockchainTime": 667000,
    "version": "1.0"
  }
]
```

Note that both config files contain place holders for configurations that will be populated by both external data that will be supplied to the script when executing it (like the MongoDB, Bitcoin and IPFS hostnames), and some will be populated using that generated during the execution of the script (like the bitcoin microservice hostname required by the core microservice).

To combine the JSON files into an entry script that will execute when the VM starts for the first time, we will create a module that accepts either the bitcoin microservice files or the core microservice files and creates a script that will install and configure that service.

The script template file which installs all the basic dependencies, clones the ION GitHub repository, builds the code, places the JSON files in the VM and configures the `systemd` service, should look like this:

```bash
#!/bin/bash
curl -fsSL https://deb.nodesource.com/setup_14.x | sudo -E bash -
sudo apt update
sudo apt install -y git
sudo apt install -y nodejs
sudo apt install -y npm
sudo apt install -y build-essential
cd /home/${vm_user}
git clone https://github.com/decentralized-identity/ion
cd ion
npm i
npm run build
echo '${ion_config}' > /home/${vm_user}/ion/config.json
echo '${ion_versioning}' > /home/${vm_user}/ion/versioning.json
echo '${ion_service}' > /etc/systemd/system/ion.service
systemctl daemon-reload
systemctl enable ion.service
systemctl start ion.service
```

The module will also include a template for a service file:

```ini
[Unit]
Description=${service_description}

[Service]
Type=simple
WorkingDirectory=/home/${vm_user}/ion
ExecStart=/usr/bin/npm run ${service_name}
Environment=ION_BITCOIN_CONFIG_FILE_PATH=/home/${vm_user}/ion/config.json
Environment=ION_BITCOIN_VERSIONING_CONFIG_FILE_PATH=/home/${vm_user}/ion/versioning.json

User=${vm_user}
Group=${vm_user}

[Install]
WantedBy=default.target
```

And lastly, a `main.tf` file that combines everything together using `locals`:

```hcl
locals {
  service = templatefile("${path.module}/service.tpl", {
    service_name        = var.service_name
    service_description = var.service_description
    vm_user             = var.vm_user
  })
  custom_data = templatefile("${path.module}/custom-data.tpl", {
    ion_config     = var.ion_config
    ion_versioning = var.ion_versioning
    ion_service    = local.service
    vm_user        = var.vm_user
  })
}
```

The output of this module can be used later when deploying the virtual machines.

As mentioned above, the complete code that includes both the above ION specific script parts and the creation of the virtual network, subnet, security group and virtual machine per microservice can be found in example GitHub repository.

### Testing The Deployment

Running `terraform apply` won’t be enough, as before deploying the two ION microservices, the MongoDB database, Bitcoin node and IPFS node should already be up and running. In the case of the Bitcoin node, it should also be already synchronized with the network, a process that takes some time to complete.

Once those dependencies are ready, the ION bitcoin node should start successfully, and only then will the ION core microservice also be able to start successfully.

To test the ION core microservice, check the following identifier using a browser (adjust the hostname to the core microservice’s hostname):

### Conclusion

Although this is a much more elaborate deployment than the options currently provided on ION’s GitHub repository ([here](https://github.com/decentralized-identity/ion)), it will require more effort to turn it into something production grade, like firewalls, multiple nodes for redundancy and even only making it available in the virtual private network for internal system operations.
