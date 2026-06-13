---
title: "Simple Mastodon Node Deployment on Azure"
description: "Mastodon is a decentralized social media network that lets users create and join various communities of their choice. Mastodon also…"
pubDate: "2023-03-15T16:43:03.661Z"
heroImage: "./1_rbTANitE5AXzbTl0tw3r8Q.png"
heroImageAlt: "Simple Mastodon Node Deployment on Azure"
tags:
  - "Azure"
  - "Web3"
  - "Software Engineering"
  - "Cloud Computing"
  - "Decentralization"
---

Mastodon is a decentralized social media network that lets users create and join various communities of their choice. Mastodon also supports several types of content, such as audio, video, picture, polls, and more, to help users express themselves online. Mastodon values users’ privacy and freedom of expression by allowing them to choose who can see their posts and who can interact with them. Mastodon allows anyone to run their own server instance and join the network of millions of users, which is exactly what we will be doing in this article.

### Prerequisites

Will be using Terraform and its `azurerm` provider to deploy the Mastodon instance, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

### Example Repository

A complete Terraform script that creates a resource group and deploys the Mastodon instance using an Azure Container Instances container group, is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-azure-mastodon**](https://github.com/ItayPodhajcer/terraform-azure-mastodon)
> 
> Contribute to ItayPodhajcer/terraform-azure-mastodon development by creating an account on GitHub.

### Deployment Script

This script deploys a simple Mastodon instance that can be used for testing purposes, so we will be keeping it as simple as possible, and that’s why will be using Azure Container Instances to do that.

Also, we will be using [Bitnami’s Mastodon image](https://hub.docker.com/r/bitnami/mastodon/) and not the [tootsuite/mastodon](https://hub.docker.com/r/tootsuite/mastodon/) image, as it is more automated deployment friendly (the tootsuite image requires running a manual wizard as part of the deployment process).

We’ll start by creating a few locals (deployment name, database user, mastodon user and Mastodon email), a resource group and passwords (for the database, Elasticsearch and Mastodon admin user):

```hcl
locals {
  name           = "${var.deployment_name}-${var.location}"
  database_user  = "dbuser"
  mastodon_user  = "user"
  mastodon_email = "user@email.com"
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${local.name}"
  location = var.location
}

resource "random_password" "database" {
  special = false
  length  = 16
}

resource "random_password" "elastic" {
  special = false
  length  = 16
}

resource "random_password" "mastodon" {
  special = false
  length  = 16
}
```

Next will create the Azure Container Instances resource and expose the ports `3000` and `4000` for Mastodon web container and the Mastodon streaming container (we will be defining the actual containers inside next):

```hcl
resource "azurerm_container_group" "this" {
  name                = "aci-${local.name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  ip_address_type     = "Public"
  dns_name_label      = local.name
  os_type             = "Linux"

  exposed_port {
    port     = "3000"
    protocol = "TCP"
  }

  exposed_port {
    port     = "4000"
    protocol = "TCP"
  }

  ...
}
```

Now we can add the required containers, which are:

-   A PostgreSQL database instance
-   An Elasticsearch instance
-   A Redis instance
-   A Mastodon web instance — processes short-lived HTTP requests,
-   A Mastodon streaming instance — handles long-lived WebSocket connections for real-time udpates.
-   A Mastodon sidekiq instance — handles background processing such as emails, media files and delivering posts to other servers.

The database container:

```hcl
container {
    name   = "postgresql"
    image  = "docker.io/bitnami/postgresql:15"
    cpu    = "0.5"
    memory = "1"

    environment_variables = {
      "POSTGRESQL_DATABASE" = "bitnami_mastodon"
      "POSTGRESQL_USERNAME" = local.database_user
    }

    secure_environment_variables = {
      "POSTGRESQL_PASSWORD" = random_password.database.result
    }

    ports {
      port     = "5432"
      protocol = "TCP"
    }

    volume {
      name       = "postgresql-data"
      mount_path = "/bitnami/postgresql"
      empty_dir  = true
    }
  }
```

The Elasticsearch container:

```hcl
container {
    name   = "elasticsearch"
    image  = "docker.io/bitnami/elasticsearch:8"
    cpu    = "1"
    memory = "2"

    environment_variables = {
      "ELASTICSEARCH_ENABLE_SECURITY"    = "true"
      "ELASTICSEARCH_SKIP_TRANSPORT_TLS" = "true"
    }

    secure_environment_variables = {
      "ELASTICSEARCH_PASSWORD" = random_password.elastic.result
    }

    ports {
      port     = "9200"
      protocol = "TCP"
    }

    volume {
      name       = "elasticsearch-data"
      mount_path = "/bitnami/elasticsearch/data"
      empty_dir  = true
    }
  }
```

The Redis container:

```hcl
 container {
    name   = "redis"
    image  = "docker.io/bitnami/redis:7.0"
    cpu    = "0.5"
    memory = "1"

    environment_variables = {
      "ALLOW_EMPTY_PASSWORD" = "yes"
    }

    ports {
      port     = "6379"
      protocol = "TCP"
    }

    volume {
      name       = "redis-data"
      mount_path = "/bitnami/redis"
      empty_dir  = true
    }
  }
```

The Mastodon web container:

```hcl
container {
    name   = "mastodon"
    image  = "docker.io/bitnami/mastodon:4"
    cpu    = "0.5"
    memory = "1"

    ports {
      port     = "3000"
      protocol = "TCP"
    }

    environment_variables = {
      "BITNAMI_DEBUG"               = "true"
      "ALLOW_EMPTY_PASSWORD"        = "yes"
      "MASTODON_MODE"               = "web"
      "MASTODON_REDIS_HOST"         = "localhost"
      "MASTODON_DATABASE_HOST"      = "localhost"
      "MASTODON_DATABASE_USERNAME"  = local.database_user
      "MASTODON_ELASTICSEARCH_HOST" = "localhost"
      "MASTODON_ADMIN_USERNAME"     = local.mastodon_user
      "MASTODON_ADMIN_EMAIL"        = local.mastodon_email
    }

    secure_environment_variables = {
      "MASTODON_DATABASE_PASSWORD"      = random_password.database.result
      "MASTODON_ELASTICSEARCH_PASSWORD" = random_password.elastic.result
      "MASTODON_ADMIN_PASSWORD"         = random_password.mastodon.result
    }

    volume {
      name       = "mastodon-data"
      mount_path = "/bitnami/mastodon"
      empty_dir  = true
    }
  }
```

The Mastodon streaming container:

```hcl
container {
    name   = "mastodon-streaming"
    image  = "docker.io/bitnami/mastodon:4"
    cpu    = "0.5"
    memory = "1"

    ports {
      port     = "4000"
      protocol = "TCP"
    }

    environment_variables = {
      "ALLOW_EMPTY_PASSWORD"        = "yes"
      "MASTODON_MODE"               = "streaming"
      "MASTODON_REDIS_HOST"         = "localhost"
      "MASTODON_DATABASE_HOST"      = "localhost"
      "MASTODON_DATABASE_USERNAME"  = local.database_user
      "MASTODON_ELASTICSEARCH_HOST" = "localhost"
      "MASTODON_WEB_HOST"           = "localhost"
    }

    secure_environment_variables = {
      "MASTODON_DATABASE_PASSWORD"      = random_password.database.result
      "MASTODON_ELASTICSEARCH_PASSWORD" = random_password.elastic.result
    }
  }
```

And lastly, the Mastodon sidekiq container:

```hcl
container {
    name   = "mastodon-sidekiq"
    image  = "docker.io/bitnami/mastodon:4"
    cpu    = "0.5"
    memory = "1"

    environment_variables = {
      "ALLOW_EMPTY_PASSWORD"        = "yes"
      "MASTODON_MODE"               = "sidekiq"
      "MASTODON_REDIS_HOST"         = "localhost"
      "MASTODON_DATABASE_HOST"      = "localhost"
      "MASTODON_DATABASE_USERNAME"  = local.database_user
      "MASTODON_ELASTICSEARCH_HOST" = "localhost"
      "MASTODON_WEB_HOST"           = "localhost"
    }

    secure_environment_variables = {
      "MASTODON_DATABASE_PASSWORD"      = random_password.database.result
      "MASTODON_ELASTICSEARCH_PASSWORD" = random_password.elastic.result
    }

    volume {
      name       = "mastodon-data"
      mount_path = "/bitnami/mastodon"
      empty_dir  = true
    }
  }
```

A few notes:

-   The PostgreSQL, Elasticsearch and Redis container all have a dedicated Empty Dir volume.
-   The Mastodon web and sidekiq containers have a shred Empty Dir volume.
-   Containers inside an Azure Container Instances group communicate with each other using `localhost`.

### Testing The Deployment

Execute `terraform apply`, wait for the script to complete, and then let the Mastodon web container run all the initial migrations (this can take a few minutes, you can track the logs from Azure’s portal). Once the migrations are complete, the server will be available through the Azure Container Instances resource FQDN on port `3000`.

### Conclusion

The tradeoff of this deployment, being this simple, is that it’s not recommended for a production deployment, as the volumes won’t persist if the containers are stopped. Also, because the Bitnami images use a non-root user, we cannot use Azure Files as volume mounts (they can only be accessed by container running with root), meaning, different services will be required to run the containers (such as Azure Kubernetes Service or Azure Container Apps, which are more complex) and maybe even use Azure managed services for PostgreSQL and Redis.
