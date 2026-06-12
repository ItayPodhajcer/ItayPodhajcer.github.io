---
title: "Running Ollama on Azure Kubernetes Service"
description: "Ollama is a framework that simplifies deployment and interaction with Large Language Models without the need for complex setup. It supports…"
pubDate: "2024-06-03T15:57:57.556Z"
heroImage: "./1_sPjZ8CQFRD1vvmJW_r5fVg.png"
heroImageAlt: "Running Ollama on Azure Kubernetes Service"
mediumUrl: "https://medium.com/@itaypodhajcer/running-ollama-on-azure-kubernetes-service-d98378e10ef7"
tags:
  - "AI"
  - "Cloud Computing"
  - "Software Engineering"
  - "Azure"
  - "Kubernetes"
---

Ollama is a framework that simplifies deployment and interaction with Large Language Models without the need for complex setup. It supports popular models like Llama (multiple versions), Mistral and more, all based on transformer architectures. Ollama basically allows us to run our own models without relying on any third party model providers, therefore keeping our information always private and our spending more predictable.

In this article we will be creating resources on Azure to run Ollama as a container on a GPU-enabled Azure Kubernetes Service managed cluster. This requires, on top of the normal Kubernetes deployment, some additional steps to allow detection of GPUs as allocatable resources in the cluster and scheduling to those resources.

### Prerequisites

Will be using Terraform and its `azurerm` provider, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

Also, because we will be creating a node pool using GPU-enabled virtual machines (VM), we need to make sure we have enough available vCPU quota on azure for the VM family (`NCv3` in the case of the examples here) in the region we plan to use (`eastus`).

### Example Repository

A complete example Terraform script, which creates a private network, an Azure Kubernetes Service cluster, with an additional GPU-enabled node pool, the Nvidia container that enables GPU resources and the actual Ollama container, can be found in the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-ollama-aks**](https://github.com/ItayPodhajcer/terraform-ollama-aks)
> 
> Contribute to ItayPodhajcer/terraform-ollama-aks development by creating an account on GitHub.

### The Script

For brevity, I will only cover the area of the Terraform script that specifically address the steps related to enabling and later scheduling GPU reliant workloads.

Once we have an Azure Kubernetes Service resource defined, we will create the GPU node pool

Note the label `“nvidia.com/gpu.present” = “true”`, which scheduling of the `Nvidia Device Plugin` pod on that node, and the `sku=gpu:NoSchedule` taint, which blocks pod who don’t explicitly define that toleration from being scheduled on that node (as we only want pods that require GPU to be scheduled here).

Next, we create two `helm` resources, one for running the `Nvidia Device Plugin` `helm` chart (`https://nvidia.github.io/k8s-device-plugin/nvidia-device-plugin` by Nvidia), and one for running the `Ollama` `helm` chart (`https://otwld.github.io/ollama-helm/ollama` by Outworld)

Which uses the `nvidia-device-plugin-values.tpl` values template file

And

Which uses the `ollama-values.tpl` values template file which has `llama3` as the model we will be running

Note the additional annotations that will allow automatically creating a public hostname for this service, which we can later use for testing, using an IP address defined like this

Once all resources are defined, we need to run `terraform apply` to deploy everything to Azure (you might need to do `az login` if haven’t done so lately).

### Testing The deployment

Now that the deployment is complete, we can use any tool for sending HTTP `POST` requests to our cluster, for example `cUrl`:

And get the generated response back from the model, with additional statistical information about the generation process.

### Conclusion

In this article we used the simplest way (at least at the writing of this article) for running workloads that require GPUs on Kubernetes. Some other options which allow more advanced configuration and utilization of the GPU resources, like Nvidia’s GPU Operator and Triton Inference Server, can significantly improve “bang-for-buck” when using GPU VMs, but at the cost of higher complexity. This trade-off sums down to how AI intensive a given system is, meaning the more it requires GPUs, the higher the cost benefits will be from more advanced options.
