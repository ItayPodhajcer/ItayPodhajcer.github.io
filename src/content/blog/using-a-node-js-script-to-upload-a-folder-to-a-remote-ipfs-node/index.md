---
title: "Using a Node.js Script to Upload a Folder to a Remote IPFS Node"
description: "Not always running ipfs add or browsing to the webui to upload a file or a folder is possible. There are scenarios where the only option…"
pubDate: "2020-01-29T17:04:42.971Z"
heroImage: "./1_vosPWAjOMrmMmidNUNyi9Q.png"
heroImageAlt: "Using a Node.js Script to Upload a Folder to a Remote IPFS Node"
mediumUrl: "https://medium.com/@itaypodhajcer/using-a-node-js-script-to-upload-a-folder-to-a-remote-ipfs-node-255fa9e3b766"
tags:
  - "IPFS"
  - "NodeJS"
  - "NPM"
---

Not always running `ipfs add` or browsing to the `webui` to upload a file or a folder is possible. There are scenarios where the only option is to use a command line tool to upload to a remote IPFS node (such as automated processes).

If you are thinking `curl`, then you are right. You can use it with the `-F` (or `— form` see [here](https://curl.haxx.se/docs/manpage.html#-F)) option to upload a file (The IPFS API expects a `POST` request with a `multipart/form-data` content type). But, that option cannot accept a folder, meaning you either specify `-F` for each file you need to upload, or you can create a script that does that for you using existing `npm` packages.

### Prerequisites

As we will be writing a Node.js script, you can download it from [here](https://nodejs.org/en/download/) and install it.   
Additionally, we will need an IPFS node we can use for our uploads, so you can take a look one of my previous articles on running your own IPFS node on Azure:

> [**Running an InterPlanetary File System Node Using Azure Container Instances**](https://www.itaypodhajcer.com/running-an-interplanetary-file-system-node-using-azure-container-instances-5627814a48f5)
> 
> The InterPlanetary File System (IPFS) is a protocol and a network for storing and sharing data using a distributed file…

### The CLI Tool

As I was working on the example script, I realized that it would make sense to publish an `npm` package of a CLI tool (with a few options), that can take a folder path and upload it a remote IPFS node. Feel free to try it out (note the installation instructions):

> [**ipfs-add-folder**](https://www.npmjs.com/package/ipfs-add-folder)
> 
> Recursively adds a folder to IPFS.

You can also find the source code for the `npm` package here:

> [**GitHub - ItayPodhajcer/ipfs-add-folder: A CLI tool that recursively adds a folder to IPFS.**](https://github.com/ItayPodhajcer/ipfs-add-folder)
> 
> A CLI tool that recursively adds a folder to IPFS. - ItayPodhajcer/ipfs-add-folder

### The Script

We will start by creating a folder for our Node.js script and in it execute `npm init` (the values request by the command are not important for our example).  
Once complete, create a new JavaScript file which will hold our script.

We will be creating a script that reads two command line arguments that represent the path and the node URL, recursively gathers all the file names inside the the folder (with relative paths) and finally uploads the contents of those files to IPFS.

-   We will start by installing and then importing `fs`, `path` and `ipfs-http-client` packages:

```javascript
const fs = require("fs")
const path = require("path")
const ipfsClient = require('ipfs-http-client')
```

-   Now to creating a function that reads the files:

```javascript
function getAllFiles(dirPath, originalPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath)

  arrayOfFiles = arrayOfFiles || []
  originalPath = originalPath || path.resolve(dirPath, "..")

  folder = path.relative(originalPath, path.join(dirPath, "/"))

  arrayOfFiles.push({
      path: folder.replace(/\\/g, "/"),
      mtime: fs.statSync(folder).mtime
  })

  files.forEach(function (file) {
      if (fs.statSync(dirPath + "/" + file).isDirectory()) {
          arrayOfFiles = getAllFiles(dirPath + "/" + file, originalPath, arrayOfFiles)
      } else {
          file = path.join(dirPath, "/", file)

          arrayOfFiles.push({
              path: path.relative(originalPath, file).replace(/\\/g, "/"),
              content: fs.readFileSync(file),
              mtime: fs.statSync(file).mtime
          })
      }
  })

  return arrayOfFiles
}
```

Notice that we are replacing `\` with `/`, this is required when running the script in Windows, as paths returned by functions from the`path` package use this format `folder\subfolder`, but IPFS requires `folder/subfolder`.

-   Next we will create our main execution logic (the path and the URL will be located inside `argv[2]` and `argv[3]` respectively):

```javascript
function run() {
  files = getAllFiles(process.argv[2])
  ipfs = ipfsClient(process.argv[3])
  rootFolder = "/" + path.relative(path.resolve(process.argv[2], ".."), process.argv[2])

  ipfs.add(files, { pin: true,  })
    .then(result => {
      rootItem = "/ipfs/" + result[result.length - 1].hash
      console.info(result)
      console.info("Copying from " + rootItem + " to " + rootFolder)
      ipfs.files.cp(rootItem, rootFolder)
    })
    .catch(error => console.error(error))
}

run()
```

The call to `ipfs.cp` will create a named folder (using the name of the folder we uploaded), just like when uploading a folder through the `webui`.

The full script should look similar to this:

```javascript
const fs = require("fs")
const path = require("path")
const ipfsClient = require('ipfs-http-client')

function getAllFiles(dirPath, originalPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath)

  arrayOfFiles = arrayOfFiles || []
  originalPath = originalPath || path.resolve(dirPath, "..")

  folder = path.relative(originalPath, path.join(dirPath, "/"))

  arrayOfFiles.push({
      path: folder.replace(/\\/g, "/"),
      mtime: fs.statSync(folder).mtime
  })

  files.forEach(function (file) {
      if (fs.statSync(dirPath + "/" + file).isDirectory()) {
          arrayOfFiles = getAllFiles(dirPath + "/" + file, originalPath, arrayOfFiles)
      } else {
          file = path.join(dirPath, "/", file)

          arrayOfFiles.push({
              path: path.relative(originalPath, file).replace(/\\/g, "/"),
              content: fs.readFileSync(file),
              mtime: fs.statSync(file).mtime
          })
      }
  })

  return arrayOfFiles
}

function run() {
  files = getAllFiles(process.argv[2])
  ipfs = ipfsClient(process.argv[3])
  rootFolder = "/" + path.relative(path.resolve(process.argv[2], ".."), process.argv[2])

  ipfs.add(files, { pin: true,  })
    .then(result => {
      rootItem = "/ipfs/" + result[result.length - 1].hash
      console.info(result)
      console.info("Copying from " + rootItem + " to " + rootFolder)
      ipfs.files.cp(rootItem, rootFolder)
    })
    .catch(error => console.error(error))
}

run()
```

### Testing The Script

Now that the script is complete, you can try it by running it with `node`:

```
node [path to script] <folder to upload> <host URL>
```

### Conclusion

This script is a basic example of how a remote upload of a folder can be accomplished. It can be improved much further with, for example, a command line interface package such as `commander`, provide additional options that tweak the upload process or the output and even adding more extensive logging.
