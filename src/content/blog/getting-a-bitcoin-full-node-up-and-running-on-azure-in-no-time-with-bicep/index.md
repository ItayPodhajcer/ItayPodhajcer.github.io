---
title: "Getting a Bitcoin Full Node Up and Running on Azure in No Time with Bicep"
description: "Bitcoin, which requires no introduction, the world’s first crypto currency, is more than just wallets and balances. Like other blockchain…"
pubDate: "2022-03-21T13:50:39.622Z"
heroImage: "./1_sFilHI9T4VC8YsV_CYiZLg.png"
heroImageAlt: "Getting a Bitcoin Full Node Up and Running on Azure in No Time with Bicep"
tags:
  - "Azure"
  - "Bitcoin"
  - "DevOps"
  - "Cloud Computing"
  - "Software Engineering"
---

Bitcoin, which requires no introduction, the world’s first crypto currency, is more than just wallets and balances. Like other blockchain technologies, such as Ethereum which was discussed in some of my other articles, it is a network of nodes both communicating with each other and allowing end users to perform and read transactions.

In this article, we will be using Microsoft’s new declarative domain specific language (DSL) for deploying Azure resources, Bicep, to deploy and start a Bitcoin full node on an Azure VM.

### Prerequisites

To deploy resources with scripts written in Bicep, we just need to have the latest version of the Azure CLI that can be found here: [https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)

### Example Repository

A complete Bicep script for deploying a Bitcoin full node on an Azure VM can be found in the following GitHub repository:

> [**GitHub - ItayPodhajcer/bicep-bitcoin-azure-vm**](https://github.com/ItayPodhajcer/bicep-bitcoin-azure-vm)
> 
> Contribute to ItayPodhajcer/bicep-bitcoin-azure-vm development by creating an account on GitHub.

### The Script

Our script will be divided into four parts:

-   Main entry point which also includes the creation of a resource group.
-   Creation of the virtual network for the VM.
-   Creation of the network interface the VM.
-   Creation of the VM.

We will start by creating the Bicep script for creating the virtual network with one subnet:

```bicep
param deploymentName string
param location string

resource vnet 'Microsoft.Network/virtualNetworks@2021-05-01' = {
  name: 'vnet-${deploymentName}'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'snet-${deploymentName}'
        properties: {
          addressPrefix: '10.0.1.0/24'
        }
      }
    ]
  }
}

output subnetId string = vnet.properties.subnets[0].id
```

Next, we will create the Bicep script that creates the public IP, network security group and network interface:

```bicep
param deploymentName string
param location string
param subnetId string

resource pip 'Microsoft.Network/publicIPAddresses@2021-05-01' = {
  name: 'pip-${deploymentName}'
  location: location
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2021-05-01' = {
  name: 'nsg-${deploymentName}'
  location: location
  properties: {
    securityRules: [
      {
        name: 'SSH'
        properties: {
          priority: 1001
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '22'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'BITCOIN'
        properties: {
          priority: 1002
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '8333'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
    ]
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2021-05-01' = {
  name: 'nic-${deploymentName}'
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'pip-${deploymentName}'
        properties: {
          subnet: {
            id: subnetId
          }
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: {
            id: pip.id
          }
        }
      }
    ]
    networkSecurityGroup: {
      id: nsg.id
    }
  }
}

output networkInterfaceId string = nic.id
```

Note that the network security group has ports 22 for SSH, so we can open a remote shell on the VM, and 8333, for Bitcoin internode communication, opened.

Now we can use the virtual network and network interface to create the VM:

```bicep
param deploymentName string
param location string
param networkInterfaceId string
param adminUsername string
param sshPublicKey string
param bitcoinPassword string

var serviceFile = format(loadTextContent('./bitcoind.tpl'), adminUsername)
var entrypointFile = format(loadTextContent('./entrypoint.tpl'), adminUsername, bitcoinPassword, serviceFile)

resource vm 'Microsoft.Compute/virtualMachines@2021-11-01' = {
  name: 'vm-${deploymentName}'
  location: location
  properties: {
    networkProfile: {
      networkInterfaces: [
        {
          id: networkInterfaceId
        }
      ]
    }
    hardwareProfile: {
      vmSize: 'Standard_L8s_v2'
    }
    storageProfile: {
      osDisk: {
       name:'disk-${deploymentName}' 
       createOption: 'FromImage'
       caching: 'ReadWrite'
       managedDisk: {
         storageAccountType: 'Premium_LRS'
       }
      }
      imageReference: {
        publisher: 'Canonical'
        offer: 'UbuntuServer'
        sku: '18.04-LTS'
        version: 'latest'
      }
    }
    osProfile: {
      computerName: 'vm-${deploymentName}'
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              keyData: sshPublicKey
              path: '/home/${adminUsername}/.ssh/authorized_keys'
            }
          ]
        }
      }
    }
    userData: base64(entrypointFile)
  }
}
```

This script expects a public key for SSH connections and a password for the Bitcoin node, which will be supplied when the script is executed using the Azure CLI.

As we need to install and start the Bitcoin node app on the VM, we also have two additional files that are injected by the Bicep script to the VM.

One is the `systemd` service file:

```ini
[Unit]
Description=Bitcoin daemon

After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/home/{0}/.bitcoin/bitcoin-22.0/bin/bitcoind -daemonwait \
                                                       -pid=/run/bitcoind/bitcoind.pid \
                                                       -datadir=/home/{0}/.bitcoin \
                                                       -conf=/home/{0}/.bitcoin/bitcoin.conf
Type=forking
PIDFile=/run/bitcoind/bitcoind.pid
Restart=on-failure
TimeoutStartSec=infinity
TimeoutStopSec=600

User={0}
Group={0}

[Install]
WantedBy=multi-user.target
```

And the second one is the script that will be run when the VM starts, which mounts a volume, grants permissions, installs the Bitcoin app and sets up the Bitcoin service:

```bash
#!/bin/bash
blkid --match-token TYPE=xfs /dev/nvme0n1 || mkfs --type xfs -f /dev/nvme0n1
mkdir /home/{0}/.bitcoin
mkdir /run/bitcoind
mount /dev/nvme0n1 /home/{0}/.bitcoin
chown {0}:{0} /home/{0}/.bitcoin
chown {0}:{0} /run/bitcoind
cd /home/{0}/.bitcoin
wget https://bitcoincore.org/bin/bitcoin-core-22.0/bitcoin-22.0-x86_64-linux-gnu.tar.gz
tar -xzf ./bitcoin-22.0-x86_64-linux-gnu.tar.gz
rm ./bitcoin-22.0-x86_64-linux-gnu.tar.gz
echo "
server=1
rpcuser=admin
rpcpassword={1}
" > /home/{0}/.bitcoin/bitcoin.conf
echo "/dev/nvme0n1 ~/.bitcoin xfs defaults,nofail 0 2" >> /etc/fstab
echo "{2}" > /etc/systemd/system/bitcoind.service
systemctl daemon-reload
systemctl enable bitcoin.service
systemctl start bitcoin.service
```

Lastly, we create the main entry point Bicep script, which connects all the previous pieces together:

```bicep
targetScope = 'subscription'

param location string = 'eastus'
param sshPublicKey string
param bitcoinPassword string

var deploymentName = 'bitcoinvm'
var adminUsername = '${deploymentName}user'

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: 'rg-${deploymentName}-${location}'
  location: location
}

module vnet 'modules/vnet.bicep' = {
  name: 'vnet'
  scope: resourceGroup(rg.name)
  params: {
    deploymentName: deploymentName
    location: location
  }
}

module nic 'modules/nic.bicep' = {
  name: 'nic'
  scope: resourceGroup(rg.name)
  params: {
    deploymentName: deploymentName
    location: location
    subnetId: vnet.outputs.subnetId
  }
}

module vm 'modules/vm.bicep' = {
  name: 'vm'
  scope: resourceGroup(rg.name)
  params: {
    deploymentName: deploymentName
    location: location
    networkInterfaceId: nic.outputs.networkInterfaceId
    adminUsername: adminUsername
    sshPublicKey: sshPublicKey
    bitcoinPassword: bitcoinPassword
  }
}
```

### Running The Script

First, we need to generate a key pair that can be used for SSH connections, and we will do that by running the following command:

Now that we have a key, when can run the command that executes our script and deploys the resources:

Make sure you set `sshPublicKey` to the contents of the `.pub` file that was generated in the previous step, and `bitcoinPassword` to whatever value you want to use as the password for your Bitcoin full node.

Once the execution of the script is complete, the Bitcoin full node will start synchronizing with the network (also called the initial block download), which might take a while. You can use SSH to connect to your VM, so you can check the node’s status and interact with it.

### Conclusion

The Bitcoin node can be configured further to allow JSON RPC connections, which allow other apps and systems to communicate with it from outside the VM, but it is recommended that other restrictions and safety mechanisms are in place before doing so (such as local virtual network restrictions, source IP restrictions, etc.).
