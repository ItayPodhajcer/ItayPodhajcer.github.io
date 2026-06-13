---
title: "Simple Ethereum Wallets Management with Azure Key Vault"
description: "The most important piece of information for every Ethereum wallet owner, is the private key. It is the most important because loss of that…"
pubDate: "2020-12-03T14:45:31.683Z"
heroImage: "./1_PHS5a7go31lWIHtIkG4eLw.png"
heroImageAlt: "Simple Ethereum Wallets Management with Azure Key Vault"
tags:
  - "Azure"
  - "Azure Functions"
  - "Software Development"
  - "Ethereum"
  - "Cloud Computing"
---

The most important piece of information for every Ethereum wallet owner, is the private key. It is the most important because loss of that private key will result in the owner not being able to access the tokens associated to that wallet, without any possibility of recovery.

In some blockchain based scenarios, a centralized and secured wallets management solution is required, usually to allow users to use a dedicated wallet inside the boundaries of the system, without risking their private wallets.

Azure Key Vault, and even more so, its hardware security modules (HSM) offering, allows management and usage of cryptographic key pairs, without the private key ever leaving the vault, unless it’s for backup and restore operations, meaning, the risk of loss or exposure of the private key is reduced.

### The Example

A complete example with both a Terraform script for deploying the required infrastructure (an Azure Key Vault, a Function App, and some additionally required resources), and an Azure Functions App with two functions for creating wallets and singing, can be found in this GitHub repository:

> [**GitHub - ItayPodhajcer/keyvault-eth-wallet-manager**](https://github.com/ItayPodhajcer/keyvault-eth-wallet-manager)
> 
> Contribute to ItayPodhajcer/keyvault-eth-wallet-manager development by creating an account on GitHub.

### Infrastructure Setup

For this article, we will be using Terraform to deploy all the resources we require for our simple Ethereum wallets manager, which include:

-   A storage account required by the functions app.
-   A key vault for storing wallet keys.
-   And lastly, a functions app that will act as a gateway to the vault.

For brevity, I will only go over the areas of the Terraform script that specifically handle the creation of the vault, the functions app and the policy that allows the app to access the vault.

We will start by the adding an `azurerm_key_vault` resource with a `premium` SKU, as HSMs are only available at that tier (note that the `tenant_id` can be read from your subscription using an `azurerm_client_config` block):

```hcl
resource "azurerm_key_vault" "this" {
  name                = "kv-${local.deployment_name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  soft_delete_enabled = true
  sku_name            = "premium"
}
```

The next interesting resource is the functions app, where we specifically enable the managed identity (using the `identity` block), as an identity is required when assigning a policy that will allow the app to access the vault:

```hcl
resource "azurerm_function_app" "this" {
  name                       = "func-${local.deployment_name}"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  app_service_plan_id        = azurerm_app_service_plan.this.id
  storage_account_name       = azurerm_storage_account.this.name
  storage_account_access_key = azurerm_storage_account.this.primary_access_key
  version                    = "~3"

  app_settings = {
    "KEY_VAULT_URL" = azurerm_key_vault.this.vault_uri
  }

  identity {
    type = "SystemAssigned"
  }
}
```

And lastly, we add the `azurerm_key_vault_access_policy` block that associates the functions app with the key vault and defines the permissions it will have. note that for this example, we will be using the keys mechanism of the key vault (`key_permissions` block), and only allow the functions app to create, get the public and sign operations (`create`, `get`, `sign`):

```hcl
resource "azurerm_key_vault_access_policy" "this" {
  key_vault_id = azurerm_key_vault.this.id

  tenant_id = azurerm_key_vault.this.tenant_id
  object_id = azurerm_function_app.this.identity[0].principal_id

  key_permissions = [
    "create", "sign", "get"
  ]
}
```

### The Functions App

Now that we are done with the infrastructure, we can move to writing the functions app that will expose wallet related operations to the outside world, and on the other side, access the protected key vault.

For this article, we will be using C# and to create a new empty Azure Functions project, we can either use Visual Studio’s project template or the [Azure Functions Core Tools](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local?tabs=windows%2Ccsharp%2Cbash). Either way, we once we have our empty project, we will add to HTTP trigger-based functions. The first will be the `CreateWallet` function, which accesses the key vault and generates a `secp256k1` public and private key pair’ and generates an Ethereum address from the created public key:

```csharp
public static class CreateWallet
    {
        [FunctionName("CreateWallet")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "wallets")] HttpRequest req,
            ILogger log)
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            var model = JsonConvert.DeserializeObject<CreateWalletModel>(requestBody);
            
            string KeyVaultUrl = Environment.GetEnvironmentVariable("KEY_VAULT_URL");

            var keyClient = new KeyClient(new Uri(KeyVaultUrl), new DefaultAzureCredential());

            var response = await keyClient.CreateEcKeyAsync(new CreateEcKeyOptions(model.Name, true) 
            {
                CurveName = KeyCurveName.P256K
            });
            
            var sha3 = new Sha3Keccack();
            var addressUtil = new AddressUtil();
            
            byte[] publicKey = response.Value.Key.ToECDsa().ExportSubjectPublicKeyInfo();
            byte[] hash = sha3.CalculateHash(publicKey);
            byte[] addressBuffer = new byte[hash.Length - 12];

            Array.Copy(hash, 12, addressBuffer, 0, hash.Length - 12);

            string address = addressUtil.ConvertToChecksumAddress(addressBuffer.ToHex());

            log.LogInformation($"Generate address: {address}");

            return new OkObjectResult(new CreateWalletResultModel { Address = address });
        }
    }

    public class CreateWalletModel
    {
        public string Name { get; set; }
    }

    public class CreateWalletResultModel
    {
        public string Address { get; set; }
    }
```

And the second `Sign` functions, which accepts a base64 encoded string of a hash payload (needs to be a 256-bit hash) and the wallet name to use for signing, and returns a base64 encoded string of the generated signature:

```csharp
public static class Sign
    {
        [FunctionName("Sign")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "sign")] HttpRequest req,
            ILogger log)
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            var model = JsonConvert.DeserializeObject<SignModel>(requestBody);

            string KeyVaultUrl = Environment.GetEnvironmentVariable("KEY_VAULT_URL");

            var keyClient = new KeyClient(new Uri(KeyVaultUrl), new DefaultAzureCredential());

            var response = await keyClient.GetKeyAsync(model.WalletName);
            
            var cryptoClient = new CryptographyClient(response.Value.Id, new DefaultAzureCredential());

            var signature = await cryptoClient.SignAsync(SignatureAlgorithm.ES256K, Convert.FromBase64String(model.Payload));

            return new OkObjectResult(new SignResultModel { Signature = Convert.ToBase64String(signature.Signature) });
        }
    }

    public class SignModel
    {
        public string WalletName { get; set; }
        public string Payload { get; set; }
    }

    public class SignResultModel
    {
        public string Signature { get; set; }
    }
```

Note that both functions make use of an environment variable called `KEY_VAULT_URL`, which was set in the Terraform script inside the `azurerm_function_app` block to the URI of the key vault, removing the need of any manual configurations in the functions app.

### Testing the Solution

To test the solution, we can use the Azure Portal, by navigating to the function we want to test and executing it with the parameters we want. To generate a base64 encoded hash that can be sent to the `Sign` function, we can use:

1.  [https://emn178.github.io/online-tools/sha3\_256.html](https://emn178.github.io/online-tools/sha3_256.html) To generate a `hex` string of whatever value we want to sign.
2.  [https://base64.guru/converter/encode/hex](https://base64.guru/converter/encode/hex) to convert the generated `hex` string, to a base64 encoded string.

### Conclusion

This article covers the basics of how to create key pairs using Azure Key Vault that can be used on Ethereum based networks. In a production-grade environment, a solution for managing wallets will be much more restrictive and resilient, such as by adding authentication and authorization to the functions or expose operations for backing-up and restoring keys, which will provide an even better protection for the private keys and allow recovery of such keys in case of loss.
