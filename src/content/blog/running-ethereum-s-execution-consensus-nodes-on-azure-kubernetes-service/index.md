---
title: "Running Ethereum’s Execution & Consensus Nodes on Azure Kubernetes Service"
description: "Now that Ethereum’s merge is behind us, where Eth1 and Eth2 are now one single network with a consensus layer and an execution layer, the…"
pubDate: "2022-09-29T21:02:42.066Z"
heroImage: "./1_IssiOqaj_7lb-t_i8GFdUQ.png"
heroImageAlt: "Running Ethereum’s Execution & Consensus Nodes on Azure Kubernetes Service"
mediumUrl: "https://medium.com/@itaypodhajcer/running-ethereums-execution-consensus-nodes-on-azure-kubernetes-service-f433ab3f0737"
tags:
  - "Azure"
  - "Ethereum"
  - "Web3"
  - "Cloud Computing"
  - "Software Engineering"
---

Now that Ethereum’s merge is behind us, where Eth1 and Eth2 are now one single network with a consensus layer and an execution layer, the task of running your own node got a little bit harder. Instead of just running one piece of software that previously was responsible for everything (such as Go Ethereum or Parity), now only handles execution and transactions, and another piece that is responsible for the proof-of-stake consensus is required.

In this article we will be using Terraform to deploy a simple Azure Kubernetes Service, and in it we will be using Helm charts to start and run a Go Ethereum service as the execution node and Lighthouse service as the consensus node.

### Prerequisites

Will be using Terraform and its `azurerm` provider, so we will be needing the following installed on our workstation:

-   Terraform: installation guide is [here](https://learn.hashicorp.com/terraform/getting-started/install.html).
-   Azure CLI: installation guide is [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest).

As we will be interacting with a Kubernetes cluster and using Helm charts to deploy our service, it would be a good idea to also have on our workstation:

-   kubectl: installation guide is [here](https://kubernetes.io/docs/tasks/tools/#kubectl).
-   helm: installation guide is [here](https://helm.sh/docs/intro/install/).

### Example Repository

A complete example Terraform script, which creates a private network, an Azure Kubernetes Service cluster, and deploys the two services using Helm charts, is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/terraform-geth-lighthouse-aks**](https://github.com/ItayPodhajcer/terraform-geth-lighthouse-aks)
> 
> Contribute to ItayPodhajcer/terraform-geth-lighthouse-aks development by creating an account on GitHub.

### The script

For brevity, I will only cover the area of the Terraform script that specifically creates the cluster and the shared secret on the cluster, and only the Helm templates that are specific to Go Ethereum and Lighthouse.

We will start by creating an Azure Kubernetes Service cluster with a minimum version of `1.24`, which is the first version to have the `MixedProtocolLBService` feature graduated from alpha status (it reached beta in `1.24`, which makes it available in AKS). We need that feature because both our services need to expose TCP and UDP ports to the internet for discovery purposes.

```hcl
resource "azurerm_kubernetes_cluster" "this" {
  name                = "aks-${var.name}-${var.location}"
  location            = var.location
  resource_group_name = var.resource_group_name
  node_resource_group = "${var.resource_group_name}-generated"
  dns_prefix          = "aks-${var.name}-${var.location}"
  kubernetes_version  = "1.24"

  network_profile {
    network_plugin = "azure"
  }

  default_node_pool {
    name           = "system"
    node_count     = 1
    vm_size        = "Standard_DS4_v2"
    vnet_subnet_id = azurerm_subnet.this.id
  }

  identity {
    type = "SystemAssigned"
  }
}
```

Also, because we want to be able to use well known public IP addresses (again for discovery purposes), we will be using a custom virtual network (either an existing one or a new one), and we will need to grant the cluster’s identity the ability to access the security group that contains those IP addresses. Also, because the virtual network is not managed by Kubernetes, a Network Security Group with rules to allow communication to the private network from the internet will also be required.

```hcl
resource "azurerm_role_assignment" "this" {
  scope                            = var.resource_group_id
  role_definition_name             = "Network Contributor"
  principal_id                     = azurerm_kubernetes_cluster.this.identity[0].principal_id
  skip_service_principal_aad_check = true
}
```

Next, we will create a secret which will be alter mounted to the service as the `jwt-secret` the consensus node uses to authenticate to the execution node.

```hcl
resource "random_password" "jwt_secret" {
  length = 32
}

resource "kubernetes_secret" "this" {
  metadata {
    name = "jwt-secret"
  }

  data = {
    "jwt.hex" = sha256(random_password.jwt_secret.result)
  }

  type = "Opaque"
}
```

Now we can start working on the services. We will be creating two Helm charts, one for each service. Both services will be defined as a `StatefulSet` , due to the long synchronization both require, which we don’t want it re-running each time a pod is recreated and the need for each of the nodes to have a fixed identity in the Ethereum network.

Go Ethereum’s `StatefulSet` definition:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "geth.fullname" . }}
  labels:
    {{- include "geth.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "geth.selectorLabels" . | nindent 6 }}
  serviceName: {{ include "geth.fullname" . }}
  template:
    metadata:
      labels:
        {{- include "geth.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "geth.serviceAccountName" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http-rpc
              containerPort: {{ .Values.geth.httpRpcPort }}
              protocol: TCP
            - name: ws-rpc
              containerPort: {{ .Values.geth.wsRpcPort }}
              protocol: TCP
            - name: auth-rpc
              containerPort: {{ .Values.geth.authRpcPort }}
              protocol: TCP
            - name: p2p-tcp
              containerPort: {{ .Values.geth.p2pPort }}
              protocol: TCP
            - name: p2p-udp
              containerPort: {{ .Values.geth.p2pPort }}
              protocol: UDP
          command:
            - sh
            - -ac
            - >
              exec geth 
              --syncmode=snap
              --nat=extip:{{ .Values.externalResources.loadBalancerIP }}
              --http
              --http.api=txpool,eth,net,web3,personal
              --http.addr=0.0.0.0
              --http.port={{ .Values.geth.httpRpcPort }}
              --http.corsdomain=*
              --http.vhosts=*
              --ws
              --ws.api=txpool,eth,net,web3,personal
              --ws.addr=0.0.0.0
              --ws.port={{ .Values.geth.wsRpcPort }}
              --ws.origins=*
              --authrpc.addr=0.0.0.0
              --authrpc.port={{ .Values.geth.authRpcPort }}
              --authrpc.jwtsecret="/data/{{ .Values.geth.jwtSecretFilename }}"
              --authrpc.vhosts=*
          livenessProbe:
            tcpSocket:
              port: http-rpc
            initialDelaySeconds: 60
            periodSeconds: 120
          readinessProbe:
            tcpSocket:
              port: http-rpc
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: {{ .Chart.Name }}-data
              mountPath: /root
            - name: jwt
              mountPath: "/data/{{ .Values.geth.jwtSecretFilename }}"
              subPath: {{ .Values.geth.jwtSecretFilename }}
              readOnly: true
      volumes:
        - name: {{ .Chart.Name }}-data
          persistentVolumeClaim:
            claimName: {{ include "geth.fullname" . }}-disk
        - name: jwt
          secret:
            secretName: {{ .Values.geth.jwtSecretName }}
```

Lighthouse’s `StatefulSet` definition:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "lighthouse.fullname" . }}
  labels:
    {{- include "lighthouse.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "lighthouse.selectorLabels" . | nindent 6 }}
  serviceName: {{ include "lighthouse.fullname" . }}
  template:
    metadata:
      labels:
        {{- include "lighthouse.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "lighthouse.serviceAccountName" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http-api
              containerPort: {{ .Values.lighthouse.httpPort }}
              protocol: TCP
            - name: p2p-tcp
              containerPort: {{ .Values.lighthouse.p2pPort }}
              protocol: TCP
            - name: p2p-udp
              containerPort: {{ .Values.lighthouse.p2pPort }}
              protocol: UDP
          command:
            - sh
            - -ac
            - >
              exec lighthouse
              beacon_node
              --disable-upnp
              --disable-enr-auto-update
              --enr-address={{ .Values.externalResources.loadBalancerIP }}
              --enr-tcp-port={{ .Values.lighthouse.p2pPort }}
              --enr-udp-port={{ .Values.lighthouse.p2pPort }}
              --listen-address=0.0.0.0
              --port={{ .Values.lighthouse.p2pPort }}
              --discovery-port={{ .Values.lighthouse.p2pPort }}
              --http
              --http-address=0.0.0.0
              --http-port={{ .Values.lighthouse.httpPort }}
              --execution-endpoint=http://{{ .Values.lighthouse.gethServiceName }}-headless.{{ .Release.Namespace }}.svc.cluster.local:8551
              --execution-jwt="/data/{{ .Values.lighthouse.jwtSecretFilename }}"
          livenessProbe:
            tcpSocket:
              port: http-api
            initialDelaySeconds: 60
            periodSeconds: 120
          readinessProbe:
            tcpSocket:
              port: http-api
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: {{ .Chart.Name }}-data
              mountPath: /root
            - name: jwt
              mountPath: "/data/{{ .Values.lighthouse.jwtSecretFilename }}"
              subPath: {{ .Values.lighthouse.jwtSecretFilename }}
              readOnly: true
      volumes:
        - name: {{ .Chart.Name }}-data
          persistentVolumeClaim:
            claimName: {{ include "lighthouse.fullname" . }}-disk
        - name: jwt
          secret:
            secretName: {{ .Values.lighthouse.jwtSecretName }}
```

Note that both definitions have the `jwt-secret` mounted to them and a persistent volume that will be used to store the synchronized state between pod terminations.

To allow Lighthouse to communicate with Go Ethereum internally, without leaving the boundaries of the cluster, we will create a headless service for Go Ethereum, which will allow Lighthouse to resolve the generated internal hostname.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "geth.fullname" . }}-headless
  labels:
    {{- include "geth.labels" . | nindent 4 }}
spec:
  clusterIP: None
  ports:
    - name: http-rpc
      port: {{ .Values.geth.httpRpcPort }}
      targetPort: http-rpc
      protocol: TCP
    - name: ws-rpc
      port: {{ .Values.geth.wsRpcPort }}
      targetPort: ws-rpc
      protocol: TCP
    - name: auth-rpc
      port: {{ .Values.geth.authRpcPort }}
      targetPort: auth-rpc
      protocol: TCP
    - name: p2p-tcp
      port: {{ .Values.geth.p2pPort }}
      targetPort: p2p-tcp
      protocol: TCP
    - name: p2p-udp
      port: {{ .Values.geth.p2pPort }}
      targetPort: p2p-udp
      protocol: UDP
  selector:
    {{- include "geth.selectorLabels" . | nindent 4 }}
```

The last part is to expose both services to the internet using a `LoadBalancer` service with a few Azure specific tricks (annotations) that will set the name of the resource groups that contains the public IP that should be used (the actual IP is in the `.spec.loadBalancerIP` field), enable mixed protocol support for the service and give it an external DNS label under the `<region>.cloudapp.azure.com` domain. Each service will have a selector that will use the `statefulset.kubernetes.io/pod-name` with the name of the single pod of the service (which is instance name with a `-0` suffix, as that is the only pod instance).

Go Ethereum’s `LoadBalancer` definition:

```yaml
apiVersion: v1
kind: Service
metadata:
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-resource-group: {{ .Values.externalResources.resourceGroupName }}
    service.beta.kubernetes.io/azure-load-balancer-mixed-protocols: "true"
    service.beta.kubernetes.io/azure-dns-label-name: {{ include "geth.fullname" . }}
  name: {{ include "geth.fullname" . }}-loadbalancer
  labels:
    {{- include "geth.labels" . | nindent 4 }}
spec:
  loadBalancerIP: {{ .Values.externalResources.loadBalancerIP }}
  type: LoadBalancer
  externalTrafficPolicy: Local
  ports:
    - name: http-rpc
      port: {{ .Values.geth.httpRpcPort }}
      targetPort: http-rpc
      protocol: TCP
    - name: ws-rpc
      port: {{ .Values.geth.wsRpcPort }}
      targetPort: ws-rpc
      protocol: TCP
    - name: p2p-tcp
      port: {{ .Values.geth.p2pPort }}
      targetPort: p2p-tcp
      protocol: TCP
    - name: p2p-udp
      port: {{ .Values.geth.p2pPort }}
      targetPort: p2p-udp
      protocol: UDP
  selector:
    {{- include "geth.selectorPodLabels" . | nindent 4 }}
```

Lighthouse’s `LoadBalancer` definition:

```yaml
apiVersion: v1
kind: Service
metadata:
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-resource-group: {{ .Values.externalResources.resourceGroupName }}
    service.beta.kubernetes.io/azure-load-balancer-mixed-protocols: "true"
    service.beta.kubernetes.io/azure-dns-label-name: {{ include "lighthouse.fullname" . }}
  name: {{ include "lighthouse.fullname" . }}-loadbalancer
  labels:
    {{- include "lighthouse.labels" . | nindent 4 }}
spec:
  loadBalancerIP: {{ .Values.externalResources.loadBalancerIP }}
  type: LoadBalancer
  externalTrafficPolicy: Local
  ports:
    - name: http-api
      port: {{ .Values.lighthouse.httpPort }}
      targetPort: http-api
      protocol: TCP
    - name: p2p-tcp
      port: {{ .Values.lighthouse.p2pPort }}
      targetPort: p2p-tcp
      protocol: TCP
    - name: p2p-udp
      port: {{ .Values.lighthouse.p2pPort }}
      targetPort: p2p-udp
      protocol: UDP
  selector:
    {{- include "lighthouse.selectorPodLabels" . | nindent 4 }}
```

And the definition of the pod selector:

```json
{{/*
Selector pod labels
*/}}
{{- define "geth.selectorPodLabels" -}}
statefulset.kubernetes.io/pod-name: {{ .Release.Name }}-0
{{- end }}
```

The last part is just to run `terraform apply` to deploy everything to Azure (you might need to do `az login` if haven’t done so lately).

### Testing The Deployment

The synchronization of both the consensus and later the execution nodes will take time, probably a few days (execution node synchronization only starts when the consensus node synchronization is complete).

You will be able to check the logs of both the pods (using either `kubectl` or the azure portal) and see whether the synchronization is complete or not, and once they are, you will be able to test your node using the `JSON-RPC` calls you used with your old, pre-merge node.

### Conclusion

The example discussed in this document will get you up and running in a relatively simple manner, but for high load/high reliability scenarios this deployment won’t be enough, as those scenarios will require a Kubernetes cluster with more than node and maybe more than one instance of each of the services deployed for redundancy. As for managing a production grade Kubernetes cluster in a production environment, this example is far from it (monitoring, logging, internal network policies, etc.), so you should probably use this deployment for development and testing purposes only.
