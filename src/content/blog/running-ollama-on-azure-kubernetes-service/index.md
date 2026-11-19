---
title: "Running Ollama on Azure Kubernetes Service"
description: "Ollama is a framework that simplifies deployment and interaction with Large Language Models without the need for complex setup. It supports…"
pubDate: "2024-06-03T15:57:57.556Z"
heroImage: "./1_sPjZ8CQFRD1vvmJW_r5fVg.png"
heroImageAlt: "Running Ollama on Azure Kubernetes Service"
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

```hcl
resource "azurerm_kubernetes_cluster_node_pool" "this" {
  name                  = "gpu"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.this.id
  vm_size               = "Standard_NC6s_v3"
  node_count            = 1
  vnet_subnet_id        = var.subnet_id

  node_labels = {
    "nvidia.com/gpu.present" = "true"
  }

  node_taints = ["sku=gpu:NoSchedule"]
}
```

Note the label `“nvidia.com/gpu.present” = “true”`, which scheduling of the `Nvidia Device Plugin` pod on that node, and the `sku=gpu:NoSchedule` taint, which blocks pod who don’t explicitly define that toleration from being scheduled on that node (as we only want pods that require GPU to be scheduled here).

Next, we create two `helm` resources, one for running the `Nvidia Device Plugin` `helm` chart (`https://nvidia.github.io/k8s-device-plugin/nvidia-device-plugin` by Nvidia), and one for running the `Ollama` `helm` chart (`https://otwld.github.io/ollama-helm/ollama` by Outworld)

```hcl
resource "helm_release" "nvidia_device_plugin" {
  name             = "nvidia-device-plugin"
  repository       = "https://nvidia.github.io/k8s-device-plugin"
  chart            = "nvidia-device-plugin"
  version          = var.nvidia_device_plugin_chart_version
  namespace        = var.deployment_name
  create_namespace = true

  values = [
    "${templatefile("${path.module}/nvidia-device-plugin-values.tpl", {
      tag = var.nvidia_device_plugin_tag
    })}"
  ]
}
```

Which uses the `nvidia-device-plugin-values.tpl` values template file

```yaml
image:
  tag: "${tag}"

tolerations:
  - key: CriticalAddonsOnly
    operator: Exists
  - key: nvidia.com/gpu
    operator: Exists
    effect: NoSchedule
  - key: "sku"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
```

And

```hcl
resource "helm_release" "ollama" {
  name             = local.ollama_service_name
  repository       = "https://otwld.github.io/ollama-helm/"
  chart            = "ollama"
  version          = var.ollama_chart_version
  namespace        = var.deployment_name
  create_namespace = true

  values = [
    "${templatefile("${path.module}/ollama-values.tpl", {
      tag            = var.ollama_tag
      port           = var.ollama_port
      resource_group = azurerm_resource_group.this.name
      ip_address     = azurerm_public_ip.this.ip_address
      dns_label_name = local.ollama_service_name
    })}"
  ]

  depends_on = [helm_release.nvidia_device_plugin]
}
```

Which uses the `ollama-values.tpl` values template file which has `llama3` as the model we will be running

```yaml
image:
  tag: "${tag}"

ollama:
  gpu:
    enabled: true
  models:
    - llama3

service:
    type: LoadBalancer
    port: ${port}
    annotations:
      service.beta.kubernetes.io/azure-load-balancer-resource-group: "${resource_group}"
      service.beta.kubernetes.io/azure-load-balancer-ipv4: "${ip_address}"
      service.beta.kubernetes.io/azure-dns-label-name: "${dns_label_name}"

tolerations:
  - key: "sku"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
```

Note the additional annotations that will allow automatically creating a public hostname for this service, which we can later use for testing, using an IP address defined like this

```hcl
resource "azurerm_public_ip" "this" {
  name                = "pip-${local.ollama_service_name}-${var.location}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  allocation_method   = "Static"
  sku                 = "Standard"

  lifecycle {
    ignore_changes = [
      domain_name_label
    ]
  }
}
```

Once all resources are defined, we need to run `terraform apply` to deploy everything to Azure (you might need to do `az login` if haven’t done so lately).

### Testing The deployment

Now that the deployment is complete, we can use any tool for sending HTTP `POST` requests to our cluster, for example `cUrl`:

```bash
curl http://<ollama-service-hostname>:11434/api/generate -d '{
  "model": "llama3",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

And get the generated response back from the model, with additional statistical information about the generation process.

### Conclusion

In this article we used the simplest way (at least at the writing of this article) for running workloads that require GPUs on Kubernetes. Some other options which allow more advanced configuration and utilization of the GPU resources, like Nvidia’s GPU Operator and Triton Inference Server, can significantly improve “bang-for-buck” when using GPU VMs, but at the cost of higher complexity. This trade-off sums down to how AI intensive a given system is, meaning the more it requires GPUs, the higher the cost benefits will be from more advanced options.
