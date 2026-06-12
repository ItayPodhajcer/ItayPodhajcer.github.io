---
title: "A Simple UniswapV3 Assistant with Azure OpenAI & Semantic Kernel"
description: "Semantic Kernel is an open-source SDK that lets you easily build agents that can integrate existing code and AI models like OpenAI, Azure…"
pubDate: "2024-01-24T15:33:26.261Z"
heroImage: "./1_sj6yuxyGjZDxKldgyUVR0A.png"
heroImageAlt: "A Simple UniswapV3 Assistant with Azure OpenAI & Semantic Kernel"
mediumUrl: "https://medium.com/@itaypodhajcer/a-simple-uniswapv3-assistant-with-azure-openai-semantic-kernel-f47b138959af"
tags:
  - "OpenAI"
  - "Web3"
  - "Software Engineering"
  - "Cloud Computing"
  - "Azure"
---

Semantic Kernel is an open-source SDK that lets you easily build agents that can integrate existing code and AI models like OpenAI, Azure OpenAI, which we will be using in this article, and Hugging Face. We will use it to create a small tool that can query a subgraph, which is an open API on The Graph that organizes and serves blockchain data using GraphQL queries, specifically for the purposes of this article, UniswapV3’s subgraph.

### Prerequisites

To develop and run our command line app we will need:

-   The [.NET SDK](https://dotnet.microsoft.com/en-us/download).
-   An IDE, like [Visual Studio Code](https://code.visualstudio.com/download) for example.
-   An Azure subscription with Azure OpenAI enabled (at the writing of this article there is still a wait list an individual needs to register to through [this form](https://go.microsoft.com/fwlink/?linkid=2222006&clcid=0x409)).

Also, to deploy the Azure OpenAI resources we will be using Terraform’s `azurerm` provider, so the following are also required

-   Terraform, which can be found [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI, which can be found [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

### Example Repository

As always, the complete code implementation and deployment script can be found in the following GitHub repository:

> [**GitHub - ItayPodhajcer/azure-openai-semantickernel-subgraph**](https://github.com/ItayPodhajcer/azure-openai-semantickernel-subgraph)
> 
> Contribute to ItayPodhajcer/azure-openai-semantickernel-subgraph development by creating an account on GitHub.

### The Deployment Script

We will keep this very simple, a resource group, an Azure AI Services account, an Azure AI Services deployment, a few variables for the deployment name and region, and outputs so we can read the AI service endpoint and access key:

Note that we set the capacity of the `azurerm_cognitive_deployment` to `60`, which is the maximum allowed by default, as we will be dealing with big text results (the results of the queries) and we don’t want to get throttled.

Once the script is done, just execute `terraform apply -auto-approve` and that should deploy the resources to your Azure subscription (you might need to use `az login` before running the script to log in to Azure).

To get the endpoint and access key we execute:

### The App

Now we can start with the app. create a new .NET console using the following command:

And add a reference to the `Microsoft.SemanticKernel` nuget package:

Once our project is setup, we can begin writing the code, starting from the Semantic Kernel plugin, which will be the one actually sending the queries to the UniswapV3 subgraph endpoint:

What makes the `QueryAsync` functions special, is the `KernelFunction` attribute, combined with the `Description` attributes for the function, which describes what the function does, and the function’s argument which describes what that argument should receive. Those descriptions are the ones that are used to determine how the function should be used by the kernel which we will be creating in the next section.

Now that we have the plugin, we can create the program that will be using it:

We read the deployment name, endpoint and access key, which were created by the Terraform script, from environment variables and use them to initialize Azure OpenAI chat completion.

Next, we add our plugin and call build to get a kernel, a core component that provides states and services for invoking functions and AI models, we can use for interactions during our chat loop, which has the chat completion service configured to automatically call tools, which in this case the tool is our plugin.

Note that we didn’t configure any prompts or model parameters, we keep everything to the defaults and see how good the results with minimum tweaking are.

And we’re done! Yes, it’s that simple!

The only thing left is to execute `dotnet run` and start querying our command line-based assistant, with text like “top 10 active pools”, for example.

If there were no failures, you will get a nicely printed result of UniswapV3 pool addresses with some additional information.

### Conclusion

The power of AI, when it can be easily combined with external data sources and operations, becomes much more apparent. To be able to almost effortlessly integrate existing code with generative AI and turn existing services more accessible to non-technical individuals without the need to develop complex user interfaces, like we did in this article to allow plain text queries that hide the complexity crafting GraphQL payloads, is a huge opportunity of new and unique innovations.
