---
title: "Geo-Redundant Stateful Service Made Easy with ASP.NET Core, .NEXT and Azure Virtual Machines"
description: "The biggest challenge when developing stateful services, is synchronizing changes to state across all instances of a service. The purpose…"
pubDate: "2021-10-12T15:40:28.862Z"
heroImage: "./1_uMC61qsYlAT-A5SfQ9gc9Q.png"
heroImageAlt: "Geo-Redundant Stateful Service Made Easy with ASP.NET Core, .NEXT and Azure Virtual Machines"
mediumUrl: "https://medium.com/@itaypodhajcer/geo-redundant-stateful-service-made-easy-with-asp-net-core-next-and-azure-virtual-machines-950843bb26fd"
tags:
  - "AspNetCore"
  - "Dotnet"
  - "Azure"
  - "Software Development"
  - "Cloud Computing"
---

The biggest challenge when developing stateful services, is synchronizing changes to state across all instances of a service. The purpose of the synchronization process that is taking place constantly between all instances is to reach a single consensus on what is considered the correct state.

There are diverse ways to reach a consensus, referred to as consensus algorithms, but for the purpose of this article, we will be focusing on the [Raft](https://raft.github.io/) consensus algorithm. The Raft algorithm in considered relatively simple, as it defines a leader election mechanism, which is triggered when there is no available leader in the network, whether due to a fresh startup of the instances or failure of the previous leader. Once a leader is elected, only it is allowed to make changes to the state (state change requests to other nodes are redirected to the leader) and transmit them to the follower instances.

### Prerequisites

We will be developing the stateful service using ASP.NET Core, so the [.NET SDK](https://dotnet.microsoft.com/download) should be installed on the workstation (an IDE, such as Visual Studio or Visual Studio Code is not mandatory, but it does make life easier). For the deployment script we will be using Terraform to deploy to Azure, so both the [Terraform](https://learn.hashicorp.com/tutorials/terraform/install-cli) and [Azure](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest) CLIs should also be installed on the workstation.

### Example Repository

A complete example of the stateful ASP.NET Core service and Terraform script that can be used to deploy the infrastructure required to run the service on multiple virtual machines deployed in different geographical regions is available in the following GitHub repository:

> [**GitHub - ItayPodhajcer/georedundant-stateful-aspnetcore**](https://github.com/ItayPodhajcer/georedundant-stateful-aspnetcore)
> 
> Contribute to ItayPodhajcer/georedundant-stateful-aspnetcore development by creating an account on GitHub.

### The Service

We will be keeping the implementation as simple as possible, splitting the implementation into two files:

-   `Program.cs`: The entry point component, holding the code for bootstrapping all the required pieces to run the service (configuration, HTTP routes definition and component registration).
-   `ServiceState`: Will hold the derived custom implementation of the state synchronization mechanism.

For the actual Raft consensus algorithm, we will be using [.NEXT](https://dotnet.github.io/dotNext/)’s (.NEXT is part of the .NET Foundation) implementation, as it has all the parts to integrate with an ASP.NET Core service and extension points for fitting it to the state structure we will be implementing.

We will start by creating a new ASP.NET Core empty project by calling:  
`dotnet new web -o StatefulService`  
And deleting the `Startup.cs` file, as we will be writing all the bootstrapping code in the `Program.cs` file using the new top-level statements feature that was introduced in C# 9.0.

Next the following NuGet packages are installed in the project (using `dotnet add package <PACKAGE-NAME>` to add the ones that are missing):

-   `Microsoft.AspNetCore.Routing`
-   `Microsoft.Extensions.Configuration`
-   `Microsoft.Extensions.DependencyInjection`
-   `DotNext.AspNetCore.Cluster`
-   `DotNext.Net.Cluster`

Now we can start working on our code, starting with a new file called `ServiceState.cs` in which we will implement a component that will both hold the local state, a simple ledger defined using a dictionary with an integer field representing an ID and a string value, and the implementation for the state synchronization logic for our dictionary.

First, we define an interface that will be later used to access the service to read and update the state:

```csharp
public interface IServiceState
{
  Task SetStateAsync(int id, string State);
  ValueTask<string> GetStateAsync(int id);
}
```

Next, we create a class the derives from .NEXT’s `PersistentState`, that does disk persistency, state sending and receiving for us. We just implement the `ApplyAsync` protected function which is called when a consensus message arrives (along with the `UpdateValue` function that handles the case when the consensus message has an actual value), and our interface’s state getting and setting functions:

```csharp
internal class ServiceState : PersistentState, IServiceState
{
  private record LedgerStateEntry(int Id, string State);

  private ConcurrentDictionary<int, string> _stateLedger = new();

  public ServiceState()
    : base(Path.Combine(AppContext.BaseDirectory, Environment.ProcessId.ToString()), 50)
  { }

  public async Task SetStateAsync(int id, string state)
  {
    var entry = CreateJsonLogEntry(new LedgerStateEntry(id, state));

    var commitIndex = await AppendAsync(entry);
    
    await WaitForCommitAsync(commitIndex, Timeout.InfiniteTimeSpan, CancellationToken.None);
  }

  public ValueTask<string> GetStateAsync(int id) =>
    ValueTask
      .FromResult(_stateLedger
        .TryGetValue(id, out string state)
          ? state
          : default);

  protected override ValueTask ApplyAsync(LogEntry entry)
      => entry.Length == 0L ? new ValueTask() : UpdateValue(entry);
  
  private async ValueTask UpdateValue(LogEntry entry)
  {
    var jsonString = await entry.ToStringAsync(Encoding.UTF8);
    var value = (LedgerStateEntry) await entry
      .DeserializeFromJsonAsync(_ => typeof(LedgerStateEntry))
      .ConfigureAwait(false);

    _stateLedger.AddOrUpdate(value.Id, value.State, (_, _) => value.State);
  }
}
```

Note that we don’t change the state directly in `SetStateAsync`, instead, we create a new log entry message with the values for the state change, commit it (spreading it to all instances) and wait for the completion of the commit. We will then receive the log entry message we created through `ApplyAsync`, even when it was the same instance that originally committed the values. This is done to ensure correct propagation of the state across all the instances, even when failures occur.

The next file we will be implementing will be the `Program.cs` file. We will start by defining two functions that will be defining the endpoints of our service. One for reading the state (an HTTP PUT endpoint):

```csharp
void MapWriteEndpoints(IEndpointRouteBuilder endpoints) =>
  endpoints
    .MapPut("/{id:int}", async (context) =>
    {
      var id = int.Parse(context.Request.RouteValues["id"].ToString());
      var requestBody = await context.Request.ReadFromJsonAsync<PutStateRequest>();
      var serviceState = context.RequestServices.GetRequiredService<IServiceState>();

      await serviceState.SetStateAsync(id, requestBody.State);

      var cluster = context.RequestServices.GetRequiredService<IRaftCluster>();

      await context.Response.WriteAsJsonAsync(new PutStateResponse
      (
        Leader: cluster.Leader?.EndPoint.ToString(),
        Current: context.Request.Host.Value,
        Id: id,
        State: requestBody.State
      ));
    });
```

And one for reading the state (an HTTP GET endpoint):

```csharp
void MapReadEndpoints(IEndpointRouteBuilder endpoints) =>
  endpoints
    .MapGet("/{id:int}", async (context) =>
    {
      var id = int.Parse(context.Request.RouteValues["id"].ToString());
      var serviceState = context.RequestServices.GetRequiredService<IServiceState>();

      var state = await serviceState.GetStateAsync(id);

      var cluster = context.RequestServices.GetRequiredService<IRaftCluster>();

      await context.Response.WriteAsJsonAsync(new GetStateResponse
      (
        Leader: cluster.Leader?.EndPoint.ToString(),
        Current: context.Request.Host.Value,
        Id: id,
        State: state
      ));
    });
```

The types that are used by the above endpoints are defined as immutable `record` types in the following manner:

```csharp
record GetStateResponse(string Leader, string Current, int Id, string State);
record PutStateRequest(string State);
record PutStateResponse(string Leader, string Current, int Id, string State);
```

And lastly, we will implement the bootstrapping code at the top of the file (just after the using directives):

```csharp
var builder = Host.CreateDefaultBuilder(args);

var app = builder
  .ConfigureWebHostDefaults(webBuilder => webBuilder
    .Configure(app => app
      .UseConsensusProtocolHandler()
      .MapWhen(
        context => context.Request.Method != "GET",
        appBuilder => appBuilder
          .RedirectToLeader(string.Empty)
          .UseRouting()
          .UseEndpoints(MapWriteEndpoints))
      .UseRouting()
      .UseEndpoints(MapReadEndpoints))
    .ConfigureAppConfiguration((app, config) => config
      .AddCommandLine(args))
    .ConfigureServices(services => services
      .AddRouting()
      .UsePersistenceEngine<IServiceState, ServiceState>()))
  .JoinCluster()
  .Build();
```

The above code differs from regular ASP.NET Core bootstrapping in:

-   The call to `UseConsensusProtocolHandler` which adds the consensus mechanism middleware.
-   The call to `RedirectToLeader` which is performed to all HTTP verbs but GET, using a call to `MapWhen` to allow reading locally, but enforce redirection to the leader for write operations.
-   And the call to `JoinCluster` which, well, tells the service to join the cluster (defined on startup using a static list of IP addresses).

### Deployment

For brevity (and as the entire script is available in the above-mentioned GitHub repository, under the `eng` directory), I won’t be covering the common steps used to deploy a virtual machine on Azure, and instead, focus specifically on the mechanisms used to upload and the service’s code and configure the virtual machine, which in this article, are the Terraform provisioners.

The provisioners won’t be defined directly on the virtual machine resources, but a `null_resource` that will be executed per instance after all the virtual machines were deployed. The provisioners will:

-   Upload a `systemd` service file with a `dotnet` command which includes the [`http://0.0.0.0:80`](http://0.0.0.0:80) argument, which tells the service its network binding information, and a[`http://[INSTANCE-IP]:80`](http://[INSTANCE-IP]:80) argument for each of the instances, which defines the static instances list of the cluster. The file will be generated from the following template:

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

-   Install the ASP.NET Core 5.0 runtime.
-   Create the directlry which will be holding the service’s files.
-   Set the owner of that directory to the user that will be used to run the service.
-   Upload the service’s files.
-   Modify the permissions on the uploaded files to allow execution of the main file.
-   Allow the main executable file to open port 80, as Linux doesn't allow using reserved well-known ports (below port number 1024).
-   Restart the `systemd` daemon and enable and start the service.

```hcl
locals {
  service_file_content = templatefile("${path.module}/service.tpl", {
    name    = var.service_name
    command = var.command
  })
  service_tmp_path = "/tmp/${var.service_name}.service"
}

resource "null_resource" "main" {
  connection {
    type        = "ssh"
    user        = var.username
    private_key = var.ssh_private_key
    host        = var.host_ip_address
  }

  provisioner "file" {
    content     = local.service_file_content
    destination = local.service_tmp_path
  }

  provisioner "remote-exec" {
    inline = [
      "wget https://packages.microsoft.com/config/ubuntu/18.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb",
      "sudo dpkg -i packages-microsoft-prod.deb",
      "rm packages-microsoft-prod.deb",
      "sudo apt-get update",
      "sudo apt-get install -y apt-transport-https",
      "sudo apt-get update",
      "sudo apt-get install -y aspnetcore-runtime-5.0",
      "sudo mkdir -p ${var.destination_directory}",
      "sudo chown 1000:1000 ${var.destination_directory}",
      "sudo mv ${local.service_tmp_path} /etc/systemd/system/"
    ]
  }

  provisioner "file" {
    source      = var.source_directory
    destination = var.destination_directory
  }

  provisioner "remote-exec" {
    inline = [
      "sudo chmod 755 ${var.destination_directory}/*",
      "sudo setcap CAP_NET_BIND_SERVICE=+eip ${var.destination_directory}/*",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable ${var.service_name}.service",
      "sudo systemctl start ${var.service_name}.service"
    ]
  }
}
```

### Testing

To test our service instances, we can use `curl` (note that commands are in `PowerShell` syntax)to read the state if one of the dictionary’s rows using[`http://[INSTANCE-IP]/1`](http://127.0.0.1:5001/1) and for writing the state, we can use `curl.exe — % -i -L -X Put -d “{ \”state\”: \”Some String State\” }” -H “Content-Type: application/json” http://[INSTANCE-IP]/1`

Each call will return the current leader, so we will be able to play around with the instances we call for reading and writing, like:

-   Reading a first time from any of the instances (will return the leader’s IP and current instance IP)
-   Writing to a non-leader instance (will redirect to the leader)
-   Read from the second non-leader, which now should return the value that was synchronized from the leader.

### Conclusion

Two significant points need to be raised when implementing such a solution for production. The first is that it will create a much more resilient system if the instances can be discovered dynamically using an external mechanism such as multi-host DNS record or a configuration server (like `etcd` for example). The second point, is that Terraform provisioner are recommended to be used only as a last resort, and in this case, the better approach for deploying the services, would have been by creating a custom virtual machine image and then use that for the virtual machines (we didn’t do that for simplicity).
