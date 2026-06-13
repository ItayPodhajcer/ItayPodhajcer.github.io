---
title: "Setting up ConsenSys's Quorum Key Manager on Azure"
description: "A while back I did an article on how to deploy EthSigner on Azure. Since then, ConsenSys was hard at work building a solution that’s based…"
pubDate: "2022-11-14T16:51:59.232Z"
heroImage: "./1_wOsiqSvY81S56BCuvol8xw.png"
heroImageAlt: "Setting up ConsenSys's Quorum Key Manager on Azure"
tags:
  - "Web3"
  - "Software Engineering"
  - "Cloud Computing"
  - "Azure"
  - "Ethereum"
---

A while back I did an article on how to [deploy EthSigner on Azure](https://medium.com/microsoftazure/easily-terraforming-an-ethsigner-with-an-azure-key-vault-hsm-based-key-110e25dcc588). Since then, ConsenSys was hard at work building a solution that’s based on the experience gained from developing EthSigner (and other products), which at its core, provides the same functionality, but with many more advanced features (such as enterprise-grade security and consolidated account and key management), and it’s called Quorum Key Manager (QKM).

In this article we will be covering the infrastructure and resources needed to deploy the QKM which include a PostgreSQL database, a file share for configuration files, a key vault and a mechanism for running the QKM container both for the migration process and the main service process.

### Prerequisites

Will be using Terraform and its `azurerm` provider, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

### Example Repository

A complete example Terraform script, which creates a private network, an Azure Database for PostgreSQL, an Azure Key Vault, an Azure Files share, a managed identity and runs QKM’s containers on Azure Container Apps, is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/quorum-key-manager-azure**](https://github.com/ItayPodhajcer/quorum-key-manager-azure)
> 
> Contribute to ItayPodhajcer/quorum-key-manager-azure development by creating an account on GitHub.

### The script

For brevity, I will only cover the areas of the Terraform script that are unique to the deployment of QKM, such as generating and uploading the configuration files, configuring the Azure Containers App environment, and running the containers.

First thing, we will create three configuration files for QKM, which include nodes configuration, vaults configuration, stores configuration:

-   Nodes configuration file, which has a template variable for the node URL:

```yaml
- kind: Node
  name: eth-node
  specs:
    rpc:
      addr: ${node_url}
```

-   Vaults configuration file, which has template variables for the vault name, azure tenant ID, client ID and client secret (see the managed identity module in the example mentioned above for details on how to generate those credentials):

```yaml
- kind: Vault
  type: azure
  name: az-key-vault
  specs:
    vault_name: ${vault_name}
    tenant_id: ${tenant_id}
    client_id: ${client_id}
    client_secret: ${client_secret}
```

-   And the stores configuration file, which is has no dynamic content, but does rely on the name of the value defined in the vaults configuration file:

```yaml
- kind: Store
  type: secret
  name: secrets
  specs:
    vault: az-key-vault

- kind: Store
  type: key
  name: keys
  specs:
    vault: az-key-vault

- kind: Store
  type: ethereum
  name: accounts
  specs:
    key_store: keys
```

Next, we need to upload those configuration files to an Azure Files share, which will be later mounted to our containers. To do that we will use the `azurerm_storage_share_file` resource, but because at the moment it only supports passing paths of files located in the local file system, we will need to create them (after the templates where populated with values, which some are sensitive) using `local_file` and then later delete them (because we don’t to keep any files with sensitive information lying around) using a little trick with the `null_resource` resource:

```hcl
resource "local_file" "this" {
  for_each = var.files

  content  = each.value
  filename = each.key
}

resource "azurerm_storage_share_file" "this" {
  for_each = local_file.this

  name             = each.key
  storage_share_id = azurerm_storage_share.this.id
  source           = each.key
}

resource "null_resource" "delete_local_file" {
  for_each = local_file.this

  triggers = {
    once = timestamp()
  }

  depends_on = [
    azurerm_storage_share_file.this,
  ]

  provisioner "local-exec" {
    # For Windows
    # command = "del ${each.key}"

    # For Linux
    command = "rm -rf ${each.key}"
  }
}
```

The creation of the virtual network, database and key vault won’t be discussed here, as they have no special treatment for this deployment, and are included in the example mentioned at the beginning of the article, so we will move to the creation of the Azure Container Apps environment.

At the writing of this article, there is no dedicated Terraform configuration element for creating any of the Azure Container Apps related resources, so we’ll be using the `azapi_resource` from the `azure/azapi` provider.

Note that as we require to mount the Azure File share to our containers, we need to define a storage in the environment, so the complete environment and storage definitions should be like the following:

```hcl
resource "azapi_resource" "managed_environment" {
  name      = "cae-${var.name}"
  location  = var.location
  parent_id = var.resource_group_id
  type      = "Microsoft.App/managedEnvironments@2022-06-01-preview"

  body = jsonencode({
    properties = {
      vnetConfiguration = {
        infrastructureSubnetId = var.subnet_id
        internal               = false
      },
      zoneRedundant = false
      appLogsConfiguration = {
        destination = "log-analytics"
        logAnalyticsConfiguration = {
          customerId = azurerm_log_analytics_workspace.this.workspace_id
          sharedKey  = azurerm_log_analytics_workspace.this.primary_shared_key
      } }
    }
  })
}

resource "azapi_resource" "storage" {
  type      = "Microsoft.App/managedEnvironments/storages@2022-06-01-preview"
  name      = "storage-${var.name}"
  parent_id = azapi_resource.managed_environment.id
  body = jsonencode({
    properties = {
      azureFile = {
        accountName = var.storage_account_name
        accountKey  = var.storage_account_key
        shareName   = var.share_name
        accessMode  = "ReadOnly"
      }
    }
  })
}
```

And lastly define the containers, using an `initContainers` section for running the QKM container with migrations command (so it runs before the main QKM container is started) and the `containers` section for the main QKM service container (note that the volume is pointing to the name of the storage defined in the previous step):

```hcl
resource "azapi_resource" "container_app" {
  name      = "ctap-${var.name}"
  location  = var.location
  parent_id = var.resource_group_id
  type      = "Microsoft.App/containerApps@2022-06-01-preview"

  identity {
    type = "SystemAssigned"
  }

  body = jsonencode({
    properties : {
      managedEnvironmentId = azapi_resource.managed_environment.id
      configuration = {
        ingress = {
          external   = true
          targetPort = 8080
          transport  = "http"

        }
        secrets = [
          { name = "db-user", value = "${var.db_user}@${var.db_host}" },
          { name = "db-password", value = var.db_password }
        ]
      }
      template = {
        initContainers = [
          {
            name  = "key-manager-migration"
            image = "docker.io/consensys/quorum-key-manager"
            env = [
              { name = "DB_HOST", value = var.db_host },
              { name = "DB_TLS_SSLMODE", value = "require" },
              { name = "DB_USER", secretRef = "db-user" },
              { name = "DB_PASSWORD", secretRef = "db-password" },
              { name = "DB_DATABASE", value = var.db_database },
            ]
            command = ["/main"]
            args    = ["migrate", "up"]
            resources = {
              cpu    = 0.5
              memory = "1.0Gi"
            }
          }
        ]
        containers = [
          {
            name  = "key-manager"
            image = "docker.io/consensys/quorum-key-manager"
            env = [
              { name = "DB_HOST", value = var.db_host },
              { name = "DB_TLS_SSLMODE", value = "require" },
              { name = "DB_USER", secretRef = "db-user" },
              { name = "DB_PASSWORD", secretRef = "db-password" },
              { name = "DB_DATABASE", value = var.db_database },
              { name = "HTTP_HOST", value = "0.0.0.0" },
              { name = "HTTP_PORT", value = "8080" },
              { name = "HEALTH_PORT", value = "8081" },
              { name = "MANIFEST_PATH", value = "/manifests" }
            ]
            command = ["/main"]
            args    = ["run"]
            resources = {
              cpu    = 0.5
              memory = "1.0Gi"
            }
            volumeMounts = [
              {
                mountPath  = "/manifests"
                volumeName = var.share_name
              }
            ]
            probes = [
              {
                type = "Liveness"
                httpGet = {
                  port   = 8081
                  path   = "/live"
                  scheme = "HTTP"
                }
              },
              {
                type = "Readiness"
                httpGet = {
                  port   = 8081
                  path   = "/ready"
                  scheme = "HTTP"
                }
              }
            ]
          }
        ]
        scale = {
          minReplicas = 1
          maxReplicas = 1
        }
        volumes = [
          {
            name        = var.share_name
            storageType = "AzureFile"
            storageName = "storage-${var.name}"
          }
        ]
      }
    }
  })

  response_export_values = ["properties.configuration.ingress.fqdn"]
}
```

Last part is to run `terraform apply` and wait for the script to complete before testing the QKM’s external endpoint.

### Testing The Deployment

Because the application is defined with an HTTP ingress, the container will be exposed at 443 (standard HTTPS) and not the internal 8081, due to Azure Container Apps automatically mapping HTTP ingresses in that manner for us, so you only need the ingress’s FQDN to do a simple HTTPS test.

### Conclusion

Exposing the Quorum Key Manager to the internet in this article is only done for demonstration purposes. In a real-world production environment, it will probably be only available to internal systems, or even just to the specific services that require it to function. Note that the Quorum Key Manager doesn’t have any nonce management logic, which is usually required in systems with lots of concurrent connections trying send transactions to the blockchain, so for that it will need to be combined with something like ConsenSys’s Codefi Orchestrate.
