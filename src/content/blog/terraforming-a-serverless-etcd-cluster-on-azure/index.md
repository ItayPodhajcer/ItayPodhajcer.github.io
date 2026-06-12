---
title: "Terraforming a Serverless etcd Cluster on Azure"
description: "etcd, a distributed reliable key value store, is the mechanism used by Kubernetes to maintain the cluster’s configuration, but we don’t…"
pubDate: "2020-03-26T17:53:53.488Z"
heroImage: "./1_4RBFByfRgVnPmfw61A99ug.png"
heroImageAlt: "Terraforming a Serverless etcd Cluster on Azure"
mediumUrl: "https://medium.com/@itaypodhajcer/terraforming-a-serverless-etcd-cluster-on-azure-112cf9891c9"
tags:
  - "Azure"
  - "Etcd"
  - "Terraform"
  - "Kubernetes"
  - "DevOps"
---

etcd, a distributed reliable key value store, is the mechanism used by Kubernetes to maintain the cluster’s configuration, but we don’t have to deploy a Kubernetes cluster to use etcd in our infrastructure.

Configuration management is a very common requirement in distributed systems and having something like etcd deployed as part of a solution, can greatly increase the simplicity of maintaining a reliable, consistent and redundant source of configuration information. Further more, as it is possible to use emerging cloud based serverless solutions, such as Azure Container Instances, to deploy the nodes without the need to maintain and operate the underlying resources, the overall total cost of ownership is significantly reduced.

In this article we will be deploying a private 3 node etcd cluster on Azure and to do so we will be:

-   Using Azure Container Instances to deploy containerized nodes.
-   Use a virtual network, so our nodes are not exposed to the internet (which is usually the case when using etcd).
-   Use Azure Private DNS to register each nodes, so the nodes can communicate with each other using known host names (more on that later).
-   Use storage account file shares to store the nodes state.

### Prerequisites

As we will be using Terraform to deploy our nodes, and later us Azure CLI to ensure our nodes are synchronizing, we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

### Example Repository

The complete example of the etcd cluster deployment is available at the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-etcd-azure**](https://github.com/ItayPodhajcer/terraform-etcd-azure)
> 
> Contribute to ItayPodhajcer/terraform-etcd-azure development by creating an account on GitHub.

### The Configuration

We will be creating a main entry point configuration, which will include all the resources that are shared between all the nodes and a configuration module which will include the resources that dedicated for each node.

We will start by creating the module which configures a node’s dedicated resources. First we will define the module’s variables, which include a deployment name (a name used to identify resources related to a specific node), the resource group name, the location, the DNS zone name (to which an A host record will be added) and a network profile ID (required by Azure Container Instances when deployed to a virtual network):

```hcl
ariable "deployment_name" {
  type        = string
  description = "Deployment name."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group name."
}

variable "location" {
  type        = string
  description = "Private network location."
}

variable "etcd_initial_cluster" {
  type        = string
  description = "Initial cluster nodes URLs."
}

variable "zone_name" {
  type        = string
  description = "DNS zone name."
}

variable "network_profile_id" {
  type        = string
  description = "Network profile ID."
}
```

Next we will define the module’s configurations starting with a storage account with a file share dedicated for the etcd node (yes, we can use one storage account with all the file shares defined in it, but for exercise, we will be doing dedicated account for each node):

```hcl
resource "azurerm_storage_account" "this" {
  name                     = "strg${var.deployment_name}${var.location}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_kind             = "StorageV2"
  account_tier             = "Standard"
  account_replication_type = "LRS"
  static_website {}
}

resource "azurerm_storage_share" "this" {
  name                 = "data"
  storage_account_name = azurerm_storage_account.this.name
}
```

After that, we will define the Azure Container Instances resource, with the address type set to `private` and the network profile ID variable which indicates the `subnet` to which the container will be deployed. We will be using the `quay.io/coreos/etcd:v3.4.5` image and pass all the required parameters using environment variables:

```hcl
resource "azurerm_container_group" "this" {
  name                = "aci-${var.deployment_name}-${var.location}"
  location            = var.location
  resource_group_name = var.resource_group_name
  ip_address_type     = "private"
  network_profile_id  = var.network_profile_id
  os_type             = "Linux"

  container {
    name   = "etcd"
    image  = "quay.io/coreos/etcd:v3.4.5"
    cpu    = "0.5"
    memory = "1.5"

    environment_variables = {
      "ETCD_NAME"                        = var.deployment_name
      "ETCD_DATA_DIR"                    = "/${var.deployment_name}.etcd"
      "ETCD_LISTEN_PEER_URLS"            = "http://0.0.0.0:2380"
      "ETCD_LISTEN_CLIENT_URLS"          = "http://0.0.0.0:2379"
      "ETCD_CORS"                        = "*"
      "ETCD_INITIAL_CLUSTER_STATE"       = "new"
      "ETCD_INITIAL_CLUSTER"             = var.etcd_initial_cluster
      "ETCD_INITIAL_ADVERTISE_PEER_URLS" = "http://${var.deployment_name}.${var.zone_name}:2380"
      "ETCD_ADVERTISE_CLIENT_URLS"       = "http://${var.deployment_name}.${var.zone_name}:2380"
    }

    volume {
      name                 = "vol-${var.deployment_name}-${var.location}"
      mount_path           = "/${var.deployment_name}.etcd"
      storage_account_name = azurerm_storage_account.this.name
      storage_account_key  = azurerm_storage_account.this.primary_access_key
      share_name           = azurerm_storage_share.this.name
    }

    ports {
      port     = 2380
      protocol = "TCP"
    }

    ports {
      port     = 2379
      protocol = "TCP"
    }
  }
}
```

Note that we are using `0.0.0.0` for our listen URLs, which allows the container to listen on the external IP address, which is automatically allocated by Azure when the resource is created. Also, we are expecting `ETCD_INITIAL_CLUSTER` to be supplied by the root configuration, as this field requires the URLs of all the nodes in the cluster.

Lastly, we will create an A host record in the Private DNS Zone using the IP address of the newly created container resource:

```hcl
resource "azurerm_private_dns_a_record" "this" {
  name                = var.deployment_name
  zone_name           = var.zone_name
  resource_group_name = var.resource_group_name
  ttl                 = 300
  records             = [azurerm_container_group.this.ip_address]
}
```

We need an internal DNS in our solution, because the etcd configuration requires wither IP addresses or host names of the nodes when each node starts. Now because at the moment, Azure automatically allocates IP addresses when the resource is created, we need something else which will be known before the resource is create and that thing is a predefined host name (using our deployment name variable). Once we use a host name which is registered in the private DNS, the nodes will be able to resolve them to the IP address that was allocated by Azure.

Now that we are done with the module, we will create our root configuration file, starting with the Azure provider configuration and locals for the deployment name, location and zone name (which will be `example.com` for out example):

```hcl
provider "azurerm" {
  version = "=2.1.0"

  features {}
}

locals {
  deployment_name = "etcd"
  location        = "eastus"
  zone_name       = "example.com"
}
```

Then define a resource group for our deployment:

```hcl
resource "azurerm_resource_group" "this" {
  name     = "rg-${local.deployment_name}-deployment-${local.location}"
  location = local.location
}
```

Once we have a resource group, we can start defining resources that will be created in that resource group, starting with the virtual network, a subnet in that network and the network profile that will be used by the containers’:

```hcl
resource "azurerm_virtual_network" "this" {
  name                = "vnet-${local.deployment_name}-${local.location}"
  location            = local.location
  resource_group_name = azurerm_resource_group.this.name
  address_space       = ["10.0.0.0/24"]
}

resource "azurerm_subnet" "this" {
  name                 = "snet-${local.deployment_name}-${local.location}"
  resource_group_name  = azurerm_resource_group.this.name
  address_prefix       = "10.0.0.0/24"
  virtual_network_name = azurerm_virtual_network.this.name
  service_endpoints    = ["Microsoft.Storage"]

  delegation {
    name = "snet-delegation-${local.deployment_name}-${local.location}"

    service_delegation {
      name    = "Microsoft.ContainerInstance/containerGroups"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_network_profile" "this" {
  name                = "np-${local.deployment_name}-${local.location}"
  location            = local.location
  resource_group_name = azurerm_resource_group.this.name

  container_network_interface {
    name = "nic-${local.deployment_name}-${local.location}"

    ip_configuration {
      name      = "ipc-${local.deployment_name}-${local.location}"
      subnet_id = azurerm_subnet.this.id
    }
  }
}
```

Note that we defined the `Microsoft.Storage` service endpoint, which allows resources from inside the subnet to access storage accounts, and, to allow the containers to be deployed to this network, it is required to define a delegation for container instance resources.

Next we create the private DNS and link it to the virtual network:

```hcl
resource "azurerm_private_dns_zone" "this" {
  name                = local.zone_name
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "this" {
  name                  = "dns-link"
  resource_group_name   = azurerm_resource_group.this.name
  private_dns_zone_name = azurerm_private_dns_zone.this.name
  virtual_network_id    = azurerm_virtual_network.this.id
}
```

And lastly, we will create three instances of our etcd node module (note that we use the deployment name and a number for the node’s deployment name):

```hcl
module "etcd_node1" {
  source = "../modules/etcd-node"

  deployment_name      = "${local.deployment_name}1"
  location             = local.location
  resource_group_name  = azurerm_resource_group.this.name
  network_profile_id   = azurerm_network_profile.this.id
  etcd_initial_cluster = "${local.deployment_name}1=http://${local.deployment_name}1.${local.zone_name}:2380,${local.deployment_name}2=http://${local.deployment_name}2.${local.zone_name}:2380,${local.deployment_name}3=http://${local.deployment_name}3.${local.zone_name}:2380"
  zone_name            = local.zone_name
}

module "etcd_node2" {
  source = "../modules/etcd-node"

  deployment_name      = "${local.deployment_name}2"
  location             = local.location
  resource_group_name  = azurerm_resource_group.this.name
  network_profile_id   = azurerm_network_profile.this.id
  etcd_initial_cluster = "${local.deployment_name}1=http://${local.deployment_name}1.${local.zone_name}:2380,${local.deployment_name}2=http://${local.deployment_name}2.${local.zone_name}:2380,${local.deployment_name}3=http://${local.deployment_name}3.${local.zone_name}:2380"
  zone_name            = local.zone_name
}

module "etcd_node3" {
  source = "../modules/etcd-node"

  deployment_name      = "${local.deployment_name}3"
  location             = local.location
  resource_group_name  = azurerm_resource_group.this.name
  network_profile_id   = azurerm_network_profile.this.id
  etcd_initial_cluster = "${local.deployment_name}1=http://${local.deployment_name}1.${local.zone_name}:2380,${local.deployment_name}2=http://${local.deployment_name}2.${local.zone_name}:2380,${local.deployment_name}3=http://${local.deployment_name}3.${local.zone_name}:2380"
  zone_name            = local.zone_name
}
```

### Deploying The Configuration

Now that the configuration is complete, we can run Terraform to deploy it:

Once the configuration is validated, you will be asked to approve the execution of the deployment. Note that even after the deployment is complete, it might take a few minutes until all three nodes are running (the containers will restart until all the required DNS records can be resolved).

### Testing The Nodes

To test the nodes, will be connecting to one of them, set a key, and then connect to the other two to see that the value synchronized.

To connect to a node you can run the following Azure CLI command, and you will get a command prompt on the remote container:

Once connected, you will need to run the following command on the first node to write a key:

The result of the command should be `OK`.

Once you created the key, connect to the other nodes and run the following command to get the value of the key you created on the first node:

You should get a result similar to:

This result indicates that the nodes can communicate with each other and synchronize the data.

### Conclusion

The above example is a proof-of-concept for deploying a serverless etcd cluster and, although it is running in a protected virtual network, there are many more options to consider when deploying a production cluster, such as usage of HTTPS, multi-region redundancy (which should be achievable by using virtual network peering) and authentication
