---
title: "Terraforming Load Balanced Multi-Region Hyperledger Besu Nodes on Azure"
description: "Hyperledger Besu, an enterprise ready Ethereum client developed by PegaSys, can be used for both private networks and public networks such…"
pubDate: "2020-02-24T23:04:14.466Z"
heroImage: "./1_u-NS63TPXINuYWHScxbEzA.png"
heroImageAlt: "Terraforming Load Balanced Multi-Region Hyperledger Besu Nodes on Azure"
mediumUrl: "https://medium.com/@itaypodhajcer/terraforming-load-balanced-multi-region-hyperledger-besu-nodes-on-azure-c9c705b72728"
tags:
  - "Azure"
  - "Terraform"
  - "Ethereum"
  - "Cloud Computing"
  - "Cryptocurrency"
---

[Hyperledger Besu](https://www.hyperledger.org/projects/besu) is an enterprise-ready Ethereum client developed by [PegaSys](https://pegasys.tech/). It can be used for both private networks and public networks such as `mainnet`. Its main advantages over traditional Ethereum clients (such as Go Ethereum and Parity) are:

-   Its support for multiple consensus algorithms including PoW (Proof-of-Work) to allow it to operate as a regular Ethereum client and PoA (Proof-of-Authority) such as IBFT (Istanbul Byzantine Fault Tolerant) and Clique for more advanced scenarios.
-   Transaction privacy between parties and node.
-   Node and account permissioning on the network.
-   Modular client architecture, improving and simplifying development and upgradability in future versions or forks of the codebase.

As a provider of a blockchain based solution, to ensure high availability and redundancy, you would probably want to deploy multiple nodes on different regions and distribute the traffic between those node depending on load and failures.

Such deployments can be automated with a tool such as [Terraform](https://www.terraform.io/), which enable a concept called Infrastructure-as-Code (IaC), meaning, we can describe an entire deployment using scripts that define the components of our infrastructure and how those components related to one another.

### Prerequisites

As we will be using Terraform to deploy to Azure we will need the following:

-   Install Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).
-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).

Once we have both tools, we can start working on our scripts.

### GitHub Repository

A repository with a complete example of deploying three Hyperledger Besu nodes on three different regions in Azure with an Azure Traffic Manager that routes traffic to those nodes can be found here:

> [**GitHub - ItayPodhajcer/hyperledger-besu-azure-terraform**](https://github.com/ItayPodhajcer/hyperledger-besu-azure-terraform)
> 
> Contribute to ItayPodhajcer/hyperledger-besu-azure-terraform development by creating an account on GitHub.

### The Modules

To keep our deployment scripts organized and as simple as possible, we will break the scripts in to composable modules. Each module needs to have its own folder and in it the `main.tf` file, and if needed, `variables.tf` and `outputs.tf` files.

-   We will start by defining a module for creating resource groups, which accepts a name and location and returns the name of the created group (this allows as to do some internal manipulations on the name if we want to):

```hcl
resource "azurerm_resource_group" "this" {
  name     = var.name
  location = var.location
}
```

```hcl
variable "name" {
  type        = string
  description = "Resource group name."
}

variable "location" {
  type        = string
  description = "Resource group location."
}
```

```hcl
output "this_name" {
  value       = azurerm_resource_group.this.name
  description = "Name of the created resource group."
}
```

-   Next, we define a module for creating traffic manager profiles, which accepts a name and a resource group name, and returns the generated name and the fully qualified domain name (FQDN):

```hcl
resource "azurerm_traffic_manager_profile" "this" {
  name                = var.name
  resource_group_name = var.resource_group_name

  traffic_routing_method = "Weighted"

  dns_config {
    relative_name = var.name
    ttl           = 100
  }

  monitor_config {
    protocol                     = "http"
    port                         = 8545
    path                         = "/"
    interval_in_seconds          = 30
    timeout_in_seconds           = 9
    tolerated_number_of_failures = 3
  }
}
```

```hcl
variable "name" {
  type        = string
  description = "Traffic manager profile name."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group name."
}
```

```hcl
variable "name" {
  type        = string
  description = "Traffic manager profile name."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group name."
}
```

-   Now that we have that, we can create the Azure Traffic Manager’s “entry point”. We need a module for creating traffic manager endpoints which will be used by Traffic Manager to communicate with our nodes. It will accept a name, a resource group name (where the Traffic Manager profile was placed), a profile name (the name of the Traffic Manager profile) and a target (the address of the node this endpoint will point to):

```hcl
resource "azurerm_traffic_manager_endpoint" "this" {
  name                = var.name
  resource_group_name = var.resource_group_name
  profile_name        = var.profile_name
  target              = var.target
  type                = "externalEndpoints"
  weight              = 100
}
```

```hcl
variable "name" {
  type        = string
  description = "Traffic manager endpoint name."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group name."
}

variable "profile_name" {
  type        = string
  description = "Traffic manager profile name."
}

variable "target" {
  type        = string
  description = "Traffic manager endpoint target."
}
```

-   We then define a module creating an Azure Container Instances resource that starts a Hyperledger Besu node. It will accept a name, a location, a resource group name (in which the resource will be created) and the external host name that will be used to access the node (the FQDN of the traffic manager profile). The module will return the FQDN of the created resource, so it can be later passed when creating a traffic manager endpoint:

```hcl
resource "azurerm_container_group" "this" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  ip_address_type     = "public"
  dns_name_label      = var.name
  os_type             = "Linux"

  container {
    name     = "hyperledger-besu"
    image    = "hyperledger/besu"
    cpu      = "1.0"
    memory   = "1.0"
    commands = ["besu", "--rpc-http-enabled", "--host-whitelist=${var.external_host_name}", "--rpc-http-cors-origins=*"]

    ports {
      port     = 8545
      protocol = "TCP"
    }
  }
}
```

```hcl
variable "name" {
  type        = string
  description = "Container group name."
}

variable "location" {
  type        = string
  description = "Container group location."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group name."
}

variable "external_host_name" {
  type        = string
  description = "The host name that will be used to access the node."
}
```

```hcl
output "this_fqdn" {
  value       = azurerm_container_group.this.fqdn
  description = "FQDN of the created container group."
}
```

Note that we will be running the Hyperledger Besu node with `--rpc-http-enabled` (to allow wallets to connect to the node), `--rpc-http-cors-origins=*` (some wallets pass `Origin: null` header which result in an error returned from the node if not all origins are allowed) and `--host-whitelist=<EXTERNAL HOST NAME>` (to allow the nodes to respond to requests with the host name of the traffic manager).

-   Our final module will be a composition of three modules we defined in previous steps, which will pack in a single reusable script a deployment to a single location. It will accept a location, a profile name (Traffic Manager), a profile resource group (taffic manager’s resource group), an external host name and a deployment name (a unique name for our entire deployment, more on that later):

```hcl
module "resource_group" {
  source = "../resource-group"

  name     = "rg-${var.deployment_name}-deployment-${var.location}"
  location = var.location
}

module "container_group" {
  source = "../besu-container-group"

  name                = "aci-${var.deployment_name}-${var.location}"
  location            = var.location
  resource_group_name = module.resource_group.this_name
  external_host_name  = var.external_host_name
}

module "traffic_manager_endpoint" {
  source = "../traffic-manager-endpoint"

  name                = "tme-${var.deployment_name}-${var.location}"
  resource_group_name = var.profile_resource_group
  profile_name        = var.profile_name
  target              = module.container_group.this_fqdn
}
```

```hcl
variable "location" {
  type        = string
  description = "Location to deploy."
}

variable "profile_name" {
  type        = string
  description = "Traffic manager profile name."
}

variable "profile_resource_group" {
  type        = string
  description = "Resource group containing the traffic manager profile."
}

variable "deployment_name" {
  type        = string
  description = "Name of the deployment."
}

variable "external_host_name" {
  type        = string
  description = "The host name that will be used to access the node."
}
```

### The Main Script

Now that all our modules are ready, we will create our main script (in a dedicated folder called “example”, in our case). It will define:

-   Define the Azure provider with a specific version
-   A resource group for the Traffic Manager
-   A Traffic Manager
-   And three-node deployments

And return the FQDN of the Traffic Manager, so we can copy it and use it to test our environment.

Note the definition of the local *deployment\_name* with the value of example. This value, as it is being used as part of the FQDN of some of the resources, must be a value that will not cause errors related to to already existing FQDNs.

```hcl
provider "azurerm" {
  version         = "=1.44.0"
}

locals {
  deployment_name = "example"
}

module "traffic_manager_resource_group" {
  source = "../modules/resource-group"

  name     = "rg-${local.deployment_name}-network-manager-eastus2"
  location = "eastus2"
}

module "traffic_manager" {
  source = "../modules/traffic-manager"

  name                = "tm-${local.deployment_name}"
  resource_group_name = module.traffic_manager_resource_group.this_name
}

module "eastus_location_deployment" {
  source = "../modules/location-deployment"

  location               = "eastus"
  deployment_name        = local.deployment_name
  profile_name           = module.traffic_manager.this_name
  profile_resource_group = module.traffic_manager_resource_group.this_name
  external_host_name     = module.traffic_manager.this_fqdn
}

module "westus_location_deployment" {
  source = "../modules/location-deployment"

  location               = "westus"
  deployment_name        = local.deployment_name
  profile_name           = module.traffic_manager.this_name
  profile_resource_group = module.traffic_manager_resource_group.this_name
  external_host_name     = module.traffic_manager.this_fqdn
}

module "centralus_location_deployment" {
  source = "../modules/location-deployment"

  location               = "centralus"
  deployment_name        = local.deployment_name
  profile_name           = module.traffic_manager.this_name
  profile_resource_group = module.traffic_manager_resource_group.this_name
  external_host_name     = module.traffic_manager.this_fqdn
}
```

```hcl
output "example_fqdn" {
  value       = module.traffic_manager.this_fqdn
  description = "FQDN of the entrypoint for the created infrastructure."
}
```

### Run The Deployment

Running our scripts only requires executing the following three commands:

1.  Login to Azure: `az login`.
2.  Initialize Terraform’s working directory: `terraform init <PATH TO MAIN SCRIPT FOLDER>`.
3.  Apply our scripts to our Azure subscription: `terraform apply <PATH TO MAIN SCRIPT FOLDER>` (you will be asked to type `yes` to actually execute the operation).

Once the deployment completes, you should see the FQDN of the Traffic Manager at the end of the output text. We can use that FQDN to construct a URL that can be accessed by any Ethereum-compatible wallet software to ensure that everything works.

Once we are done with our example, we can run `terraform destroy <PATH TO MAIN SCRIPT FOLDER>`, to remove all the resource that were created by the `apply` command.

### Conclusion

The above example is a very basic one. As Hyperledger Besu can be deployed in various scenarios, some will increase the complexity of the deployment (such as permissioned nodes configuration). Additionally, a production-grade deployment would likely also include a firewall, private virtual networks for the nodes, more than one node in each location and other parts that will also make the deployment more complex.
