---
title: "Easily Terraforming & Interacting with an Azure Confidential Ledger"
description: "Azure Confidential Ledger, a managed and decentralized ledger for data entries backed by blockchain, enables maintaining data integrity by…"
pubDate: "2023-01-17T14:58:11.896Z"
heroImage: "./1_62GtIyxZ2JH81WqyUBAtkg.png"
heroImageAlt: "Easily Terraforming & Interacting with an Azure Confidential Ledger"
tags:
  - "Azure"
  - "Cloud Computing"
  - "Software Development"
  - "Software Engineering"
  - "Blockchain"
---

Azure Confidential Ledger, a managed and decentralized ledger for data entries backed by blockchain, enables maintaining data integrity by either using Azure Active Directory or client certificates to control access and modification permissions with tamper-proof storage and hardware-backed secure enclaves used in Azure confidential computing.

In this article we will be covering how to deploy an Azure Confidential Ledger using Terraform, which is surprisingly simple, and then create a simple script to interact with both the control plain and the data plain.

### Prerequisites

Will be using Terraform and its `azurerm` provider to deploy the ledger and Python to interact with the ledger, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).
-   Python: installation guide is [here](https://www.python.org/downloads/).

### Example Repository

A complete Terraform script that creates a resource group and deploys an Azure Confidential Ledger, and a Python script that interacts with the deployed ledger is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-azure-confidential-ledger**](https://github.com/ItayPodhajcer/terraform-azure-confidential-ledger)
> 
> Contribute to ItayPodhajcer/terraform-azure-confidential-ledger development by creating an account on GitHub.

### Deployment Script

As mentioned earlier, it is surprisingly easy to Terraform an Azure Confidential Ledger, as it only requires creating a resource group and then an Azure Confidential Ledger resource, which in our case, we will grant the user who’s running the script admin permissions on the ledger.

The entire Terraform script should be similar to the following:

```hcl
provider "azurerm" {
  features {}
}

data "azurerm_client_config" "current" {}

locals {
  name        = "${var.deployment_name}-${var.location}"
  ad_app_name = "Some App"
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${local.name}"
  location = var.location
}

resource "azurerm_confidential_ledger" "this" {
  name                = "acl-${local.name}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  ledger_type         = "Public"

  azuread_based_service_principal {
    principal_id     = data.azurerm_client_config.current.object_id
    tenant_id        = data.azurerm_client_config.current.tenant_id
    ledger_role_name = "Administrator"
  }
}
```

To run the script, make sure to run `az login` first, so Terraform can interact with Azure, then run `terraform apply` and after a few minutes, you should have a ledger ready for use.

### Using The Ledger

To interact with the ledger, we will be writing a small Python script, that both access the management plain to retrieve ledger properties, and the data plain to write and read transactions.

We will start by creating a `requirements.txt` file for the required dependencies:

```
azure-identity
azure.mgmt.confidentialledger
azure.confidentialledger
```

And then execute `pip install -r requirements.txt` to install those dependencies.

Next, we will create the script file, `test-ledger.py`, starting with the imports and variables with info on our deployed ledger:

```python
from azure.identity import DefaultAzureCredential
from azure.mgmt.confidentialledger import ConfidentialLedger as ConfidentialLedgerAPI
from azure.mgmt.confidentialledger.models import ConfidentialLedger
from azure.confidentialledger import ConfidentialLedgerClient
from azure.confidentialledger.certificate import ConfidentialLedgerCertificateClient

resource_group = "rg-confidentialledger-eastus"
ledger_name = "acl-confidentialledger-eastus"
subscription_id = "<azure-subscription-id>"

identity_url = "https://identity.confidential-ledger.core.azure.com"
ledger_url = "https://" + ledger_name + ".confidential-ledger.azure.com"
```

Then create a ledger management client and retrieve some of the ledger’s properties (name, location, and ID):

```python
credential = DefaultAzureCredential()
confidential_ledger_mgmt = ConfidentialLedgerAPI(
    credential, subscription_id
)

properties = {
    "location": "eastus",
    "tags": {},
    "properties": {
        "ledgerType": "Public",
        "aadBasedSecurityPrincipals": [],
    },
}
ledger_properties = ConfidentialLedger(**properties)

print(f"{resource_group} / {ledger_name}")

myledger = confidential_ledger_mgmt.ledger.get(resource_group, ledger_name)

print("Ledger details:")
print(f"  Name: {myledger.name}")
print(f"  Location: {myledger.location}")
print(f"  ID: {myledger.id}")
```

Afterwards we create a ledger certificate client to retrieve the ledger’s identity certificate:

```python
identity_client = ConfidentialLedgerCertificateClient(identity_url)
network_identity = identity_client.get_ledger_identity(
     ledger_id=ledger_name
)

ledger_tls_cert_file_name = "ledgercert.pem"
with open(ledger_tls_cert_file_name, "w") as cert_file:
    cert_file.write(network_identity['ledgerTlsCertificate'])
```

And lastly, create a ledger client to write and read data:

```python
ledger_client = ConfidentialLedgerClient(
     endpoint=ledger_url, 
     credential=credential,
     ledger_certificate_path=ledger_tls_cert_file_name
)

sample_entry = {"contents": "Hello world!"}
ledger_client.create_ledger_entry(entry=sample_entry)

latest_entry = ledger_client.get_current_ledger_entry()
print("Latest entry:")
print(f"  Transaction ID: {latest_entry['transactionId']}")
print(f"  Collection ID: {latest_entry['collectionId']}")
print(f"  Contents: {latest_entry['contents']}")
```

The only thing left now is to run the script using `python .\test-ledger.py` and you should see the info printed out by the script and the certificate file downloaded locally.

### Conclusion

Although, for simplicity, the above script only associated a single user to the ledger, in a real-world scenario this might have multiple different associations of both users and service accounts, using either Azure Active Directory identities and/or client certificates to control who can access the ledger and with what permissions.
