---
title: "Making the Most of GPU Nodes on Azure Kubernetes Service Using the Nvidia GPU Operator"
description: "The NVIDIA GPU Operator simplifies the use of NVIDIA GPUs in Kubernetes clusters by automating the installation and configuration of…"
pubDate: "2024-08-27T13:13:15.467Z"
heroImage: "./1_ejNohnDNCEPzO3uodwDqZw.png"
heroImageAlt: "Making the Most of GPU Nodes on Azure Kubernetes Service Using the Nvidia GPU Operator"
tags:
  - "AI"
  - "Cloud Computing"
  - "Software Engineering"
  - "Azure"
  - "Nvidia"
---

The NVIDIA GPU Operator simplifies the use of NVIDIA GPUs in Kubernetes clusters by automating the installation and configuration of necessary software components, managing the lifecycle of GPU resources, and ensuring smooth updates and maintenance. It reduces manual configuration efforts, minimizes errors, and allows GPU resources to scale efficiently within the cluster, making it easier to handle workloads that require GPU acceleration.

This article will show how to use the Nvidia GPU Operator to configure the Multi-Instance GPU (MIG) feature, introduced with NVIDIA’s Ampere architecture, which allows a single GPU to be partitioned into multiple smaller, independent instances, each with its own dedicated resources like memory, cache, and compute cores. This enables multiple workloads to run in parallel on a single physical GPU, ensuring predictable performance and enhanced isolation, which is particularly beneficial in multi-tenant environments such as cloud services.

### Prerequisites

To deploy the infrastructure, Terraform and its `azurerm` provider will be used, so the following should be installed on the workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

Also, because the script will be creating a `NC A100 v4` based node pool, a request to increase the quota in the used region is required to at least 24 vCPUs (which means one virtual machine instance of the mentioned series), if it hadn’t been done before.

### Example Repository

A complete example Terraform script, which creates a private network, an Azure Kubernetes Service cluster, with an additional GPU-enabled node pool, creates the Nvidia GPU Operator, configures MIG and creates an Ollama service with four replicas, can be found in the following GitHub repository:

> [**GitHub - ItayPodhajcer/nvidia-gpu-operator-aks**](https://github.com/ItayPodhajcer/nvidia-gpu-operator-aks)
> 
> Contribute to ItayPodhajcer/nvidia-gpu-operator-aks development by creating an account on GitHub.

### The Script

For brevity, I will only cover the area of the Terraform script that specifically address the steps related to enabling and later scheduling GPU reliant workloads.

Once an Azure Kubernetes Service resource is defined, the additional GPU node pool based on `NC A100 v4` series virtual machines can be created:

```hcl
resource "azurerm_kubernetes_cluster_node_pool" "this" {
  name                  = var.name
  kubernetes_cluster_id = azurerm_kubernetes_cluster.this.id
  vm_size               = "Standard_NC24ads_A100_v4"
  node_count            = 1
  vnet_subnet_id        = var.subnet_id

  tags = {
    SkipGPUDriverInstall = true
  }

  node_labels = {
    "nvidia.com/mig.config" = "all-1g.20gb"
  }
}
```

Note that a special `nvidia.com/mig.config` label is being configured on the node pool. That label is used to select a MIG profile that the Nvidia GPU Controller should set up on each new node that is added to the node pool.

This example uses the `all-1g.20gb` profile, which is available for Nvidia A100 GPUs with 80GB of VRAM (note that both the A100 and the H100 have various variations with different VRAM capacities, which affect the profiles that are available for that GPU variation), that splits the GPU to four virtual GPUs, each with 20GB of VRAM, an amount that comfortably fits the Llama 3.1 8B model this example is using.

Once all the cluster related resources are defined, it’s time to move to the actual services, the Nvidia GPU Operator, which can be deployed using the [https://helm.ngc.nvidia.com/nvidia/gpu-operator](https://helm.ngc.nvidia.com/nvidia/gpu-operator) chart, and the Ollama service which can be deployed using the [https://otwld.github.io/ollama-helm/ollama](https://otwld.github.io/ollama-helm/ollama) chart.

The Terraform resource for the Nvidia GPU operator Helm chart is pretty straight forward:

```hcl
resource "helm_release" "gpu_operator" {
  name             = "gpu-operator"
  repository       = "https://helm.ngc.nvidia.com/nvidia"
  chart            = "gpu-operator"
  version          = var.gpu_operator_chart_version
  namespace        = var.deployment_name
  create_namespace = true

  values = [
    "${templatefile("${path.module}/gpu-operator-values.tpl", {})}"
  ]
}
```

And uses the following file to load values to the chart:

```yaml
migManager:
  env:
    - name: WITH_REBOOT
      value: "true"
```

Note that this file only includes a setting required when running on cloud-mananged Kubernetes clusters, as the Nvidia GPU Operator needs to be able to restart the new node once it’s done configuring it.

The next resource is the Ollama service’s Helm chart:

```hcl
resource "helm_release" "ollama" {
  name             = local.ollama_service_name
  repository       = "https://otwld.github.io/ollama-helm/"
  chart            = "ollama"
  version          = var.ollama_chart_version
  namespace        = var.deployment_name
  create_namespace = true
  timeout          = 900

  values = [
    "${templatefile("${path.module}/ollama-values.tpl", {
      port           = var.ollama_port
      resource_group = azurerm_resource_group.this.name
      ip_address     = azurerm_public_ip.this.ip_address
      dns_label_name = local.ollama_service_name
    })}"
  ]

  depends_on = [helm_release.gpu_operator]
}
```

Note that it relies on the Nvidia GPU Operator Helm chart resource and that it has a longer than default timeout configured, to allow the Nvidia GPU Operator to complete its configuration work.

The template for the values of the Ollama service sets four replicas, turns on GPU inference, selects the Llama 3.1 model, sets up the external endpoint of the service and defines a toleration that will only allow the containers to be scheduled to a GPU enabled node:

```yaml
replicaCount: 4

ollama:
  gpu:
    enabled: true
  models:
    - llama3.1

service:
  type: LoadBalancer
  port: ${port}
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-resource-group: "${resource_group}"
    service.beta.kubernetes.io/azure-load-balancer-ipv4: "${ip_address}"
    service.beta.kubernetes.io/azure-dns-label-name: "${dns_label_name}"

tolerations:
  - key: nvidia.com/gpu
    operator: Exists
    effect: NoSchedule
```

Now that all the resources are defined, the only thing left to do is execute `terraform apply` and wait for the execution to complete.

### Testing The deployment

Once the deployment is complete, any tool for sending HTTP `POST` requests can be used to send requests to the Ollama service running on the cluster, for example `cUrl`:

```bash
curl http://<ollama-service-hostname>:11434/api/generate -d '{
  "model": "llama3.1",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

That should result in a repose generated by the Llama 3.1 model, with additional statistical information about the generation process.

The easiest way to send multiple requests to the service would be to just add `&` to the end of the `cUrl` command, to let it run in the background instead of blocking the console, run it multiple times and later check the results.

### Conclusion

The Nvidia GPU Operator helps to squeeze out the most out of GPUs by allowing more than one container to be scheduled to a single physical GPU. The caveat with this sort of scheduling is that testing is required to reach the best balance of cost/output ratio, as the more a GPU is split, the more it would take a single model instance to respond.
