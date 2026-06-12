---
title: "Easily Create Azure VM Custom Linux Images for ASP.NET Core Services with GitHub Actions and Packer"
description: "Creating Docker container images with build pipeline, whether it’s with GitHub Actions or any other such tool, is common and straight…"
pubDate: "2022-01-02T12:02:53.759Z"
heroImage: "./1_B4CusUrdphweSrHLjWcbog.png"
heroImageAlt: "Easily Create Azure VM Custom Linux Images for ASP.NET Core Services with GitHub Actions and Packer"
mediumUrl: "https://medium.com/@itaypodhajcer/easily-create-azure-vm-custom-linux-images-for-asp-net-core-services-with-github-actions-and-packer-4abd34540980"
tags:
  - "Azure"
  - "GitHub Actions"
  - "Dotnet"
  - "Software Development"
  - "Cloud Computing"
---

Creating Docker container images with build pipeline, whether it’s with GitHub Actions or any other such tool, is common and straight forward. But what if you can’t or don’t want to use Docker container images, and instead, you want to rely on VM images? Well, no problem, there’s a solution for you as well. In this article we’ll be covering how we can build a GitHub Actions workflow that uses HashiCorp’s Packer to create a custom image for an ASP.NET Core Web API.

### Prerequisites

We will be creating a simple ASP.NET Core Web API as the service that needs to be included in the image, so the [.NET SDK](https://dotnet.microsoft.com/download) should be installed on the workstation. For the GitHub Actions workflow, we will need to create an Azure Active Directory service principal so Packer can interact with Azure to build the VM image, so the latest version of the [Azure](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest) CLI should be installed as well.

### Example Repository

A complete example with a simple ASP.NET Core service, Packer script and GitHub Actions workflow, is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/github-actions-packer**](https://github.com/ItayPodhajcer/github-actions-packer)
> 
> Contribute to ItayPodhajcer/github-actions-packer development by creating an account on GitHub.

### The Service

For the service, we will just use the basic ASP.NET Core that is created by the .NET CLI tool by running `dotnet new webapi -n WebApi -o ./` inside our `src` directory.

### The Packer Script

We will start by creating a Linux `systemd` template file called `service.tpl`:

```ini
[Unit]
Description=${name}

[Service]
Type=simple
ExecStart=${command}
User=1000
Group=1000

[Service]
Environment="DOTNET_BUNDLE_EXTRACT_BASE_DIR=%h/.net"
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=default.target
```

The description and executable file name will be passed in through the Packer script and the service will run under a non-rooted user.

Next we will create the actual packer script, called `main.pkr.hcl`, which will first define the source image to use:

```hcl
source "azure-arm" "this" {
  client_id                         = var.client_id
  client_secret                     = var.client_secret
  tenant_id                         = var.tenant_id
  subscription_id                   = var.subscription_id
  managed_image_name                = var.image_name
  managed_image_resource_group_name = var.resource_group_name
  os_type                           = "Linux"
  image_publisher                   = "Canonical"
  image_offer                       = "UbuntuServer"
  image_sku                         = "18.04-LTS"
  image_version                     = "latest"
  location                          = "East US"
  vm_size                           = "Standard_DS2_v2"
}
```

And then the build tasks, which include:

-   Uploading the service file after values have been applied to the template
-   Create the service’s directory
-   Change the ownership to our non-rooted user
-   Upload the service’s compiled binaries
-   Grand execution permissions to the service’s files
-   Now, if you need to run your service with a port below 1024, you will need to add this command at this point:

-   Reload the daemon
-   Enable the service
-   Start the service
-   Lastly, deprovision the VM

This entire build section should look like this:

```hcl
build {
  sources = ["sources.azure-arm.this"]

  provisioner "file" {
    content     = local.service_file_content
    destination = local.service_tmp_path
  }

  provisioner "shell" {
    inline = [
      "sudo mkdir -p ${local.destination_directory}",
      "sudo chown 1000:1000 ${local.destination_directory}",
      "sudo mv ${local.service_tmp_path} /etc/systemd/system/"
    ]
  }

  provisioner "file" {
    source      = var.app_path
    destination = local.destination_directory
  }

  provisioner "shell" {
    inline = [
      "sudo chmod 755 ${local.destination_directory}/*",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable ${var.service_name}.service",
      "sudo systemctl start ${var.service_name}.service"
    ]
  }

  provisioner "shell" {
    execute_command = "chmod +x {{ .Path }}; {{ .Vars }} sudo -E sh '{{ .Path }}'"
    inline = [
      "/usr/sbin/waagent -force -deprovision+user && export HISTSIZE=0 && sync"
    ]
    inline_shebang = "/bin/sh -x"
  }
}
```

We will also create a Packer variables file called `variables.pkr.hcl` for all the variables our script requires:

```hcl
variable "client_id" {
  type      = string
  sensitive = true
}

variable "client_secret" {
  type      = string
  sensitive = true
}

variable "subscription_id" {
  type      = string
  sensitive = true
}

variable "tenant_id" {
  type      = string
  sensitive = true
}

variable "resource_group_name" {
  type = string
}

variable "image_name" {
  type = string
}

variable "app_path" {
  type = string
}

variable "service_name" {
  type = string
}

variable "executable_name" {
  type = string
}
```

### The Service Principal

Creating the service principal is fairly easy using the Azure CLI. The following command will create the principal associated to the Contributor role, as Packer will be deploying temporary resources to create the image and will also store the image in an existing resource group:

You will also need your Azure subscription ID, which can be retrieved with:

By the way, if you are using multiple subscriptions, and need to change the one that is being used by the CLI, you can run:

We will need to keep the output from the above commands, as it will be required when we define our GitHub Actions workflow.

### The Workflow

The workflow will be split into two jobs:

1.  Build the service.
2.  Build the custom Azure VM image.

For brevity, I will only go into details on the image building job, but a complete workflow file can be found as part of the above linked GitHub repository.

We will actually start not in the code, but instead, by creating secrets that will be used by the workflow. To create secrets under the repository (it can also be done at the organization level) go to:

Repository Settings => Secrets => New repository secret

The secrets we will create are:

-   CLIENT\_ID — output from the Azure CLI commands above.
-   CLIENT\_SECRET — output from the Azure CLI commands above.
-   RESOURCE\_GROUP\_NAME — the name of a pre-existing resource group.
-   SUBSCRIPTION\_ID — output from the Azure CLI commands above.
-   TENANT\_ID — output from the Azure CLI commands above.

Now we can move to the workflow file (needs to be placed under `./.github/workflows` for GitHub to detect it), which will have a `build-image` job which relies on the completion of the source building job. the job will:

-   Checkout the repository, so the Packer script is available to the workflow
-   Download the artifacts of the previous source building job
-   Install the latest Packer version
-   Run the Packer script by executing the `packer build` command and passing variables to it using `-var`

The workflow should look like the following:

```yaml
name: Build VM Image
on:
  workflow_dispatch:
  push:
    branches: 
    - main

env:
  DOTNET_VERSION: '6.0.x'
  APP_PACKAGE_NAME: 'app-package'
  RESOURCE_GROUP_NAME: 'rg-github-actions-packer'
  APP_NAME: 'WebApi'
  IMAGE_NAME: 'WebApi-${{ github.run_id }}'

jobs:
  build-source:
    name: Build Source
    runs-on: ubuntu-latest
    steps:
    - name: Checkout repository
      uses: actions/checkout@v2
    - name: Setup .NET Core
      uses: actions/setup-dotnet@v1
      with:
        dotnet-version: ${{ env.DOTNET_VERSION }}
    - name: Install dependencies
      run: |
        cd src
        dotnet restore
    - name: Build
      run: |
        cd src
        dotnet build --configuration Release --no-restore
        dotnet publish -c Release -o ./publish -r linux-x64 --self-contained true
    - name: Upload app
      uses: actions/upload-artifact@v2
      with:
        name: ${{ env.APP_PACKAGE_NAME }}
        path: ./src/publish/**
  
  build-image:
    name: Build VM Image
    runs-on: ubuntu-latest
    needs: build-source
    steps:
    - name: Checkout repository
      uses: actions/checkout@v2
    - name: Download app
      uses: actions/download-artifact@v2
      with:
        name: ${{ env.APP_PACKAGE_NAME }}
        path: ./app-package
    - name: Use latest Packer
      uses: hashicorp-contrib/setup-packer@v1
    - name: Build image from template
      run: >
        packer build
        -var="client_id=${{ secrets.CLIENT_ID }}"
        -var="client_secret=${{ secrets.CLIENT_SECRET }}"
        -var="subscription_id=${{ secrets.SUBSCRIPTION_ID }}"
        -var="tenant_id=${{ secrets.TENANT_ID }}"
        -var="resource_group_name=${{ secrets.RESOURCE_GROUP_NAME }}"
        -var="image_name=${{ env.IMAGE_NAME }}"
        -var="app_path=./app-package/"
        -var="service_name=${{ env.APP_NAME }}"
        -var="executable_name=${{ env.APP_NAME }}"
        ./eng
```

### Testing

Testing the generated image only requires us to create a new Azure VM using that image and either opening the port the service exposes or connecting to the VM using `ssh`. If we connect to the VM using `ssh`, running `systemctl status WebApi.service` should show our service’s logs.

### Conclusion

If you are planning a multi-cloud solution, the above solution can be adjusted, without too much effort, to create the images on multiple clouds at once. If you are only planning to run on Azure, you cloud also check the Azure Image Builder tool, developed by Microsoft and based on HashiCorp’s Packer (so you can even use the same script).
