# Installing Prerequisites for Adapt
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [NodeJS 10+ with npm](#nodejs-10-with-npm)
    - [Installing nvm](#installing-nvm)
    - [Installing and using NodeJS 10](#installing-and-using-nodejs-10)
- [Yarn](#yarn)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## NodeJS 10+ with npm

You'll need to have NodeJS version 10 or greater installed. Primary testing
is currently on v10, so there may be issues with v11+.

Your system's package manager (apt, yum, etc.) may install an older
version of NodeJS by default.

To check your currently installed version of NodeJS and npm:
```
node --version
npm --version
```

If you need to install a different version of NodeJS, we recommend using 
[nvm](https://github.com/creationix/nvm), which allows you to manage multiple
versions of NodeJS.

### Installing nvm

This installs nvm for only your user, not system-wide.
```
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
```
When nvm is installed, it adds its setup script to your .bashrc, which will
take effect on your next login. To start using nvm immediately:
```
 export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

### Installing and using NodeJS 10

```
nvm install 10
nvm use 10
```
NodeJS 10 should now be installed and activated as your current version of
node. To verify:
```
node --version
```
You should see output similar to:
```
v10.15.1
```

## Yarn

To install the [yarn package manager](https://yarnpkg.com):
```
npm install -g yarn
```

The [nvm](https://github.com/creationix/nvm) tool makes it easy to to install and
manage one or multiple versions of NodeJS. This guide summarizes the steps
to install nvm and NodeJS 10 for `bash` users. For more detailed instructions
on nvm, see [the nvm README](https://github.com/creationix/nvm).

**[Next Step: Install Adapt](docs/gsg/install_adapt.md)**
