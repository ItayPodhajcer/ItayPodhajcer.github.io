---
title: "Creating a Custom Azure Function Trigger That Listens to Ethereum Contract Events"
description: "More common than not, blockchain based systems and solutions are more than just the deployed smart contracts. There usually is a client…"
pubDate: "2020-01-12T17:36:41.002Z"
heroImage: "./1_3DT4IMJYY3y7LTaFASCv1A.png"
heroImageAlt: "Creating a Custom Azure Function Trigger That Listens to Ethereum Contract Events"
tags:
  - "Ethereum"
  - "Azure Functions"
  - "Solidity"
  - "Azure"
  - "CSharp"
---

More common than not, blockchain based systems and solutions are more than just the deployed smart contracts. There usually is a client application, and sometimes, there are additional backend components, which in some cases, listen to events raised by those deployed contracts.

One of the concepts available today when developing a system’s backend is serverless architecture. This article shows how to create an Azure Function, Microsoft’s serverless implementation, that is triggered when an event happens on an Ethereum based deployed smart contract.

### TL;DR

The entire source code for this article, including a test application, is available here:

> [**GitHub - ItayPodhajcer/ethereum-event-azure-function-trigger**](https://github.com/ItayPodhajcer/ethereum-event-azure-function-trigger)
> 
> Contribute to ItayPodhajcer/ethereum-event-azure-function-trigger development by creating an account on GitHub.

### Prerequisites

As the Azure Function custom trigger will be written in C#, we will be needing an suitable editor. I chose to use Visual Studio 2019, which you can find its community edition [here](https://visualstudio.microsoft.com/downloads/).

Now, because we will be needing to interact with a deployed contract, we can use the local docker based Parity deployment I described in this article, including the available wallet:

> [**Running a Parity Docker Container with Custom Configuration**](https://www.itaypodhajcer.com/running-a-parity-docker-container-with-custom-configuration-938ba0ecde3e)
> 
> Running the Parity Ethereum Client as a Docker container with a custom configuration is a relatively simple task, that…

And compile the contract used in this article:

> [**Using Azure DevOps Pipelines to Build a Solidity Smart Contract**](https://www.itaypodhajcer.com/using-azure-devops-pipelines-to-build-a-solidity-smart-contract-a5b448d540fd)
> 
> In real world scenarios, a developer usually doesn’t deploy a software component to a production environment straight…

Once compiled, just use your favorite wallet to deploy the contract (such as [MyCrypto](https://mycrypto.com/account)).

### Implementing a Trigger

To create a custom C# trigger we will need to implement the following:

-   An attribute that will be used to decorate the parameter which will be receiving the data from the trigger.
-   A listener that will be the actual component that polls the contract for events
-   And 3 more interfaces used for configuring and wiring the attribute and the listener.

### The Attribute

We will start by writing the attribute. As far as the attribute goes, there is nothing special that needs to be added to. We will just define 4 fields that we will use to gather the information required for connecting to a specific event: the Ethereum client URL (with a default of a local address of [http://localhost:8545/),](http://localhost:8545/%29,) the contract’s ABI, the contract’s address and the event we want to poll:

```csharp
[Binding]
[AttributeUsage(AttributeTargets.Parameter)]
public sealed class EthereumEventTriggerAttribute : Attribute 
{
	private const string DefaultUrl = "http://localhost:8545/";

	public EthereumEventTriggerAttribute(string abi, string contractAddress, string eventName, string url = DefaultUrl)
	{
		Url = url;  
		Abi = abi;
		ContractAddress = contractAddress;
		EventName = eventName;
	}

	public string Url { get; private set; }
	public string Abi { get; private set; }
	public string ContractAddress { get; private set; }
	public string EventName { get; set; }
}
```

### The Listener

Next we will write the listener. As we are using C#, we can use [Nethereum](https://nethereum.com/)’s library to interact with Ethereum based blockchains. We will need to create a new instance of `Web3` with the URL of the client we are connecting, get the contract we want to interact with by calling `Eth.GetContract` on the `Web3` instance with the contract’s ABI and address and finally, get the event by calling `GetEvent` on the `Contract` instance.

The listener itself needs to be based on the `IListener` interface, which requires us to implement the `Cancel`, `Dispose`, `StartAsync` and `StopAsync` methods. We will use the `StartAsync` to do our initial setup of the connection to the contract:

```csharp
public async Task StartAsync(CancellationToken cancellationToken)
{
	_cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

	var web3 = new Web3(_attribute.Url);
	var contract = web3.Eth.GetContract(_attribute.Abi, _attribute.ContractAddress);

	_event = contract.GetEvent(_attribute.EventName);
	_filter = await _event.CreateFilterAsync();

	ListenAsync(_cts.Token);
}
```

And then the methods that actually do the interaction work:

-   execute a loop that polls the contract for changes:

```csharp
private async void ListenAsync(CancellationToken cancellationToken)
{
	await Task.Run(async () =>
	{
		while (!cancellationToken.IsCancellationRequested)
		{
			var eventsData = await _event.GetFilterChangeDefault(_filter);

			ProcessEvents(eventsData, cancellationToken);
			await Task.Delay(EventPollingDelay);
		}
	});
}
```

-   Process the list of new events:

```csharp
private void ProcessEvents(List<EventLog<List<ParameterOutput>>> eventsData, CancellationToken cancellationToken)
{
	eventsData
		.Select(eventData => ExtractEventData(eventData.Event, eventData.Log))
		.ToList()
		.ForEach(ethereumEventData => _executor.TryExecuteAsync(new TriggeredFunctionData { TriggerValue = ethereumEventData }, cancellationToken));
}
```

-   Extract the information of each event:

```csharp
private EthereumEventData ExtractEventData(List<ParameterOutput> eventParams, FilterLog log)
{
    Dictionary<string, string> values = eventParams.ToDictionary(eventParam => eventParam.Parameter.Name, eventParam => eventParam.Result.ToString());

    return new EthereumEventData
    {
        Values = values,
        BlockNumber = log.BlockNumber
    };
}
```

The complete listener should be similar to this:

```csharp
public class EthereumEventListener : IListener
{
	private const int EventPollingDelay = 1000;

	private readonly ITriggeredFunctionExecutor _executor;
	private readonly EthereumEventTriggerAttribute _attribute;
	private CancellationTokenSource _cts = null;
	private Event _event = null;
	private HexBigInteger _filter = null;

	public EthereumEventListener(ITriggeredFunctionExecutor executor, EthereumEventTriggerAttribute attribute)
	{
		_executor = executor;
		_attribute = attribute;
	}

	public void Cancel()
	{
		StopAsync(CancellationToken.None).Wait();
	}

	public void Dispose() { }

	public async Task StartAsync(CancellationToken cancellationToken)
	{
		_cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

		var web3 = new Web3(_attribute.Url);
		var contract = web3.Eth.GetContract(_attribute.Abi, _attribute.ContractAddress);

		_event = contract.GetEvent(_attribute.EventName);
		_filter = await _event.CreateFilterAsync();

		ListenAsync(_cts.Token);
	}

	public Task StopAsync(CancellationToken cancellationToken)
	{
		_cts.Cancel();

		return Task.CompletedTask;
	}

	private async void ListenAsync(CancellationToken cancellationToken)
	{
		await Task.Run(async () =>
		{
			while (!cancellationToken.IsCancellationRequested)
			{
				var eventsData = await _event.GetFilterChangeDefault(_filter);

				ProcessEvents(eventsData, cancellationToken);
				await Task.Delay(EventPollingDelay);
			}
		});
	}

	private void ProcessEvents(List<EventLog<List<ParameterOutput>>> eventsData, CancellationToken cancellationToken)
	{
		eventsData
			.Select(eventData => ExtractEventData(eventData.Event, eventData.Log))
			.ToList()
			.ForEach(ethereumEventData => _executor.TryExecuteAsync(new TriggeredFunctionData { TriggerValue = ethereumEventData }, cancellationToken));
	}

	private EthereumEventData ExtractEventData(List<ParameterOutput> eventParams, FilterLog log)
	{
		Dictionary<string, string> values = eventParams.ToDictionary(eventParam => eventParam.Parameter.Name, eventParam => eventParam.Result.ToString());

		return new EthereumEventData
		{
			Values = values,
			BlockNumber = log.BlockNumber
		};
	}
}
```

### Configuration & Wiring

Now that we are done with the attribute and the listener, we move on to the interfaces required for configuring and wiring our previous classes:

-   An implementation of `ITriggerBinding` that creates an instance of the listener.

```csharp
internal class EthereumEventTriggerBinding : ITriggerBinding
{
	private readonly EthereumEventTriggerAttribute _attribute;

	public EthereumEventTriggerBinding(EthereumEventTriggerAttribute attribute)
	{
		_attribute = attribute;
	}

	public Type TriggerValueType => typeof(EthereumEventData);

	public IReadOnlyDictionary<string, Type> BindingDataContract => new Dictionary<string, Type>();

	public Task<ITriggerData> BindAsync(object value, ValueBindingContext context)
	{
		return Task.FromResult<ITriggerData>(new TriggerData(null, new Dictionary<string, object>()));
	}

	public Task<IListener> CreateListenerAsync(ListenerFactoryContext context)
	{
		return Task.FromResult<IListener>(new EthereumEventListener(context.Executor, _attribute));
	}

	public ParameterDescriptor ToParameterDescriptor()
	{
		return default;
	}
}
```

-   An implementation of `ITriggerBindingProvider` that creates an instance of the implementation of `ITriggerBinding`.

```csharp
public class EthereumEventTriggerBindingProvider : ITriggerBindingProvider
{
	public Task<ITriggerBinding> TryCreateAsync(TriggerBindingProviderContext context)
	{
		var result = Task.FromResult<ITriggerBinding>(default);
		var attribute = context.Parameter.GetCustomAttribute<EthereumEventTriggerAttribute>(false);

		if (attribute != null)
		{
			result = Task.FromResult<ITriggerBinding>(new EthereumEventTriggerBinding(attribute));
		}

		return result;
	}
}
```

-   And an implementation of `IExtensionConfigProvider` which we use to configure a rule that wires our attribute with the implementation of `ITriggerBindingProvider`.

```csharp
[Extension("EthereumEventTrigger")]
public class EtheremEventConfigProvider : IExtensionConfigProvider
{
	public void Initialize(ExtensionConfigContext context)
	{
		context
			.AddBindingRule<EthereumEventTriggerAttribute>()
			.BindToTrigger<EthereumEventData>(new EthereumEventTriggerBindingProvider());
	}
}
```

### Testing The Trigger

To test our trigger, we will create a new empty Azure Function app project, add one function class (make sure you set the `Abi`, `ContractName` and `EventName` constants to the values of your deployed environment):

```csharp
public static class EthereumEventTriggeredFunction
{
	private const string Abi = "";
	private const string ContractAddress = "";
	private const string EventName = "";

	[FunctionName(nameof(EthereumEventTriggeredFunction))]
	public static void Run([EthereumEventTrigger(abi: Abi, contractAddress: ContractAddress, eventName: EventName)]EthereumEventData eventData, ILogger logger)
	{
		string logMessage = $"Event data:\nBlock number: {eventData.BlockNumber}\n{string.Join('\n', eventData.Values.Select(value => $"{value.Key}: {value.Value}"))}";

		logger.LogInformation(logMessage);
	}
}
```

And a startup class that initializes the app with our custom trigger:

```csharp
public class Startup : IWebJobsStartup
{
	public void Configure(IWebJobsBuilder builder)
	{
		builder.AddExtension<EtheremEventConfigProvider>();
	}
}
```

Note that an `assembly` directive indicating the startup type that needs to be used when activating the function app must be added (preferably in the `Startup.cs` file just after the `using` directives):

```csharp
[assembly: WebJobsStartup(typeof(EthereumEventTrigger.TestApp.Startup))]
```

### Conclusion

As this is only an example implementation, it is not “production” grade code. It’s missing things such as contract configuration information validation, extensive logging, failure recovery and more. Additionally, packaging the trigger in a Nuget package makes a lot more sense then adding a project reference.
