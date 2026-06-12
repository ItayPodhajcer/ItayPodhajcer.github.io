---
title: "Creating a Custom Parity Docker Image"
description: "Creating a custom Parity Ethereum Client Docker image is done by writing a dockerfile script. To keep things a simple as possible, I’ll be…"
pubDate: "2019-12-29T08:31:43.389Z"
heroImage: "./1_Gxwlbo0O8vEjcwuspdYkAg.png"
heroImageAlt: "Creating a Custom Parity Docker Image"
mediumUrl: "https://medium.com/@itaypodhajcer/creating-a-custom-parity-docker-image-b59fc8aa2140"
tags:
  - "Docker"
  - "Ethereum"
  - "Docker Compose"
  - "Dockerfiles"
  - "Ethereum Blockchain"
---

Creating a custom Parity Ethereum Client Docker image is done by writing a dockerfile script. To keep things a simple as possible, I’ll be basing this article on my previous one, [Running a Parity Docker Container with Custom Configuration](https://medium.com/cladular/running-a-parity-docker-container-with-custom-configuration-938ba0ecde3e).

### TL;DR

A GitHub repository with the complete example is available here:

> [**GitHub - ItayPodhajcer/parity-docker-custom-image**](https://github.com/ItayPodhajcer/parity-docker-custom-image)
> 
> Contribute to ItayPodhajcer/parity-docker-custom-image development by creating an account on GitHub.

As in the previous article, we’ll have two directories:

-   `src`: will contain the configuration files
-   `eng`: will contain the dockerfile and a docker compose file for testing

I won’t go over generating a wallet, the `chain.json` and `config.toml` as they were already discussed in the previous article mentioned above.

### The Dockerfile

We’ll start by creating a `parity.dockerfile` in our `eng` directory, and base our custom image on the official `parity/parity` image, so the file will start with:

```dockerfile
FROM parity/parity
```

Next we’ll copy the two configuration files:

```dockerfile
COPY /src/chain.json /home/parity/.local/share/io.parity.ethereum/chain.json
COPY /src/config.toml /home/parity/.local/share/io.parity.ethereum/config.toml
```

Note: The paths used in the copy commands assume the docker build context will be set to the root directory

Lastly, we’ll updated the container execution command to use the configuration file we copied in the previous step:

```dockerfile
CMD [" - config","/home/parity/.local/share/io.parity.ethereum/config.toml" ]
```

The complete file should look like this:

```dockerfile
FROM parity/parity
COPY /src/chain.json /home/parity/.local/share/io.parity.ethereum/chain.json
COPY /src/config.toml /home/parity/.local/share/io.parity.ethereum/config.toml
CMD ["--config","/home/parity/.local/share/io.parity.ethereum/config.toml" ]
```

### Testing The Build Script

Here you have two options, either use the updated `docker-compose.yml` file, which now uses the dockerfile instead of the `parity/parity` image:

```yaml
parity:
  container_name: custom-parity
  image: parity-custom
  build:
    context: ../
    dockerfile: eng/parity.dockerfile
```

Or, use `docker build` to build the file:

```
docker build . -f eng/parity.dockerfile -t parity-custom
```

In a “real world” scenario, we would have pushed out custom image to a repository, so it could be used by other team members or other people in general.
