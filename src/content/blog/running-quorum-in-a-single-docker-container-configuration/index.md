---
title: "Running Quorum in a Single Docker Container Configuration"
description: "J.P. Morgan Chase’s Quorum is one of the currently available permissioned Ethereum clients, forked from the Go Ethereum client. When you…"
pubDate: "2020-02-18T09:31:25.795Z"
heroImage: "./1_7CeAWfvhqay4EDvijivNTQ.png"
heroImageAlt: "Running Quorum in a Single Docker Container Configuration"
tags:
  - "Quorum"
  - "Jp Morgan"
  - "Docker"
  - "Docker Compose"
  - "Ethereum"
---

J.P. Morgan Chase’s Quorum is one of the currently available permissioned Ethereum clients, forked from the Go Ethereum client. When you decide to run a containerized version of it, the first example you’ll encounter is probably their **7nodes** example located at the [quorum-examples](https://github.com/jpmorganchase/quorum-examples) GitHub repository.

But, what if you just need a simple single container configuration, to be used during development or small demos of your blockchain integrated system? You’ll either need to cleanup the **7nodes** example (which can turn out to be pretty messy)or, as what will be doing in this article, create a single container configuration from scratch.

### Example Repository

The scripts and configuration files (and a matching wallet) discussed in this article are available at this GitHub repository:

> [**GitHub - ItayPodhajcer/quorum-docker-single-container**](https://github.com/ItayPodhajcer/quorum-docker-single-container)
> 
> Contribute to ItayPodhajcer/quorum-docker-single-container development by creating an account on GitHub.

### Configuration

As some of the steps for creating the initial configuration of the node require commands that are part of the Quorum package, but, on the other hand, one of the reasons for using Docker, is so we don’t need to install anything on the host machine (apart from Docker itself), we will be using the `quorumengineering/quorum` Docker image in an interactive manner with a host folder mounted into it to generated the required files.

We will start by running the container and get an interactive command line shell on it:

```
docker run -v <PATH TO LOCAL FOLDER>:/temp-node -it --entrypoint sh --name quorum quorumengineering/quorum
```

Once started we will need to generate a node key:

```
bootnode --genkey=nodekey
```

And copy the address displayed by running the following command:

```
bootnode --nodekey=nodekey --writeaddress
```

This sums up what we needed from the container and we can now exit it and remove it.

We will now create a `datadir` folder which will hold the following:

-   The `nodekey` file.
-   The genesis.json file, containing the initialization information of the network, including a balance for a wallet of our choosing (you can use any Ethereum wallet software you want to generate a wallet):

```json
{
    "alloc": {
        "8e337cf273111ccfa7c33cca3a0600ee5706e68c": {
            "balance": "1000000000000000000000000000"
        }
    },
    "coinbase": "0x0000000000000000000000000000000000000000",
    "config": {
        "homesteadBlock": 0,
        "byzantiumBlock": 0,
        "chainId": 10,
        "eip150Block": 0,
        "eip155Block": 0,
        "eip150Hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "eip158Block": 0,
        "isQuorum": true
    },
    "difficulty": "0x0",
    "extraData": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "gasLimit": "0xE0000000",
    "mixhash": "0x00000000000000000000000000000000000000647572616c65787365646c6578",
    "nonce": "0x0",
    "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "timestamp": "0x00"
}
```

-   And a `static-nodes.json` file, created using the address we got from running the `bootnode --writeaddress` command earlier, which defines the nodes allowed in our network, one node in our case, using the `0.0.0.0` IP address (bind to container external address):

```json
[
    "enode://6d6101a246d7d8f64ec7f5dc1a70735f9c4545bd2142fccef6ec5a2e3c5efc91f2071f6a1cc5b5f115a7c467e205cf906b38a4243e9ba4abd7036adab92029fe@0.0.0.0:30303?discport=0&raftport=50400"
]
```

Next we will create a `bash` startup script (outside of the `datadir`), which initializes the node, if it is not already initialized (by checking the existence of a file the script generates after initialization), and then runs the node:

```bash
#!/bin/sh

if ! test -f /qdata/dd/initialized; then
    echo "Quorum initializing..."
    geth --datadir=/qdata/dd init /qdata/dd/genesis.json

    touch /qdata/dd/initialized
else
    echo "Quorum already initialized, skipping..."
fi

geth --datadir /qdata/dd --nodiscover --verbosity 6 --raft --raftport 50400 --rpc --rpcaddr 0.0.0.0 --rpcvhosts=* --rpcapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,quorum,raft --emitcheckpoints --port 30303
```

And lastly, we will create a `docker-compose` file, that will start our container using `start.sh` as our `entrypoint`:

```yaml
version: '3.7'
services:
  quorum:
    container_name: quorum
    image: quorumengineering/quorum
    volumes:
      - ./start.sh:/start.sh
      - ./datadir/genesis.json:/qdata/dd/genesis.json
      - ./datadir/nodekey:/qdata/dd/nodekey
      - ./datadir/static-nodes.json:/qdata/dd/static-nodes.json
    entrypoint: /start.sh
    ports: 
      - 8545:8545
      - 8546:8546
      - 30303:30303
      - 30303:30303/udp
      - 50400:50400
    environment:
      - PRIVATE_CONFIG=ignore
      - QUORUM_CONSENSUS=raft
    restart: always
```

Note that we are using `PRIVATE_CONFIG` set to `ignore`, meaning we will be running without privacy mechanisms and `QUORUM_CONSENSUS` set to `raft`, as it simplifies the configuration process and allows as to run with a single container without the need of an additional transactions manager container.

Now the only thing left is to run the `docker-compose` and, hopefully, the container will start, initialize and the run the node (some error messages related to ports used by inter-node communication might be displayed, but can be ignored for this single container scenario).

### Conclusion

The above example helps us create a container which is very comfortable for everyday development tasks. It can even be further customized by deploying a few demo contracts during initialization (you can use the `geth` command to execute a `web3.js` script that does that), further simplifying development of components which interact with Quorum and demo deployments.
