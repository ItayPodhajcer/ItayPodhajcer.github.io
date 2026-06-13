---
title: "Easily Running Stability AI’s StableStudio on Azure"
description: "StableStudio is a web-based application that allows users to create and edit images using generative AI. It is the official open source…"
pubDate: "2023-07-31T18:35:30.058Z"
heroImage: "./1_Bvo_7ZMNDGboAwliU7jD8g.png"
heroImageAlt: "Easily Running Stability AI’s StableStudio on Azure"
tags:
  - "AI"
  - "Azure"
  - "DevOps"
  - "Cloud Computing"
  - "Software Engineering"
---

StableStudio is a web-based application that allows users to create and edit images using generative AI. It is the official open-source variant of DreamStudio, a user interface developed by Stability AI, a company that specializes in generative AI solutions. StableStudio is a community interface that enables anyone to explore the possibilities of generative AI for image creation. In this article we will see how easy it is to deploy StableStudio as a container using Azure Container Instances.

### Prerequisites

Will be using Terraform and its `azurerm` provider to deploy the environment, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

Note that we will need a Stability AI API key, meaning an account, which can be created [here](https://platform.stability.ai/).

### Example Repository

A complete Terraform script that creates a resource group and an Azure Container Instances resource running a generic Node.JS container with instructions for initializing and executing StableStudio web application, can be found in the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-azure-stablestudio**](https://github.com/ItayPodhajcer/terraform-azure-stablestudio)
> 
> Contribute to ItayPodhajcer/terraform-azure-stablestudio development by creating an account on GitHub.

### Deployment Script

We will start by creating a local that will hold the commands needed to inside the container to pull [StableStudio’s GitHub repository](https://github.com/Stability-AI/StableStudio), build the code and run the app:

Note that we also defined a `port` local as it’s good practice in case the port can be changed in the future, so we will only need to change the value in one place.

Next, we create a resource group:

And lastly, we will create the Azure Container Instances resource to run StableStudio:

Note that we are using a generic `node` image and combine all the commands in to one shell command that will be executed by the container when it starts.

We will also define a variables file with some defaults:

And an outputs file that will have the final URL to access our StableStudio instance:

### Testing The Deployment

All we need to do now, is run the following Terraform command:

Note that although we defined a default value for `deployment_name`, we should set it to a unique value for our deployment to avoid collisions.

### Conclusion

StableStudio is a very promising user interface for generative AI, as it supports swapping the backend that is being used to perform the actual operations (the default is Stability AI’s servers) to other backends in the future using its plugin system.
