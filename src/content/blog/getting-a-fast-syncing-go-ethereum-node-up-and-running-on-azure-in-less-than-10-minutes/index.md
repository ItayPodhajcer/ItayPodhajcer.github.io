---
title: "Getting a Fast-Syncing Go Ethereum Node Up and Running on Azure in Less Than 10 Minutes"
description: "As Ethereum’s mainnet state continue to grow, it also lengthens the time it takes to fast-sync a node, specifically, a Go Ethereum node…"
pubDate: "2021-07-19T14:24:43.289Z"
heroImage: "./1_-keWwaWuEBimGC_0qlhHqA.png"
heroImageAlt: "Getting a Fast-Syncing Go Ethereum Node Up and Running on Azure in Less Than 10 Minutes"
tags:
  - "Azure"
  - "Ethereum"
  - "DevOps"
  - "Cloud Computing"
  - "Software Engineering"
---

As Ethereum’s `mainnet` state continue to grow, it also lengthens the time it takes to fast-sync a node, specifically, a Go Ethereum node (\`geth\` for short), which we will be deploying in this article. Although common scenarios for running a node as part of a system would do well with running a light sync, as it allows transmitting transactions to the network, but some scenarios, like reading the transactions pool of the network, require a fast (or full) sync.

### The Problem

Now, although it’s called a “fast” sync, if hardware isn’t strong enough, more than an average workstation, it would be anything but fast. and one of the main reasons for that, is its demand for high input/output operations per second (IOPS), due to the large amount of data (state tries) that needs to be written to disk.

### The Solution

To solve that problem, we will be deploying a \`geth\` node on a storage optimized virtual machine (Lsv2 series), which in addition to its OS drive, it has directly mapped NVMe storage, targeted specifically for workloads requiring low latency and high throughput. By using a L8s v2 virtual machine instance, we should be able to sync in less than 24 hours, instead of weeks (like when trying to use a container with allocated 4 CPU/16GB/Mounted SSD).

### Prerequisites

As we will be deploying on Azure by using a Terraform script, the following will need to be installed on the workstation:

-   Azure CLI: installation guide is available [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).
-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   An SSH client of choice.

### The Example

If you really want to get you get your node up and running in less than 10 minutes, you can just clone the example GitHub repository and run the Terraform script:

> [**GitHub - ItayPodhajcer/terraform-geth-azure-vm**](https://github.com/ItayPodhajcer/terraform-geth-azure-vm)
> 
> Contribute to ItayPodhajcer/terraform-geth-azure-vm development by creating an account on GitHub.

The script will:

-   Create an L8s v2 VM (with all the required dependencies).
-   Create an SSH key (and save it to the local disk).
-   Run a script that installs and starts running `geth` as a service.

### The script

For brevity, I’ll be only going over the `geth` specific areas of the script, as the rest is straight forward virtual machine deployment.

The first `geth` specific configuration is the ports we are going to open using a network security group, which are:

-   Port 22/TCP — for SSH connections.
-   Port 30303/TCP — Ethereum standard listening port.
-   Port 30303/UDP — Ethereum standard discovery port.
-   Port 8545/TCP — Ethereum standard HTTP port.
-   Port 8546/TCP — Ethereum standard Web Sockets port.

```hcl
resource "azurerm_network_security_group" "this" {
  name                = "nsg-${local.deployment_name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name

  security_rule {
    name                       = "SSH"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "ETH_Listen"
    priority                   = 1002
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "30303"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "ETH_Discovery"
    priority                   = 1003
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Udp"
    source_port_range          = "*"
    destination_port_range     = "30303"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "ETH_JSON_RPC_HTTP"
    priority                   = 1004
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8545"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "ETH_JSON_RPC_WS"
    priority                   = 1005
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8546"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}
```

Next, we will create a template `systemd` service file to install `geth` as service that starts automatically after system restarts (so we don’t need to connect to the VM run the `geth` command manually each time):

```ini
[Unit]
Description=Go Ethereum

[Service]
Type=simple
ExecStart=/usr/bin/geth --syncmode "fast" --http --ws --http.addr 0.0.0.0 --ws.addr 0.0.0.0 --http.corsdomain '*' --ws.origins '*' --http.api eth,net,web3,personal --ws.api eth,net,web3,personal

User=${vm_user}
Group=${vm_user}

[Install]
WantedBy=default.target
```

Note that the `geth` command enables both HTTP and Web Sockets endpoints, and permits the `ETH`, `NET`, `WEB3`, and `PERSONAL` APIs on both endpoints, from any host (wildcard CORS).

Now that we have the service file, we need a template `bash` script that will:

-   Create the data folder.
-   Create a file system on the NVMe drive (we will be using `XFS`).
-   Mount the NVMe drive to the data folder.
-   Install `geth.`
-   Install the `systemd` service file.
-   Enable the service.
-   And lastly, start the service.

```bash
#!/bin/bash
blkid --match-token TYPE=xfs ${nvme_device_name} || mkfs --type xfs -f ${nvme_device_name}
mkdir /home/${vm_user}/.ethereum
mount ${nvme_device_name} /home/${vm_user}/.ethereum
chown ${vm_user}:${vm_user} /home/${vm_user}/.ethereum
add-apt-repository -y ppa:ethereum/ethereum
apt-get update
apt-get install ethereum -y
echo "${nvme_device_name} ~/.ethereum xfs defaults,nofail 0 2" >> /etc/fstab
echo "${geth_service}" > /etc/systemd/system/geth.service
systemctl daemon-reload
systemctl enable geth.service
systemctl start geth.service
```

The service template will be passed to the entry point script template as a Terraform template variable, along with additional values such as the virtual machine’s username and the NVMe device name, and later `base64` enncoded:

```hcl
locals {
  deployment_name = "gethvm"
  location        = "eastus"
  admin_username  = "${local.deployment_name}user"
  geth_service = templatefile("${path.module}/geth.tpl", {
    vm_user = local.admin_username
  })
  entrypoint_script = templatefile("${path.module}/entrypoint.tpl", {
    nvme_device_name = "/dev/nvme0n1"
    vm_user          = local.admin_username
    geth_service     = local.geth_service
  })
  entrypoint_base64 = base64encode(local.entrypoint_script)
}
```

And use the `base64` encoded script in the `custom_data` field of the Terraform \`azurerm\_linux\_virtual\_machine\` resource:

```hcl
resource "azurerm_linux_virtual_machine" "this" {
  name                  = "vm-${local.deployment_name}"
  location              = azurerm_resource_group.this.location
  resource_group_name   = azurerm_resource_group.this.name
  network_interface_ids = [azurerm_network_interface.this.id]
  size                  = "Standard_L8s_v2"
  custom_data           = local.entrypoint_base64

  os_disk {
    name                 = "disk-${local.deployment_name}"
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "UbuntuServer"
    sku       = "18.04-LTS"
    version   = "latest"
  }

  computer_name                   = "vm-${local.deployment_name}"
  admin_username                  = local.admin_username
  disable_password_authentication = true

  admin_ssh_key {
    username   = "${local.deployment_name}user"
    public_key = tls_private_key.this.public_key_openssh
  }
}
```

Now we are ready to `azure login` and then `terraform apply` our script.

### Testing The Node

To test the node, and make sure it is up and running (and syncing!), you can SSH to the virtual machine, and run the `systemctl status geth` to see the logs that were printed.

### Conclusion

Although the deployment discussed in this article is using production grade hardware, some of its configuration should be hardened in a real production deployment, for example limiting SSH access, closing HTTP/Web Sockets ports if they are not used, and limiting CORS hosts to name a few.
