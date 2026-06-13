---
title: "Simple Decentralized Identifier (DID) Document Hosting on Azure"
description: "Decentralized identifier documents are a new type of digital identity document that enable verifiable and decentralized interactions…"
pubDate: "2023-05-30T14:56:54.448Z"
heroImage: "./1_nX0N_hySmLRHAPxN6ImGBQ.png"
heroImageAlt: "Simple Decentralized Identifier (DID) Document Hosting on Azure"
tags:
  - "Web3"
  - "Cloud Computing"
  - "Software Engineering"
  - "Azure"
  - "DevOps"
---

Decentralized identifier documents are a new type of digital identity document that enable verifiable and decentralized interactions between any subject and any other entity, without relying on any central authority or intermediary. They are self-sovereign, resolvable, and based on the Decentralized Identifiers (DIDs) v1.0 specification by the World Wide Web Consortium (W3C). One of the methods to create and use them is the `did:web` method, which leverages the existing web infrastructure and security protocols to host a JSON-LD file at a standard HTTPS URL, meaning they can be hosted and distributed globally using Azure, which is what we will be doing in this article.

### Prerequisites

Will be using Terraform and its `azurerm` and `cloudlare` providers to deploy the environment, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

Note that we will need a Cloudflare account and a domain in that account for this.

### Example Repository

A complete Terraform script that creates a resource group, a storage account (for a static web site), an Azure CDN instance and a Cloudflare CNAME DNS record, and then uploads various JSON-LD DID documents, can be found in the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-did-web-azure**](https://github.com/ItayPodhajcer/terraform-did-web-azure)
> 
> Contribute to ItayPodhajcer/terraform-did-web-azure development by creating an account on GitHub.

### Deployment Script

We will start by reading the Cloudflare zone and creating a resource group:

```hcl
data "cloudflare_zones" "this" {
  filter {
    name = var.zone_name
  }
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${var.deployment_name}-${var.location}"
  location = var.location
}
```

Then create a storage account which will be used to store the documents:

```hcl
resource "random_string" "this" {
  length  = 24
  special = false
  upper   = false
}

resource "azurerm_storage_account" "this" {
  name                     = random_string.this.result
  resource_group_name      = azurerm_resource_group.this.name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  static_website {}
}
```

Next, we create the Azure CDN profile and endpoint to distribute the documents globally:

```hcl
resource "azurerm_cdn_profile" "this" {
  name                = "cdn-${var.deployment_name}-${var.location}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "Standard_Microsoft"
}

resource "azurerm_cdn_endpoint" "this" {
  name                          = "endpoint-${var.deployment_name}-${var.location}"
  profile_name                  = azurerm_cdn_profile.this.name
  location                      = azurerm_resource_group.this.location
  resource_group_name           = azurerm_resource_group.this.name
  origin_host_header            = azurerm_storage_account.this.primary_web_host
  querystring_caching_behaviour = "IgnoreQueryString"

  origin {
    name      = var.deployment_name
    host_name = azurerm_storage_account.this.primary_web_host
  }
}
```

And lastly create the CNAME record and CDN custom domain configuration to point to the CDN endpoint:

```hcl
resource "cloudflare_record" "this" {
  zone_id = data.cloudflare_zones.this.zones[0].id
  name    = var.subdomain
  value   = azurerm_cdn_endpoint.this.fqdn
  type    = "CNAME"
  ttl     = 1
  proxied = false
}

resource "azurerm_cdn_endpoint_custom_domain" "this" {
  name            = "endpoint-doain-${var.deployment_name}-${var.location}"
  cdn_endpoint_id = azurerm_cdn_endpoint.this.id
  host_name       = cloudflare_record.this.hostname

  cdn_managed_https {
    certificate_type = "Dedicated"
    protocol_type    = "ServerNameIndication"
  }
}
```

Now that we have the resources, it is time to upload the JSON-LD DID documents. Note that the DID must match the domain name, having a root DID URI like `did:web:eample.com` means there must be a `did.json` file available at the URL `https://example.com/.well-known/did.json`. For non-root documents, the route in the DID URI `did:web:eample.com:sub-docs:doc-a` must represent the actual route of the document where it is hosted like so [`https://example.com/sub-docs/doc-a/did.json`](https://example.com/.well-known/did.json) (more on the `did:web` method specification can be found [here](https://w3c-ccg.github.io/did-method-web/)).

We will use a template for the root document that can look like this:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/jws-2020/v1"
  ],
  "id": "did:web:${domain}",
  "verificationMethod": [
    {
      "id": "did:web:${domain}#key-0",
      "type": "JsonWebKey2020",
      "controller": "did:web:${domain}",
      "publicKeyJwk": {
        "kty": "EC",
        "crv": "P-256",
        "x": "38M1FDts7Oea7urmseiugGW7tWc3mLpJh6rKe7xINZ8",
        "y": "nDQW6XZ7b_u2Sy9slofYLlG03sOEoug3I0aAPQ0exs4"
      }
    }
  ],
  "authentication": [
    "did:web:${domain}#key-0"
  ]
}
```

And a template for each document hosted in a subdirectory that might look like this:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/jws-2020/v1"
  ],
  "id": "did:web:${domain}:${route}",
  "verificationMethod": [
    {
      "id": "did:web:${domain}:${route}#key-0",
      "type": "JsonWebKey2020",
      "controller": "did:web:${domain}:${route}",
      "publicKeyJwk": {
        "kty": "EC",
        "crv": "P-256",
        "x": "38M1FDts7Oea7urmseiugGW7tWc3mLpJh6rKe7xINZ8",
        "y": "nDQW6XZ7b_u2Sy9slofYLlG03sOEoug3I0aAPQ0exs4"
      }
    }
  ],
  "authentication": [
    "did:web:${domain}:${route}#key-0"
  ]
}
```

Note that both templates have the `domain` variable defined, so the document can be set with the actual domain used, and in the template that will be used for a document hosted in a subdirectory, there is an additional `route` variable for setting the documents route to match the path in storage.

Will upload one document to the root, and have an additional looped resource to upload documents in subdirectories:

```hcl
resource "azurerm_storage_blob" "root" {
  name                   = ".well-known/did.json"
  storage_account_name   = azurerm_storage_account.this.name
  storage_container_name = "$web"
  type                   = "Block"
  content_type           = "application/json"
  source_content = templatefile(var.root_doc, {
    domain = cloudflare_record.this.hostname
  })
}

resource "azurerm_storage_blob" "subdocs" {
  for_each = var.sub_docs

  name                   = "${each.value.route}/did.json"
  storage_account_name   = azurerm_storage_account.this.name
  storage_container_name = "$web"
  type                   = "Block"
  content_type           = "application/json"
  source_content = templatefile(each.value.doc, {
    domain = cloudflare_record.this.hostname
    route  = replace(each.value.route, "/", ":")
  })
}
```

### Testing The Deployment

To check that everything was deployed as expected, we only need to open a browser and point to the correct URLs using the domain we used, like `https://example.com/.well-known/did.json` for the root document and [`https://example.com/route/to/doc/did.json`](https://example.com/.well-known/did.json) for a document that was placed in the `route/to/doc` route.

### Conclusion

There are many more DID method specifications, which might be more suitable for other scenarios and systems, so make sure to check the complete list of methods, which can be found [here](https://w3c.github.io/did-spec-registries/#did-methods).
