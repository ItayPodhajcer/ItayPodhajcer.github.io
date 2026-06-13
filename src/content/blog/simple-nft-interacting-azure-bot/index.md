---
title: "Simple NFT Interacting Azure Bot"
description: "Non-fungible tokens (NFTs), one of the hottest topics in the blockchain ecosphere right now, which represent unique, non-interchangeable…"
pubDate: "2022-01-31T16:09:46.896Z"
heroImage: "./1_B0LEdPb5D2yyaIN1AIxswg.png"
heroImageAlt: "Simple NFT Interacting Azure Bot"
tags:
  - "Azure"
  - "NFT"
  - "Software Development"
  - "Cloud Computing"
  - "Bots"
---

Non-fungible tokens (NFTs), one of the hottest topics in the blockchain ecosphere right now, which represent unique, non-interchangeable pieces of data, are implemented using smart contracts that can be interacted with any type of applications, both blockchain based (other smart contracts) and not (like web apps for example).

One of those types of applications, which we will be discussing in this article, is chat bots. Chat bots allow simulating conversions with a human, by implementing sets of predefined actions and reactions, which are triggered by a real end user while conversing with the bot. One such framework and service combination for implementing chat bots is Azure Bot Service and Microsoft Bot Framework, which we will be using in this article to implement a bot that queries an Ethereum NFT contract, specifically, the [CryptoPunks](https://www.larvalabs.com/cryptopunks) NFT contract.

### Prerequisites

As we will be implementing the bot in C# and deploying it to azure, the following will need to be installed on the workstation:

-   [.NET SDK](https://dotnet.microsoft.com/en-us/download)
-   [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest)
-   [Bot Framework Emulator](https://github.com/microsoft/BotFramework-Emulator/releases) — good to have for local debugging
-   Nethereum code generator — to generate C# code for interacting with the Ethereum contract, which can be installed by running the following command (requires the .NET SDK):

-   And lastly, we will need the project template for an empty C# bot, which can be installed by running the following command (requires the .NET SDK):

### Example Repository

A complete example of a bot that query the Crypto Punks NFT contract and deployed to Azure Bot Service, is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/azure-bot-nft**](https://github.com/ItayPodhajcer/azure-bot-nft)
> 
> Contribute to ItayPodhajcer/azure-bot-nft development by creating an account on GitHub.

### The Bot

We will start be creating a new empty folder for our source code, and in it, we will execute the following command to create the initial bot project:

Next, we will need to obtain CryptoPunks contract `ABI` and `bytecode`, which can be found on the following page on Etherscan:

[https://etherscan.io/address/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb#code](https://etherscan.io/address/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb#code)

Copy the content of “Contract ABI” into a file called `CryptoPunks.abi` and the content of “Contract Creation Code” into a file called `CryptoPunks.bin` and place them in a subfolder called `Contracts`.

Now we can use Nethereum to generate C# code using these two files by running the following command:

We will also need to install `Nethereum.Web3` for the application to have all required dependencies to use the generated code:

For brevity, I will only cover the code of the actual implementation of the bot. The complete requirements to wire the components with dependency injection can be found in the above-mentioned GitHub repository.

We will implement the bot in a file called `NftBot.cs` which will be placed in a subfolder called `Bots`, and it will have two overrides for the base `ActivityHandler` class:

-   `OnMembersAddedAsync` triggered when a user enters the chat with the bot:

```csharp
protected override async Task OnMembersAddedAsync(IList<ChannelAccount> membersAdded, ITurnContext<IConversationUpdateActivity> turnContext, CancellationToken cancellationToken)
{
  var welcomeText = "Hello and welcome!";
  foreach (var member in membersAdded)
  {
    if (member.Id != turnContext.Activity.Recipient.Id)
    {
      await turnContext.SendActivityAsync(MessageFactory.Text(welcomeText, welcomeText), cancellationToken);
    }
  }
}
```

-   `OnMessageActivityAsync` triggered each time a user sends a message in the chat. This will perform the interaction with the CryptoPunks contract:

```csharp
protected override async Task OnMessageActivityAsync(ITurnContext<IMessageActivity> turnContext, CancellationToken cancellationToken)
{
  var punkIndex = BigInteger.Parse(turnContext.Activity.Text);
  var punkIndexValid = punkIndex >= LowerIndexBound && punkIndex <= UpperIndexBound;

  var replyText = !punkIndexValid
    ? "Please use punk indexes between 0 and 9999"
    : await ProcessSaleOfferResult(punkIndex);

  await turnContext.SendActivityAsync(MessageFactory.Text(replyText), cancellationToken);
}
```

And an additional method to process the result returned from the contract call:

```csharp
private async Task<string> ProcessSaleOfferResult(BigInteger punkIndex)
{
  var result = await _cryptoPunksService.PunksOfferedForSaleQueryAsync(punkIndex);

  if (!result.IsForSale)
  {
    return $"Punk {result.PunkIndex} is not for sale!";
  }

  var replyBuilder = new StringBuilder();

  replyBuilder.AppendLine($"Punk {result.PunkIndex} is for sale!");
  replyBuilder.AppendLine($"By seller {result.Seller}");
  replyBuilder.AppendLine($"With a minimum value of {Web3.Convert.FromWei(result.MinValue)} ETH");

  return replyBuilder.ToString();
}
```

The complete bot file should be similar to the following:

```csharp
using System.Collections.Generic;
using System.Numerics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Schema;
using Nethereum.Web3;
using NftBot.Contracts.CryptoPunks;
using NftBot.Contracts.CryptoPunks.ContractDefinition;

namespace NftBot.Bots
{
  public class NftBot : ActivityHandler
  {
    private const int LowerIndexBound = 0;
    private const int UpperIndexBound = 9999;

    private readonly CryptoPunksService _cryptoPunksService;

    public NftBot(CryptoPunksService cryptoPunksService)
    {
      _cryptoPunksService = cryptoPunksService;
    }

    protected override async Task OnMessageActivityAsync(ITurnContext<IMessageActivity> turnContext, CancellationToken cancellationToken)
    {
      var punkIndex = BigInteger.Parse(turnContext.Activity.Text);
      var punkIndexValid = punkIndex >= LowerIndexBound && punkIndex <= UpperIndexBound;

      var replyText = !punkIndexValid
        ? "Please use punk indexes between 0 and 9999"
        : await ProcessSaleOfferResult(punkIndex);

      await turnContext.SendActivityAsync(MessageFactory.Text(replyText), cancellationToken);
    }

    protected override async Task OnMembersAddedAsync(IList<ChannelAccount> membersAdded, ITurnContext<IConversationUpdateActivity> turnContext, CancellationToken cancellationToken)
    {
      var welcomeText = "Hello and welcome!";
      foreach (var member in membersAdded)
      {
        if (member.Id != turnContext.Activity.Recipient.Id)
        {
          await turnContext.SendActivityAsync(MessageFactory.Text(welcomeText, welcomeText), cancellationToken);
        }
      }
    }

    private async Task<string> ProcessSaleOfferResult(BigInteger punkIndex)
    {
      var result = await _cryptoPunksService.PunksOfferedForSaleQueryAsync(punkIndex);

      if (!result.IsForSale)
      {
        return $"Punk {result.PunkIndex} is not for sale!";
      }

      var replyBuilder = new StringBuilder();

      replyBuilder.AppendLine($"Punk {result.PunkIndex} is for sale!");
      replyBuilder.AppendLine($"By seller {result.Seller}");
      replyBuilder.AppendLine($"With a minimum value of {Web3.Convert.FromWei(result.MinValue)} ETH");

      return replyBuilder.ToString();
    }
  }
}
```

It is now possible to debug the bot by compiling it, starting it in debug mode and pointing the bot simulator to the bot controller’s route, which if not changed from what was generated by the template, should be at `http://localhost:[PORT-NUMBER]/api/messages`.

### Deployment

To deploy the bot, we will first build it in “Release” configuration by running:

And then start working on the Azure resources we require for deployment, starting by creating an Azure Active Directory application registration for it by running:

The result of this call should have an `appId` field, which together with the password, should be used to update the existing `appsettings.json` file like so:

Next, we will use one of the Azure Resource Manager templates that were generated by the template under the `DeploymentTemplates` subfolder, to create a resource group, application service plan and application to host our bot by running the following command (note that the app ID and password are also needed here):

Then prepare the project for deployment by running the following command:

Once preparation is complete (a new `deployment` file is added to the root source folder), a `ZIP` file of the entire source folder (including the build related subfolders) needs to be created (can be called `NftBot.zip`) and then used in the deployment by running:

This process might take a few minutes, but once complete, the bit us ready for testing.

### Testing The Bot

To test the bot, will need to navigate to the newly created Azure Bot resource in the Azure Portal, Open the “Test in Web Chat” pane and start interacting with the bot by sending it CryptoPunk indexes (0–9999 are valid), and notice that some are not for sale, and some are (with seller address and minimum value as advertised by the contract).

### Conclusion

This is quite a simple introduction to how to integrate Ethereum contracts with Azure Bot implementations. A real-world solution will probably include operations that also change the state of the contract (like buying a CryptoPunk for example) that are much more complex, as they require a wallet management solution, which is not part of the scope for this article (to keep it simple).

An example of a wallet management solution that utilizes Azure Key Vault can be found in one of my previous articles:

[https://medium.com/microsoftazure/simple-ethereum-wallets-management-with-azure-key-vault-2b701bc0505](https://medium.com/microsoftazure/simple-ethereum-wallets-management-with-azure-key-vault-2b701bc0505)
