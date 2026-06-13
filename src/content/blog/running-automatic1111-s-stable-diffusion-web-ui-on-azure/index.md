---
title: "Running Automatic1111’s Stable Diffusion Web UI on Azure"
description: "Automatic1111 Stable Diffusion Web UI is a web interface for Stable Diffusion, an AI model that can generate images from text prompts or…"
pubDate: "2024-03-06T15:07:42.270Z"
heroImage: "./1_EiVofp_TN0i0vCkVUQj1Yg.png"
heroImageAlt: "Running Automatic1111’s Stable Diffusion Web UI on Azure"
tags:
  - "AI"
  - "Software Engineering"
  - "Cloud Computing"
  - "Azure"
  - "Generative AI Tools"
---

Automatic1111 Stable Diffusion Web UI is a web interface for Stable Diffusion, an AI model that can generate images from text prompts or modify existing images with text prompts. It is developed under AUTOMATIC1111, a GitHub organization that forked the original Stable Diffusion repository and added many features and improvements. Some of the features of web UI include outpainting, inpaiting, color sketch, prompt matrix, upscale, attention, loopback, z/y/z plot, textual inversion and more.  
In this article we will be installing Automatic1111’s Stable Diffusion web UI on Azure on a virtual machine that includes an Nvidia V100 GPU, so it has all the processing power it needs and more.

### Prerequisites

Will be using Terraform and its `azurerm` provider to deploy the environment, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

Note that because we will be using a NC6s v3 virtual machine, a quota increase request for that resource will need to be opened through the Azure portal (just search for Quotas in the portal’s search bar).

### Example Repository

A complete Terraform script that creates all the needed resources, installs the required GPU drivers and Automatic1111’s Stable Diffusion web UI on the virtual machine, can be found in the following repository:

> [**GitHub - ItayPodhajcer/azure-vm-automatic1111**](https://github.com/ItayPodhajcer/azure-vm-automatic1111)
> 
> Contribute to ItayPodhajcer/azure-vm-automatic1111 development by creating an account on GitHub.

### Deployment Script

For brevity, I will only cover the resources that have configurations specifically related to running the web UI on an Azure VM. The rest, which includes creating a resource group, virtual network, subnet, public IP and key for SSH communication, can be found in the linked repository.

The first resource that requires configuration specific to web UI is the network security group, which needs to allow communication to the VM through the port used by web UI, which by default is 7860.

We will also create two template files, one for the script that will be used to initialize the VM and one to setup the `systemd` unit for running web UI as a background service.

The first file, `service.tpl`, will hold the definition of the `systemd` unit, setting up the working directory, user and group for running the service and the execution entry point with the arguments that will have web UI configured to listen for external connections and enable API access (so it can also be accessed programmatically).

The second file, `custom-date.tpl`, will install the drivers for the Nvidia GPU and CUDA cores, install packages needed by web UI, clone the web UI GitHub repository, create the Python environment, and configure the unit using the injected `service.tpl` file.

Next, add code to read the files to local variables and apply the values to the templates.

And lastly, we pass the processed templates’ value to the resource configuration that creates the VM, note that we are using `Standard_NC6s_v3`, which has a Nvidia V100 GPU.

### Testing The Deployment

To have Terraform deploy the resources, call `terraform apply`. Once the script is complete, web UI will still not be available, as it takes it a few minutes to install everything on the VM, so you can either wait, or connect to the VM using SSH to follow the logs as everything is being installed.

### Conclusion

The above solution is a very simple, bare minimum, deployment to allow web UI to function properly. To enhance it for production purposes, it would be better to have the VM placed behind something that can provide HTTPS and possibly restrict access using authentication (see Azure Application Gateway or Azure API Management for ideas on that).
