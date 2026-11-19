---
title: "Using Generative AI for a Self-Evolving Software Component"
description: "With all the hype around generative AI and the question of whether developers will be needed in the future or not, I decided to experiment…"
pubDate: "2023-09-11T16:26:26.737Z"
heroImage: "./1_y3v8EGSed29qg4lQJ1zU1Q.png"
heroImageAlt: "Using Generative AI for a Self-Evolving Software Component"
tags:
  - "OpenAI"
  - "Software Development"
  - "Cloud Computing"
  - "Software Engineering"
  - "AI"
---

With all the hype around generative AI and the question of whether developers will be needed in the future or not, I decided to experiment with on whether software can “write itself” or not, and that is exactly what we will be trying to implement in this article.

To keep it simple, we will be developing an ASP.NET Core web API that exposes math functions, but instead of writing the functions, we will be using the Azure OpenAI service and the Roslyn .NET compiler to generate and compile code dynamically as HTTP requests arrive to our API.

### Prerequisites

To develop and run our web API we will need:

-   The [.NET SDK](https://dotnet.microsoft.com/en-us/download).
-   An IDE, like [Visual Studio Code](https://code.visualstudio.com/download) for example.
-   An Azure subscription with Azure OpenAI enabled (at the writing of this article there is still a wait list an individual needs to register to through [this form](https://go.microsoft.com/fwlink/?linkid=2222006)) and GPT-4 Enabled (another wait list, registration through [this form](https://aka.ms/oai/get-gpt4), but should work with earlier version as well).
-   [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest) to create the resources on Azure (the portal can be used instead if prefered).

### Example Repository

As always, the complete code implementation can be found in the following GitHub repository:

> [**GitHub - ItayPodhajcer/azure-openai-evolving-webapi**](https://github.com/ItayPodhajcer/azure-openai-evolving-webapi)
> 
> Contribute to ItayPodhajcer/azure-openai-evolving-webapi development by creating an account on GitHub.

### The Code

We will start by creating a new ASP.NET Core Web API project using the following command:

```bash
dotnet new webapi -minimal -au None --no-https
```

This will create a minimal Web API project without authentication and HTTPS (to keep it simple).

Next, we will add the NuGet packages our code will need to do what we want:

```bash
dotnet add package Azure.AI.OpenAI --prerelease
dotnet add package Microsoft.CodeAnalysis.CSharp
```

Note that we are using a prerelease version of the OpenAI package, as at the writing of this article this was the only version available.

Now we can write the code, starting with `Program.cs` , first adding some instance registrations for the `OpenAIClient` and our AI code engine (which we will write next) and few environment variables to pass the URI, deployment name and key for Azure OpenAI (the rest is common Web API wiring):

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<IAICodeEngine, AICodeEngine>((services) =>
    new AICodeEngine(
        services.GetRequiredService<OpenAIClient>(),
        Environment.GetEnvironmentVariable("OPENAI_DEPOYMENT")));
builder.Services.AddSingleton(new OpenAIClient(
    new Uri(Environment.GetEnvironmentVariable("OPENAI_URI")),
    new AzureKeyCredential(Environment.GetEnvironmentVariable("OPENAI_API_KEY"))));
builder.Configuration.AddEnvironmentVariables();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

And we will add a “catch all” route, which in theory can catch all HTTP verbs at the route we define, but weonly need `GET`, so it should look like this:

```csharp
app.MapMethods("/math/{operation}/{*url}", new[] { "GET" }, async (HttpContext context, IAICodeEngine codeGenerator) =>
{
    var operationType = "math";
    var operation = context.Request.RouteValues["operation"]?.ToString() ?? string.Empty;
    var valuesString = context.Request.RouteValues["url"]?.ToString() ?? string.Empty;
    var values = valuesString.Split('/');
    var method = context.Request.Method;

    if (!codeGenerator.IsImplemented(operationType, operation))
    {
        await codeGenerator.ImplementAsync(operationType, operation, values.Length, values);
    }

    return codeGenerator.Execute(operationType, operation, values);
});

app.Run();
```

Which reads the operation and any additional values (number for the operation) from the path and then calls our AI code engine to check if the operation is implemented, call implement if not and then execute the operation with the passed values.

Now we will write the `AICodeEngine` class that is going to do all the magic. First, we will add some private members and a constructor to initialize them:

```csharp
private readonly OpenAIClient _openAIClient;
private readonly string _openAIDeployment;
private readonly Dictionary<string, OperationInfo> _operations = new();
private readonly IEnumerable<PortableExecutableReference> _coreReferences;

public AICodeEngine(OpenAIClient openAIClient, string openAIDeployment)
{
    _openAIClient = openAIClient;
    _openAIDeployment = openAIDeployment;

    _coreReferences =
        ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES"))
        .Split(Path.PathSeparator)
        .Select(path => MetadataReference.CreateFromFile(path));
}
```

They will hold the Azure OpenAI client and deployment name (we will be creating the deployment later), the already implanted operations and a list of code references we need to pass to Roslyn each time we compile generate code (we don’t need to create that list every time, so we do it once in the constructor).

Next, we add the `IsImplemented` method, which is pretty straight forward, just checks if an implementation is already available for an operation:

```csharp
public bool IsImplemented(string operationType, string operation) =>
    _operations.ContainsKey($"{operationType}-{operation}");
```

Now we move to the actual generation of new code:

```csharp
private async Task<string> GenerateCodeAsync(string operationType, string operation, int length, string[] examples)
{
    ChatMessage initializationMessage = new(ChatRole.System,
        $"You are a code generation assitant that generates c# classes with random unique names for {operationType} operations. the genrated code should include common using directives. Namespace should have a random unique name. The generated result should be without explanation and without formatting");

    ChatMessage generateCodeMessage = new(ChatRole.User,
        $"Generate a non-static {operation} function with a random unique name that accepts {length} arguments like {string.Join(" or ", examples)}");

    ChatCompletionsOptions chatCompletionsOptions = new(new [] { initializationMessage, generateCodeMessage })
    {
        Temperature = 0.5f
    };

    var response = await _openAIClient.GetChatCompletionsAsync(_openAIDeployment, chatCompletionsOptions);

    return response.Value.Choices[0].Message.Content;
}
```

This method first starts with an initialization message, which is our context in this case, that tells the service to generate c# namespaces and classes with unique random names for math operations, include common `using` directives, required for compilation, and asks for the result to be generated with explanation and formatting (code is usually format in a Markdown code block).

The second message is a user message asking to generate a function for a given operation using the number of values that were passed in the URL and using the values as examples, so it can determine the types (like `int` or `double` for example)

We also set the `Temperature` field to `0.5f` (default is `1.0f`) so the results we get a more predictable and less creative.

And then call the service and get the response, which is the generated code, that will be passed to the next method for compilation and loading:

```csharp
private Type CompileCode(string code)
{
    var syntaxTree = CSharpSyntaxTree.ParseText(code);

    var compilation = CSharpCompilation
        .Create(Path.GetRandomFileName())
        .WithOptions(new (OutputKind.DynamicallyLinkedLibrary))
        .AddReferences(_coreReferences)
        .AddSyntaxTrees(syntaxTree);

    var assembly = ReadAssembly(compilation);
    var type = assembly.GetTypes()
        .Where(type => !type.IsAssignableTo(typeof(Attribute)))
        .Single();

    return type;
}

private Assembly ReadAssembly(CSharpCompilation compilation)
{
    using MemoryStream stream = new();

    compilation.Emit(stream);

    var assembly = Assembly.Load(stream.ToArray());

    return assembly;
}
```

The method parses the code and compiles it as dynamically linked library with the core references we defined in the constructor. Next the compiled code is loaded to get the generated type so an instance can later be created and used by the next method that puts the previous pieces together:

```csharp
public async Task ImplementAsync(string operationType, string operation, int length, string[] examples)
{
    var code = await GenerateCodeAsync(operationType, operation, length, examples);
    var type = CompileCode(code);
    var method = type.GetMethods().First();
    var instance = Activator.CreateInstance(type);

    _operations.Add($"{operationType}-{operation}",
        new (instance,
            method.GetParameters()
                .Select(param => param.ParameterType)
                .ToArray(),
            method));
}
```

Note that it creates an instance and stores it in our implemented operations dictionary we defined at the beginning, along with the types of the parameters passed to the function extracted from the compiled type (also generated so we need to extract them to know to which types we should convert the values that were passed in the request).

The last method, after checking if an operation exists and creating an implementation of an operation, is executing it:

```csharp
public object Execute(string operationType, string operation, string[] values)
{
    var operationInfo = _operations[$"{operationType}-{operation}"];
    var args = values
      .Select((value, Index) => Convert.ChangeType(value, operationInfo.argsTypes[Index]))
      .ToArray();

    var result = operationInfo.MethodInfo.Invoke(operationInfo.OperationInstance, args);

    return result;
}
```

Which just pulls the operation from our existing operations dictionary, converts the values to the types the generated code expects, calls it, and returns the value.

That’s it, we have implemented a self-evolving Web API!

### Cloud Resources

The next thing we need to do is create an Azure OpenAI resource we can use, which is just a few Azure CLI calls away, starting with creating a resource group:

```bash
az group create \
--name rg-evolving-webapi \
--location eastus
```

Creating the Azure OpenAI resource:

```bash
az cognitiveservices account create \
--name oai-evolving-webapi \
--resource-group rg-evolving-webapi \
--location eastus \
--kind OpenAI \
--sku s0 \
```

Deploying a model:

```powershell
az cognitiveservices account deployment create `
--name oai-evolving-webapi `
--resource-group  rg-evolving-webapi `
--deployment-name evolvingwebapi `
--model-name gpt-4 `
--model-version "0613" `
--model-format OpenAI `
--scale-settings-scale-type "Standard"
```

Now we need to pull the endpoint URL:

```bash
az cognitiveservices account show \
--name oai-evolving-webapi \
--resource-group rg-evolving-webapi \
| jq -r .properties.endpoint
```

And the primary key:

```bash
az cognitiveservices account keys list \
--name oai-evolving-webapi \
--resource-group rg-evolving-webapi \
| jq -r .key1
```

And we are ready to run!

### Running The Web API

We will need to set the environment variables we defined in code with the values we used and pulled while creating the Azure OpenAI resource:

-   `OPENAI_DEPOYMENT` — the name of the deployment we defined (`evolvingwebapi` in the example above).
-   `OPENAI_URI` — the endpoint URL.
-   `OPENAI_API_KEY` — the primary key.

And once we have them set, just run `dotnet run`.

To test our service, grab the base URL it’s running on and try the following routes for example:

-   `/math/add/1.2/3.5`
-   `/math/div/4.5/2`
-   `/math/power/4/3`

Note that the first time an operation is called it takes longer to respond as the code is being generated, but the next calls are fast, as the logic is already ready for use.

### Conclusion

So, to answer the question whether software can write itself, the answer is **yes**, but it’s not as simple as it seems. We intentionally used something simple as math functions because it is quite easy to set a context for that. Real life systems are much more complex and will require setting a context that is much more elaborate, sometimes to elaborate to what is supported by the generative AI services.

On top of that, this generates code in a running application, which can be nice for small applications (proof-of-concept, simple minimum-viable-product, mockups and similar), but for large systems, which require clear release lifecycles (with everything that it means) and complex architectures, we are still not there.
