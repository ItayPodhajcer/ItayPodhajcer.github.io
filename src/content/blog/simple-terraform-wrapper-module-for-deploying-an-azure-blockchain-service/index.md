---
title: "Simple Terraform Wrapper Module for Deploying an Azure Blockchain Service"
description: "Azure Blockchain Service, Microsoft Azure’s managed blockchain offering, delivers a simple deployment of a multi-node blockchain solution…"
pubDate: "2021-02-15T18:28:02.425Z"
heroImage: "./1_HoupioN3zptefzoQxOUGAA.png"
heroImageAlt: "Simple Terraform Wrapper Module for Deploying an Azure Blockchain Service"
tags:
  - "Azure"
  - "DevOps"
  - "Terraform"
  - "Blockchain"
  - "Cloud Computing"
---

Azure Blockchain Service, Microsoft Azure’s managed blockchain offering, delivers a simple deployment of a multi-node blockchain solution, without the hustle of defining and managing the underlying virtual machines, storage and network.

As the service is still in preview, at least at the moment, some scenarios that are common with cloud resources that are already in general availability, are not available for the Azure Blockchain Service. One of those scenarios, deploying the resource using Terraform, can be overcome by wrapping the existing Azure Resource Manager (ARM) template for the service with a simple Terraform module, and that is exactly what this article will be covering.

### The Source Code

A complete implementation of the module, including two examples of how to use the module can be found in this GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-azurerm-blockchain-service-wrapper**](https://github.com/ItayPodhajcer/terraform-azurerm-blockchain-service-wrapper)
> 
> Contribute to ItayPodhajcer/terraform-azurerm-blockchain-service-wrapper development by creating an account on GitHub.

Additionally, the module was also published to the Terraform Registry, and can be consumed directly from there. You can follow the provisioning instructions for [`blockchain-service-wrapper`](https://registry.terraform.io/modules/ItayPodhajcer/blockchain-service-wrapper) to use it in your scripts.

### The Script

The module will be constructed by two smaller modules, each wrapping an ARM template required for deploying an Azure Blockchain Service:

-   Member module: [Microsoft.Blockchain blockchainMembers template reference](https://docs.microsoft.com/en-us/azure/templates/microsoft.blockchain/blockchainmembers)
-   Transaction node module [Microsoft.Blockchain blockchainMembers/transactionNodes template reference](https://docs.microsoft.com/en-us/azure/templates/microsoft.blockchain/blockchainmembers/transactionnodes)

The member module wraps the root template of the service using a parameterized template file:

```json
{
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {},
    "variables": {},
    "resources": [
        {
            "type": "Microsoft.Blockchain/blockchainMembers",
            "apiVersion": "2018-06-01-preview",
            "name": "${member_name}",
            "location": "${location}",
            "sku": {
                "name": "${sku_name}",
                "tier": "${sku_tier}"
            },
            "properties": {
                "protocol": "${protocol}",
                "validatorNodesSku": {
                    "capacity": ${capacity}
                },
                "password": "${member_password}",
                "consortium": "${consortium_name}",
                "consortiumManagementAccountPassword": "${consortium_management_account_password}",
                "consortiumRole": "${consortium_role}",
                "consortiumMemberDisplayName": "${consortium_member_display_name}",
                "firewallRules": ${firewall_rules}
            },
            "resources": ${transaction_nodes}
        }
    ]
}
```

Which is loaded and populated by the member module’s main Terraform file:

```hcl
resource "azurerm_resource_group_template_deployment" "this" {
  name                = "${var.consortium_name}-${var.member_name}-deployment"
  resource_group_name = var.resource_group_name
  deployment_mode     = "Incremental"
  template_content = templatefile("${path.module}/member.tpl", {
    location                               = var.location
    member_name                            = var.member_name
    sku_name                               = var.sku_name
    sku_tier                               = var.sku_tier
    protocol                               = var.protocol
    capacity                               = var.capacity
    member_password                        = var.member_password
    consortium_name                        = var.consortium_name
    consortium_management_account_password = var.consortium_management_account_password
    consortium_role                        = var.consortium_role
    consortium_member_display_name         = var.consortium_member_display_name
    firewall_rules                         = jsonencode(var.firewall_rules)
    transaction_nodes                      = jsonencode(var.transaction_nodes[*].node_template)
  })
}
```

For brevity, the variables files, which are straight forward, won’t be covered by the article, but can be found in the source code’s repo.

The transaction module does the same thing for transaction node ARM template:

```json
{
    "name": "${node_name}",
    "type": "Microsoft.Blockchain/blockchainMembers/transactionNodes",
    "apiVersion": "2018-06-01-preview",
    "properties": {
        "password": "${node_password}",
        "firewallRules": ${firewall_rules}
    },
    "dependsOn": [
        "Microsoft.Blockchain/blockchainMembers/${member_name}"
    ]
}
```

And the module’s main Terraform file that loads and populates it:

```hcl
locals {
  node_template = jsondecode(templatefile("${path.module}/transaction-node.tpl", {
    member_name    = var.member_name
    node_name      = "${var.member_name}/${var.node_name}"
    node_password  = var.node_password
    firewall_rules = jsonencode(var.firewall_rules)
  }))
}
```

Note that this module doesn’t create a resource, but instead, just populates a variable with the result of the processed template file and creates an output from that variable:

```hcl
output "node_template" {
  value       = local.node_template
  description = "The node's resource template."
}
```

This is related to the structure of the ARM templates, where transaction nodes resource templates are sub-resources of the member resource templates (see `resoruces` field in the [documentation](https://docs.microsoft.com/en-us/azure/templates/microsoft.blockchain/blockchainmembers#microsoftblockchainblockchainmembers-object)), so the Terraform modules need to enable that same hierarchy to be constructed.

### Deployment Testing

Once we have both our modules, testing it is just a matter of adding it to a Terraform script, making sure that transaction node modules are create before member modules and passed to the member as argument values, in the following manner (taken from the source code’s repo):

```hcl
module "azure_blockchain_transaction_node1" {
  source  = "cladular/blockchain-service-wrapper/azurerm//modules/azure-blockchain-transaction-node"
  version = "0.0.1"

  member_name   = local.member_name
  node_name     = "bcnode1${local.deployment_name}"
  node_password = "!Q@W3e4r5t6y"
  firewall_rules = [{
    ruleName = "AllowAll"
    startIpAddress : "0.0.0.0",
    endIpAddress : "255.255.255.255"
  }]
}

module "azure_blockchain" {
  source  = "cladular/blockchain-service-wrapper/azurerm//modules/azure-blockchain-member"
  version = "0.0.1"

  resource_group_name                    = azurerm_resource_group.this.name
  location                               = azurerm_resource_group.this.location
  member_name                            = local.member_name
  sku_name                               = "S0"
  sku_tier                               = "Standard"
  member_password                        = "!Q@W3e4r5t6y"
  consortium_name                        = "bcconsortium${local.deployment_name}"
  consortium_management_account_password = "!Q@W3e4r5t6y"
  firewall_rules = [{
    ruleName = "AllowAll"
    startIpAddress : "0.0.0.0",
    endIpAddress : "255.255.255.255"
  }]
  transaction_nodes = [
    module.azure_blockchain_transaction_node1
  ]
}
```

### Conclusion

Although this solution is a great workaround for not having an official Terraform resource at the moment, it is still recommended to keep checking whether an official has been released and update the scripts that use the workaround when possible.
