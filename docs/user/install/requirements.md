---
id: requirements
title: "Installing & Updating Requirements for Adapt"
---
<!-- DOCTOC SKIP -->

## NodeJS 10 with npm

You'll need to have [NodeJS](https://nodejs.org) version 10 or greater installed. Version 10 is the current stable (LTS) version of NodeJS. Primary testing of Adapt is currently on v10, so there may be issues with v11+. 

The default version of NodeJS that is installed by your system's package manager (apt, yum, etc.) is often an older version of NodeJS.

To check your currently installed version of NodeJS:
```console
node --version
```

If you need to install a different version of NodeJS, we recommend using [nvm](https://github.com/creationix/nvm), which allows you to manage multiple versions of NodeJS. For other installation and updating options, take a look at the [NodeJS documentation](https://nodejs.org/en/download/).

### Install nvm
The [nvm](https://github.com/creationix/nvm) tool makes it easy to to install and manage one or multiple versions of NodeJS. This guide summarizes the steps to install nvm and NodeJS 10 for `bash` users. For more detailed instructions on nvm, including usage with other shells, see [the nvm README](https://github.com/creationix/nvm).

This installs nvm for only your user, not system-wide.
```console
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
```
When nvm is installed, it adds its setup script to your .bashrc, which will
take effect on your next login. To start using nvm immediately:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

### Set up NodeJS 10

```console
nvm install 10
nvm use 10
```
NodeJS 10 should now be installed and activated as your current version of
node. To verify:
```console
node --version
```
You should see output similar to:
```console
v10.15.1
```

## Yarn

If you already have NodeJS and NPM installed, the easiest way to install the [yarn package manager](https://yarnpkg.com) is:
```console
npm install -g yarn
```

To verify:
```console
yarn --version
```
You should see output similar to:
```console
1.13.0
```

For more installation and upgrade options, see [the yarn installation instructions](https://yarnpkg.com/en/docs/install).
