---
title: "Easy Terraforming of an Azure Batch Service with an Auto-Scaling Pool"
description: "Azure Batch service, a job scheduling and computing power allocation managed solution, allows running jobs on pools of virtual machines of…"
pubDate: "2021-01-13T16:27:52.825Z"
heroImage: "./1_mcsRZppsIUq7EYLXV6d57g.png"
heroImageAlt: "Easy Terraforming of an Azure Batch Service with an Auto-Scaling Pool"
tags:
  - "Azure"
  - "DevOps"
  - "Terraform"
  - "Software Engineering"
  - "Cloud Computing"
---

Azure Batch service, a job scheduling and computing power allocation managed solution, allows running jobs on pools of virtual machines of our choice. Meaning, if certain jobs require high memory or GPU processing for example, the instance type used by the pool that will be running that type of job can be adjusted to fit our needs.

The available instance types, are the same offered for virtual machines on Azure, divided into different series, each with resources and underlying hardware that match specific task types (such as machine learning for example).

To optimize consumption of resources in the cloud, it would be ideal to only have virtual machines allocated to a pool when there are jobs that need to be processed, and when there are no jobs, deallocate those resources, so there is no charge for resources sitting idle.

In this article, we will be using Terraform to deploy an Azure Batch service with an auto-scaling pool, which has those automatic allocation and deallocation of virtual machines already built-in, based on a code-based formula defined by us and executed by the pool, which determines the logic for allocating and deallocating.

### The Example

A complete example of a Terraform script which deploys a batch service, a storage account, which is required by the batch service and an auto-scaling pool, can be found in this GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-azure-batch-autoscale**](https://github.com/ItayPodhajcer/terraform-azure-batch-autoscale)
> 
> Contribute to ItayPodhajcer/terraform-azure-batch-autoscale development by creating an account on GitHub.

### The Script

For this article, we will be deploying the following resources:

-   A resource group which will include all the resources.
-   A storage account which is required by the batch service.
-   An Azure Batch service.
-   An auto-scaling pool for the batch service.

We will start by defining local variables for the deployment name and the region we will be deploying to:

```hcl
locals {
  deployment_name = "autoscalebatchsvc"
  location        = "eastus2"
}
```

Next, we will create a resource group to hold all the resource we will be creating:

```hcl
resource "azurerm_resource_group" "this" {
  name     = "rg-${local.deployment_name}-${local.location}"
  location = local.location
}
```

Then the storage account which will be associated to the batch service:

```hcl
resource "random_string" "this" {
  length  = 22
  special = false
  upper   = false
}

resource "azurerm_storage_account" "this" {
  name                     = "st${random_string.this.result}"
  resource_group_name      = azurerm_resource_group.this.name
  location                 = azurerm_resource_group.this.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}
```

Note that we are using Terraform’s random string provider to create a name for the storage account.

Once we have the storage account, we can define the batch service as follows:

```hcl
resource "azurerm_batch_account" "this" {
  name                 = "batch${local.deployment_name}"
  resource_group_name  = azurerm_resource_group.this.name
  location             = azurerm_resource_group.this.location
  pool_allocation_mode = "BatchService"
  storage_account_id   = azurerm_storage_account.this.id
}
```

And then, the last piece, a Windows Server 2019 based auto-scaling pool, which will have a formula, that allows a nodes count between zero and a maximum of four nodes, evaluated once every five minutes:

```hcl
resource "azurerm_batch_pool" "this" {
  name                = "pool-${local.deployment_name}"
  resource_group_name = azurerm_resource_group.this.name
  account_name        = azurerm_batch_account.this.name
  display_name        = "Auto-Scale Pool"
  vm_size             = "Standard_A1"
  node_agent_sku_id   = "batch.node.windows amd64"

  auto_scale {
    evaluation_interval = "PT5M"

    formula = <<EOF
      maxPoolSize = 4;
      tasks = $ActiveTasks.Count() > 0 ? $ActiveTasks.GetSample(1) : 0;
      $TargetDedicatedNodes = min(tasks, maxPoolSize);
      $NodeDeallocationOption = taskcompletion;
EOF
  }

  storage_image_reference {
    publisher = "microsoftwindowsserver"
    offer     = "windowsserver"
    sku       = "2019-datacenter"
    version   = "latest"
  }

  start_task {
    command_line         = "echo 'Node started..'"
    max_task_retry_count = 1
    wait_for_success     = true

    user_identity {
      auto_user {
        elevation_level = "NonAdmin"
        scope           = "Task"
      }
    }
  }
}
```

Note that we also defined a start task with a simple `echo` command, which will run each time a node is allocated using the non-admin task scope auto-generated user.

### Run a Job

Once our deployment script is executed using `terraform apply`, we can test the batch service by creating a new job using the portal, that will use the pool created by the script, and then add a simple task with the `echo` command, so we can see the automatic scaling adding a node, executing the task and then remove the node once the task is complete.

Note that it might take a few minutes until a node is created, due to the evaluation interval we defined (five minutes, the minimum allowed).

### Conclusion

The deployment discussed in this article is simple, but for tasks that run with just commands, or even resource files related to a job, this deployment should prove more than enough. More elaborate deployments might include usage of application packages, multistep batches, and code-based job creation (with .NET for example).
