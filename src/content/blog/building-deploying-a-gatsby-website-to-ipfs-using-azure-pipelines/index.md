---
title: "Building & Deploying a Gatsby Website to IPFS Using Azure Pipelines"
description: "The InterPlanetary File System (IPFS) is not meant just for storing arbitrary folders and files, it can also be used to host and serve…"
pubDate: "2020-02-02T10:39:08.943Z"
heroImage: "./1_1qDxr864Qztsf5t3YJAxcw.png"
heroImageAlt: "Building & Deploying a Gatsby Website to IPFS Using Azure Pipelines"
tags:
  - "IPFS"
  - "Azure DevOps"
  - "Azure Pipelines"
  - "GatsbyJS"
---

The InterPlanetary File System (IPFS) is not meant just for storing arbitrary folders and files, it can also be used to host and serve static websites, such as Gatsby based websites. In this article we will be building and deploying a Gatsby website to a remote IPFS node using an Azure Pipelines YAML multi-stage script.

### Prerequisites

As we will need a basic Gatsby website project, we will need to install Node.js, which you can download from [here](https://nodejs.org/en/download/) and install it. Once installed, you will need to install Gatsby by running `npm install -g gatsby-cli`.

Additionally, we will need an IPFS node we can use for our uploads, so you can take a look one of my previous articles on running your own IPFS node on Azure:

> [**Running an InterPlanetary File System Node Using Azure Container Instances**](https://www.itaypodhajcer.com/running-an-interplanetary-file-system-node-using-azure-container-instances-5627814a48f5)
> 
> The InterPlanetary File System (IPFS) is a protocol and a network for storing and sharing data using a distributed file…

### Example Repository

As always, a GitHub repository with the complete example (including a Gatsby website and the Azure Pipelines YAML script) is available and can be found here:

> [**GitHub - ItayPodhajcer/gatsby-ipfs-azure-pipeline**](https://github.com/ItayPodhajcer/gatsby-ipfs-azure-pipeline)
> 
> Contribute to ItayPodhajcer/gatsby-ipfs-azure-pipeline development by creating an account on GitHub.

### The Website

We will keep the website a simple as possible, so the only thing we need to do is run `gatsby new website`, where `website` is the name of the folder that will container the generated website.

**Note:** at the writing of this article, Gatsby does not support relative paths when generating the website (there is a plugin called `gatsby-plugin-ipfs` that tries to fix that, but has problems), meaning, the final deployed website will only work properly when a custom domain is used to point to the IPFS hash. You can read more on custom domains [here](https://docs.ipfs.io/guides/examples/websites/).

### The Pipeline

We will be creating a multi-stage Azure Pipelines script, where one stage will perform all the build related tasks and the second stage, will perform the deployment to IPFS.

The build state will install `npm` packages, build the Gatsby website, create an archive of the build process and publish the archive as an artifact:

```yaml
- stage: build
  jobs:
  - job: build
    pool:
      vmImage: 'ubuntu-latest'
    steps:
    - script: |
        npm install
      displayName: 'npm install'
    - script: |
        npx gatsby build
      displayName: 'gatsby build'
    - task: ArchiveFiles@2
      inputs:
        rootFolderOrFile: '$(System.DefaultWorkingDirectory)/public/'
        includeRootFolder: false
        archiveType: 'zip'
        archiveFile: '$(Build.ArtifactStagingDirectory)/website-$(Build.BuildId).zip'
      displayName: 'archive website'
    - task: PublishPipelineArtifact@1
      inputs:
        targetPath: '$(Build.ArtifactStagingDirectory)/website-$(Build.BuildId).zip'
        ArtifactName: 'website-drop-$(Build.BuildId)'
      displayName: 'publish website artifact'
```

The deployment stage will only run if the build stage succeeded, this is done by specifying `dependsOn: ‘build’` and `condition: succeeded(‘build’)` in the stage definition. we will also define a local variable with the URL of the node we are deploying to (such as: [`http://ipfs-example.eastus2.azurecontainer.io:5001`](http://ipfs-example.eastus2.azurecontainer.io:5001)).

For the actual deployment task we will be using a small tool I wrote (`ipfs-add-folder`)that can recursively upload any given folder to IPFS. You can read more about it here:

> [**Using a Node.js Script to Upload a Folder to a Remote IPFS Node**](https://medium.com/cladular/using-a-node-js-script-to-upload-a-folder-to-a-remote-ipfs-node-255fa9e3b766)
> 
> Not always running ipfs add or browsing to the webui to upload a file or a folder is possible. There are scenarios…

The stage will extract the archive created in the build stage, install the above tool and run it:

```yaml
- stage: 'deploy'
  dependsOn: 'build'
  condition: succeeded('build')
  variables:
    IpfsRootUrl: '<IPFS NODE URL>' # Such as: http://ipfs-example.eastus2.azurecontainer.io:5001
  jobs:
    - deployment: 'deploy'
      pool:
        vmImage: 'ubuntu-latest'
      environment: 'website-$(Build.SourceBranchName)'
      strategy:
        runOnce:
          deploy: 
            steps:
            - task: ExtractFiles@1
              inputs:
                archiveFilePatterns: '$(Pipeline.Workspace)/website-drop-$(Build.BuildId)/*.zip'
                destinationFolder: '$(System.DefaultWorkingDirectory)/website/'
              displayName: 'extract website'
            - script: |
                sudo npm install -g ipfs-add-folder --ignore-scripts
              displayName: 'install ipfs-add-folder'
            - script: |
                ipfs-add-folder "$(System.DefaultWorkingDirectory)/website/" "$(IpfsRootUrl)"
              displayName: 'upload website'
```

The complete script should look similar to this:

```yaml
trigger:
- master

stages:
- stage: build
  jobs:
  - job: build
    pool:
      vmImage: 'ubuntu-latest'
    steps:
    - script: |
        npm install
      displayName: 'npm install'
    - script: |
        npx gatsby build
      displayName: 'gatsby build'
    - task: ArchiveFiles@2
      inputs:
        rootFolderOrFile: '$(System.DefaultWorkingDirectory)/public/'
        includeRootFolder: false
        archiveType: 'zip'
        archiveFile: '$(Build.ArtifactStagingDirectory)/website-$(Build.BuildId).zip'
      displayName: 'archive website'
    - task: PublishPipelineArtifact@1
      inputs:
        targetPath: '$(Build.ArtifactStagingDirectory)/website-$(Build.BuildId).zip'
        ArtifactName: 'website-drop-$(Build.BuildId)'
      displayName: 'publish website artifact'

- stage: 'deploy'
  dependsOn: 'build'
  condition: succeeded('build')
  variables:
    IpfsRootUrl: '<IPFS NODE URL>' # Such as: http://ipfs-example.eastus2.azurecontainer.io:5001
  jobs:
    - deployment: 'deploy'
      pool:
        vmImage: 'ubuntu-latest'
      environment: 'website-$(Build.SourceBranchName)'
      strategy:
        runOnce:
          deploy: 
            steps:
            - task: ExtractFiles@1
              inputs:
                archiveFilePatterns: '$(Pipeline.Workspace)/website-drop-$(Build.BuildId)/*.zip'
                destinationFolder: '$(System.DefaultWorkingDirectory)/website/'
              displayName: 'extract website'
            - script: |
                sudo npm install -g ipfs-add-folder --ignore-scripts
              displayName: 'install ipfs-add-folder'
            - script: |
                ipfs-add-folder "$(System.DefaultWorkingDirectory)/website/" "$(IpfsRootUrl)"
              displayName: 'upload website'
```

### Running The Pipeline

I won’t go over the process of configuring the pipeline in Azure DevOps, as I already described the process in a previous article:

> [**Using Azure DevOps Pipelines to Build a Solidity Smart Contract**](https://medium.com/cladular/using-azure-devops-pipelines-to-build-a-solidity-smart-contract-a5b448d540fd)
> 
> In real world scenarios, a developer usually doesn’t deploy a software component to a production environment straight…

### Conclusion

To make the above process more complete, tasks related to either DNS or IPNS updates (depending on the mechanism you choose) can also be added. The tool I wrote supports a `— quite` (or `-q`) option that only outputs the result hash of the root folder, which can be used as the value for the updates tasks.
