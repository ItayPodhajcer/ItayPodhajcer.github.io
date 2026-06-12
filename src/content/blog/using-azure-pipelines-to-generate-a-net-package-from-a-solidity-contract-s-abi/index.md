---
title: "Using Azure Pipelines to Generate a .NET Package from a Solidity Contract's ABI"
description: "Most commonly, Azure Pipelines is used to build, publish and/or deploy software artifacts. But, as it is possible to execute…"
pubDate: "2020-02-10T20:57:12.297Z"
heroImage: "./1_wW2gnuDrCddSnfZtMaFcmg.png"
heroImageAlt: "Using Azure Pipelines to Generate a .NET Package from a Solidity Contract's ABI"
mediumUrl: "https://medium.com/@itaypodhajcer/using-azure-pipelines-to-generate-a-net-package-from-a-solidity-contracts-abi-bd6002198184"
tags:
  - "Solidity"
  - "Ethereum"
  - "Smart Contracts"
  - "DevOps"
  - "Dotnet"
---

Most commonly, Azure DevOps pipelines are used to build, publish and/or deploy software artifacts. But, as it is possible to execute arbitrary tools available thorough the various package managers (npm, NuGet, pip and more), you can also use such tools to generate software artifacts from “thin air”, sort of speak. This means that a DevOps engineer can deliver a Nuget package for .NET developers to consume in their applications, without writing an actual class library, pretty cool!

In this article we will be using one of [Nethereum](https://nethereum.com/)’s tools inside a multi-stage Azure Pipelines `YAML` script to:

1.  Build a solidity contract.
2.  Create a .NET class library project.
3.  Generate C# classes using the compiled contract’s ABI.
4.  Build and pack the .NET class library into a NuGet package
5.  Push the NuGet package to a feed

We won’t be covering the first step in this article, as a complete example of creating an Azure pipeline to build a Solidity contract was discussed in one of my previous articles:

> [**Using Azure DevOps Pipelines to Build a Solidity Smart Contract**](https://www.itaypodhajcer.com/using-azure-devops-pipelines-to-build-a-solidity-smart-contract-a5b448d540fd)
> 
> In real world scenarios, a developer usually doesn’t deploy a software component to a production environment straight…

### Source Code Repository

The repository containing the complete azure pipelines `YAML` script and a simple solidity contract (based on the above previous article) can be found here:

> [**GitHub - ItayPodhajcer/dotnet-solidity-build-pipeline**](https://github.com/ItayPodhajcer/dotnet-solidity-build-pipeline)
> 
> Contribute to ItayPodhajcer/dotnet-solidity-build-pipeline development by creating an account on GitHub.

### The Pipeline Script

We will start by creating a `stage` for the steps from the previous article (the steps for building the Solidity contract) and call it `build_contract`. Next, we will create a new `stage` for generating and publishing the NuGet package and call it `generate_dotnet_nuget`.

-   The first thing we will add to our stage is a dependency on the previous one, meaning, we only want the second stage to execute when the first one completed successfully:

```yaml
- stage: 'generate_dotnet_nuget'
  dependsOn: 'build_contract'
  condition: succeeded('build_contract')
```

-   We will be using a `deployment` job with a `runOnce` strategy:

```yaml
jobs:
  - deployment: 'generate_dotnet_nuget'
    pool:
      vmImage: 'ubuntu-latest'
    environment: 'website-$(Build.SourceBranchName)'
    strategy:
      runOnce:
        deploy: 
          steps:
```

-   Now we will added the steps for our `stage` starting by ensuring we have `netcore2.1` available on the build agent:

```yaml
- task: UseDotNet@2
  enabled: true
  inputs:
    packageType: 'sdk'
    version: '2.1.x'
  displayName: 'use netcore 2.1.x'
```

The above step is required, as at the writing of these article:

1.  Nethereum command line tool failed if not ran with `netcore2.1`.
2.  The was a problem with `nuget tool install`, where the tools’ folder is not present in the `PATH` variable and the above step fixes that.

-   Now we can install the tool we will use the generate the C# files, `Nethereum.Generator.Console`:

```yaml
- task: DotNetCoreCLI@2
  inputs:
    command: 'custom'
    custom: 'tool'
    arguments: 'install -g Nethereum.Generator.Console'
  displayName: 'install Nethereum'
```

-   Create a new C# class library:

```yaml
- task: DotNetCoreCLI@2
  inputs:
    command: 'custom'
    custom: 'new'
    arguments: 'classlib -n $(libraryName) -o $(System.DefaultWorkingDirectory)/classlib/'
  displayName: 'create project'
```

We don’t need to keep a project in source control as we can always re-generate the project and build it with a new set of generated C# files.

-   Add the package `Nethereum.Web3` which will be required by the generated C# code:

```yaml
- task: DotNetCoreCLI@2
  inputs:
    command: 'custom'
    custom: 'add'
    arguments: 'package Nethereum.Web3'
    workingDirectory: '$(System.DefaultWorkingDirectory)/classlib/'
  displayName: 'add package Nethereum.Web3'
```

-   Clear the initial C# files generated with the class library as we don’t need them:

```yaml
- script: |
    rm $(System.DefaultWorkingDirectory)/classlib/*.cs
  displayName: 'remove default C# files'
```

-   Extract the compiled Solidity contract from the previous `stage`:

```yaml
- task: ExtractFiles@1
  inputs:
    archiveFilePatterns: '$(Pipeline.Workspace)/$(contractName)-drop-$(Build.BuildId)/*.zip'
    destinationFolder: '$(System.DefaultWorkingDirectory)/contract/'
  displayName: 'extract contract'
```

-   Generate the C# files using the Nethereum tool we installed in a previous step:

```yaml
- script: |
    Nethereum.Generator.Console generate from-truffle -d $(System.DefaultWorkingDirectory)/contract/ -o $(System.DefaultWorkingDirectory)/classlib/ -ns $(libraryName)
  displayName: 'generate dotnet code'
```

-   Build and pack the project into a NuGet package containing the compiled library:

```yaml
- task: DotNetCoreCLI@2
  inputs:
    command: 'custom'
    custom: 'pack'
    workingDirectory: '$(System.DefaultWorkingDirectory)/classlib/'
    arguments: '-p:PackageVersion=$(pacakgeVersion) --version-suffix "pre-$(Build.BuildId)" -o $(Build.ArtifactStagingDirectory)/'
  displayName: 'dotnet pack'
```

-   And finally, push the package to a NuGet feed (in this case I’m using an internal Azure DevOps feed called `internal-nuget`):

```yaml
- task: DotNetCoreCLI@2
  inputs:
    command: 'push'
    searchPatternPush: '$(Build.ArtifactStagingDirectory)/*.nupkg'
    feedPublish: 'internal-nuget'
  displayName: 'dotnet nuget push'
```

The complete `YAML` script should look similar to this:

```yaml
trigger:
  - master
  
variables:
  contractName: 'SimpleExample'
  libraryName: 'Example.Contracts'
  pacakgeVersion: '1.0.0'

stages:
- stage: 'build_contract'
  jobs:
  - job: 'build_contract'
    pool:
      vmImage: 'ubuntu-latest'
    steps:
    - task: Npm@1
      inputs:
        command: 'install'
      displayName: npm install
    - script: |
        cd src
        npx truffle compile contracts/$(contractName).sol
      displayName: truffle compile $(contractName)
    - task: ArchiveFiles@2
      inputs:
        rootFolderOrFile: '$(System.DefaultWorkingDirectory)/src/build/contracts/$(contractName).json'
        includeRootFolder: false
        archiveType: 'zip'
        archiveFile: '$(Build.ArtifactStagingDirectory)/$(contractName)-$(Build.BuildId).zip'
      displayName: archive contract $(contractName)
    - task: PublishBuildArtifacts@1
      inputs:
        PathtoPublish: '$(Build.ArtifactStagingDirectory)/$(contractName)-$(Build.BuildId).zip'
        ArtifactName: $(contractName)-drop-$(Build.BuildId)
      displayName: publish contract $(contractName)

- stage: 'generate_dotnet_nuget'
  dependsOn: 'build_contract'
  condition: succeeded('build_contract')
  jobs:
  - deployment: 'generate_dotnet_nuget'
    pool:
      vmImage: 'ubuntu-latest'
    environment: 'website-$(Build.SourceBranchName)'
    strategy:
      runOnce:
        deploy: 
          steps:
          - task: UseDotNet@2
            enabled: true
            inputs:
              packageType: 'sdk'
              version: '2.1.x'
            displayName: 'use netcore 2.1.x'
          - task: DotNetCoreCLI@2
            inputs:
              command: 'custom'
              custom: 'tool'
              arguments: 'install -g Nethereum.Generator.Console'
            displayName: 'install Nethereum'
          - task: DotNetCoreCLI@2
            inputs:
              command: 'custom'
              custom: 'new'
              arguments: 'classlib -n $(libraryName) -o $(System.DefaultWorkingDirectory)/classlib/'
            displayName: 'create project'
          - task: DotNetCoreCLI@2
            inputs:
              command: 'custom'
              custom: 'add'
              arguments: 'package Nethereum.Web3'
              workingDirectory: '$(System.DefaultWorkingDirectory)/classlib/'
            displayName: 'add package Nethereum.Web3'
          - script: |
              rm $(System.DefaultWorkingDirectory)/classlib/*.cs
            displayName: 'remove default C# files'
          - task: ExtractFiles@1
            inputs:
              archiveFilePatterns: '$(Pipeline.Workspace)/$(contractName)-drop-$(Build.BuildId)/*.zip'
              destinationFolder: '$(System.DefaultWorkingDirectory)/contract/'
            displayName: 'extract contract'
          - script: |
              Nethereum.Generator.Console generate from-truffle -d $(System.DefaultWorkingDirectory)/contract/ -o $(System.DefaultWorkingDirectory)/classlib/ -ns $(libraryName)
            displayName: 'generate dotnet code'
          - task: DotNetCoreCLI@2
            inputs:
              command: 'custom'
              custom: 'pack'
              workingDirectory: '$(System.DefaultWorkingDirectory)/classlib/'
              arguments: '-p:PackageVersion=$(pacakgeVersion) --version-suffix "pre-$(Build.BuildId)" -o $(Build.ArtifactStagingDirectory)/'
            displayName: 'dotnet pack'
          - task: DotNetCoreCLI@2
            inputs:
              command: 'push'
              searchPatternPush: '$(Build.ArtifactStagingDirectory)/*.nupkg'
              feedPublish: 'internal-nuget'
            displayName: 'dotnet nuget push'
```

We can now run our pipeline, and when it completes, we should have a new NuGet package published to our feed.

### Conclusion

Some aspects of this example were simplified to not over complicate the script. Some of the changes that might make sense in a production pipeline might include improvements such as receiving the package version from an external variable, building multiple contracts and generating a single package for all those contracts in a single multi-stage pipeline and maybe even run tests on the compiled contracts.
