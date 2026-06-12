---
title: "Terraforming a Serverless MongoDB Replica Set with Split Horizon DNS on Azure and Cloudflare"
description: "Occasionally, some scenarios require non-orthodox deployments, whether it’s due to a temporary state of a system such as moving from an…"
pubDate: "2020-09-14T18:05:35.573Z"
heroImage: "./1_s1G7bGhTnA5pUS6UGK3LAw.png"
heroImageAlt: "Terraforming a Serverless MongoDB Replica Set with Split Horizon DNS on Azure and Cloudflare"
mediumUrl: "https://medium.com/@itaypodhajcer/terraforming-a-serverless-mongodb-replica-set-with-split-horizon-dns-on-azure-and-cloudflare-9687e37dacf1"
tags:
  - "Azure"
  - "DevOps"
  - "MongoDB"
  - "Terraform"
  - "Cloudflare"
---

Occasionally, some scenarios require non-orthodox deployments, whether it’s due to a temporary state of a system such as moving from an on-prem deployment to the cloud, or as convenient way of testing and validating a deployment with all of its moving parts.  
Such is the case of the example in this article, which deploys a MongoDB, a database that needs no introduction, replica set on Azure, but, and this is the not-so-orthodox area of this deployment, exposes it to the external world in addition to being available on an internal private virtual network.

What’s non-orthodox about it? Well, usually a database is not exposed directly to the outside world, instead, there are one or more software layers, which also execute additional logic and just store and retrieve data.

### The Problem

If you’ve worked with MongoDB replica sets before, you should be familiar with the replica set connection string which includes multiple hosts:

This is where things get complicated, because if we need the hosts to be available from both the internal network and the external world, we need to use hosts names that can be resolved from both the internal network and the external world, and they have to be the same host names, as MongoDB replica sets are only aware of the host names that were used when they were joined to the replica set, so two different names per host won’t work.

### The Solution — Split Horizon DNS

To solve the problem, something called a split-horizon DNS needs to be used, and although the name suggests something out-of-the-ordinary, it actually means using two DNS zones, one private internal and one public external, with the same name, such as **example.com**.

By doing so, we’ll be able to register a host named `node1.example.com` once with a private IP in the private internal zone and once with a public IP in the public external zone, making the MongoDB connection string shown above valid for both environments.

### The Example

The complete Terraform based example, which deploys three MongoDB nodes, exposes them to the outside world using an Azure Firewall, registers the internal IP addresses to an Azure Private DNS and registers the public IP addresses to a public DNS zone on Cloudflare, can be found in this GitHub repository:

> [**GitHub - ItayPodhajcer/mongodb-split-horizon-dns**](https://github.com/ItayPodhajcer/mongodb-split-horizon-dns)
> 
> Contribute to ItayPodhajcer/mongodb-split-horizon-dns development by creating an account on GitHub.

For brevity reasons, I won’t cover the entire example here, but only the sections that make the replica set and DNS zones work as required, starting with the bash script that is executed by each node on startup to join the replica set:

```bash
#!/bin/sh

until /usr/bin/mongo "mongodb://127.0.0.1:27017" --quiet --eval "db.getMongo()"; do
    sleep 1
done

/usr/bin/mongo "mongodb://127.0.0.1:27017" <<EOF
    rs.initiate({_id: "${replica_set}", members: [
        ${members}
    ], settings: {electionTimeoutMillis: 2000}});
EOF
```

You’ll notice that this is actually a template loaded by Terraform, which also populates the `${replica_set}` and `${members}` originating from the main entry point like so:

```hcl
locals {
  deployment_name = "mongo"
  nodes_count     = 3
  location        = "eastus"
  zone_name       = "example.com"
  replica_set     = "mongo-set"
  nodes_list = {
    for index in range(1, local.nodes_count + 1) : index => "${local.deployment_name}${index}.${local.zone_name}"
  }
}
```

Once the script creates a node running on Azure Container Instances using the `mongo-node` module which is part of the example:

```hcl
module "mongo_node" {
  source = "./modules/mongo-node"

  deployment_name      = "${local.deployment_name}"
  location             = local.location
  nodes_count          = local.nodes_count
  resource_group_name  = azurerm_resource_group.this.name
  network_profile_id   = azurerm_network_profile.this.id
  zone_name            = local.zone_name
  storage_account_name = azurerm_storage_account.this.name
  storage_primary_key  = azurerm_storage_account.this.primary_access_key
  replica_set          = local.replica_set
  nodes_list           = local.nodes_list
}
```

An internal private IP address is registered to the private DNS zone (as part of the module’s script):

```hcl
resource "azurerm_private_dns_a_record" "this" {
  count               = var.nodes_count
  name                = "${var.deployment_name}${count.index + 1}"
  zone_name           = var.zone_name
  resource_group_name = var.resource_group_name
  ttl                 = 300
  records             = [azurerm_container_group.this[count.index].ip_address]
}
```

For the public side of our deployment, an Azure Firewall and associated public addresses are created (one IP address per node) using the `firewall` module:

```hcl
module "firewall" {
  source = "./modules/firewall"

  deployment_name     = "${local.deployment_name}3"
  resource_group_name = azurerm_resource_group.this.name
  location            = local.location
  pips_count          = local.nodes_count
  subnet_id           = azurerm_subnet.external.id
}
```

And SNAT and network rules on the above firewall, that will forward the traffic from the external IP addresses to the matching internal MongoDB nodes using the `network-rule` and `nat-rule` modules:

```hcl
module "netowork_rule" {
  source = "./modules/network-rule"

  deployment_name     = "${local.deployment_name}"
  resource_group_name = azurerm_resource_group.this.name
  firewall_name       = module.firewall.this_name
  port                = 27017
  ip_addresses        = module.firewall.this_pips
}

module "nat_rule" {
  source = "./modules/nat-rule"

  deployment_name      = "${local.deployment_name}"
  resource_group_name  = azurerm_resource_group.this.name
  firewall_name        = module.firewall.this_name
  port                 = 27017
  public_ip_addresses  = module.firewall.this_pips
  private_ip_addresses = module.mongo_node.this_ips
}
```

Lastly, public DNS records are created on Cloudflare using the IP addresses that were created with the firewall using the `cloudflare-record` module:

```hcl
module "cloudflare_record" {
  source = "./modules/cloudflare-record"

  deployment_name = local.deployment_name
  zone_name       = local.zone_name
  pips            = module.firewall.this_pips
}
```

### Deployment Testing

To test the deployment, a MongoDB connection string similar to the following will be required (ensure you set node names and replica set name to whatever values you used):

And either use the `mongo` command line tool, or something like MongoDBCompass which is available here:

> [**Compass**](https://www.mongodb.com/products/compass)
> 
> The GUI for MongoDB. Visually explore your data. Run ad hoc queries in seconds. Interact with your data with full CRUD…

### Conclusion

As exposing databases to the external world is always risky, even when using a firewall, it is recommended to also restrict the rules even further by setting source IP addresses which can access the nodes and use transport layer encryption to protect the information passing between the consumers and the MongoDB nodes.
