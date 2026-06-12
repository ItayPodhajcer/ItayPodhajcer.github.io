---
title: "Running a Parity Docker Container with Custom Configuration"
description: "Running the Parity Ethereum Client as a Docker container with a custom configuration is a relatively  simple task, that usually only…"
pubDate: "2019-12-22T11:13:33.736Z"
heroImage: "./1_RY_gvGJZlPcuQU03-3iJLQ.png"
heroImageAlt: "Running a Parity Docker Container with Custom Configuration"
mediumUrl: "https://medium.com/@itaypodhajcer/running-a-parity-docker-container-with-custom-configuration-938ba0ecde3e"
tags:
  - "Docker"
  - "Ethereum"
  - "Parity"
  - "Docker Compose"
---

Running the [Parity Ethereum Client](https://www.parity.io/ethereum/) as a [Docker](https://www.docker.com/) container with a custom configuration is a relatively simple task, that usually only requires mounting one or two files (depending whether a custom chain is also configured or not) to the container.

### TL;DR

A GitHub repository with the complete example is available here:

> [**GitHub - ItayPodhajcer/parity-docker-custom-configuration**](https://github.com/ItayPodhajcer/parity-docker-custom-configuration)
> 
> Contribute to ItayPodhajcer/parity-docker-custom-configuration development by creating an account on GitHub.

To start, we’ll create two directories:

-   `src`: will contain the configuration files
-   `eng`: will contain the docker compose file

### Generate Wallet

To generate a wallet, use whatever client you feel comfortable with, such as [MyCrypto](https://mycrypto.com/account) which has both an online and a desktop version.  
You can also use something like [Secure Password Generator](https://passwordsgenerator.net/) to easily generate a password that meets the required complexity policy.

### Chain Genesis File

Create a `chain.json` file inside the `src` directory. We won’t be using one of the predefined configurations (taken from [here](https://wiki.parity.io/Chain-specification#chain-presets-available)):

-   [`mainnet`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/foundation.json) (default) main Ethereum network
-   [`kovan`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/kovan.json) [or](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/kovan.json) [`testnet`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/kovan.json) the [fast Ethereum test network](https://github.com/kovan-testnet/config)
-   [`ropsten`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/ropsten.json) the old Ethereum test network
-   [`classic`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/classic.json) Ethereum Classic network
-   [`classic-testnet`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/morden.json) original Morden testnet and current Ethereum Classic testnet
-   [`expanse`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/expanse.json) Expanse network
-   [`dev`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/instant_seal.json) a [Private development chain](https://wiki.parity.io/Private-development-chain) to be used locally, submitted transactions are inserted into blocks instantly without the need to mine
-   [`musicoin`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/musicoin.json) Musicoin network
-   [`ellaism`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/ellaism.json) Ellaism network
-   [`tobalaba`](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/ethereum/tobalaba.json) EWF Tobalaba network

Instead, we’ll use the `dev` chain file found [here](https://github.com/paritytech/parity-ethereum/blob/master/ethcore/res/instant_seal.json) and copy it’s content to our file, so we can customize it with the wallet address we generated.  
Look for the `accounts` section and add an entry at the end with the address of the generated wallet:

```json
"8e337cf273111ccfa7c33cca3a0600ee5706e68c": { "balance": "1000000000000000000000000000" }
```

### Configuration File

Next we create a `config.toml` file, also inside the `src` directory. Our configuration file will be very simple, just the base directory and the path to the `chain.json` file:

```toml
[parity]                                
# Custom chain                                
chain = "/home/parity/.local/share/io.parity.ethereum/chain.json"                                
# Blockchain and settings will be stored in ./.
base_path = "./"
```

For more complex configurations, considering using the [Parity Config Generator](https://paritytech.github.io/parity-config-generator), as it greatly simplifies the process of creating the configuration file by providing an explanation on the available options and possible values where relevant.

### Docker Compose File

Our docker compose file (`docker-compose.yml`), which will be created in the `eng` directory, will have only one service defined for the purpose of this example, but can be extended with whichever container you may require. The service will be a Parity container (obviously) with the two configuration files mounted to the `/home/parity/.local/share/io.parity.ethereum` directory with the ports 8545, 8546, 30303 and 30303/udp exposed. The end result should look like this:

```yaml
version: '3.7'
services:
  parity:
    container_name: custom-parity
    image: parity/parity
    volumes: 
      - ../src/chain.json:/home/parity/.local/share/io.parity.ethereum/chain.json
      - ../src/config.toml:/home/parity/.local/share/io.parity.ethereum/config.toml
    command: --config /home/parity/.local/share/io.parity.ethereum/config.toml
    restart: always
    ports:
      - 8545:8545
      - 8546:8546
      - 30303:30303
      - 30303:30303/udp
```

### Running The Container

Now the only thing left to do to run the container is execute `docker-compose up` from the directory containing the YAML file, or `docker-compose -f <path to YAML file> up` from any other path.
