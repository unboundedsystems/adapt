---
id: requirements
title: "Installing & Updating Requirements for Adapt"
---
<!-- DOCTOC SKIP -->

Adapt requires NodeJS and Git to be installed on your system.
See below for installation information.

## NodeJS with npm

You'll need to have [NodeJS](https://nodejs.org) installed.
Adapt requires at least NodeJS version 10 and is currently tested on NodeJS versions 10 (LTS), 12 (LTS), and 14.

Note that the default version of NodeJS that is installed by your system's package manager (apt, yum, etc.) may be an older version of NodeJS.

To check your currently installed version of NodeJS:
```console
node --version
```

For non-Windows users, if you need to install a different version of NodeJS, we recommend using [nvm](https://github.com/creationix/nvm), which allows you to manage multiple versions of NodeJS.

For Windows users and other installation and updating options, take a look at the [NodeJS documentation](https://nodejs.org/en/download/).

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

## Git

You'll also need to have [Git](https://git-scm.com) installed.

| Operating System | Installation Instructions |
| --- | --- |
| Linux | [Instructions](https://git-scm.com/download/linux)
| Mac | [Instructions](https://git-scm.com/download/mac)
| Windows | [Instructions](https://git-scm.com/download/win)

After installing, confirm that `git` is available from your command line:

```console
git --version
```

You should see output similar to:

```console
git version 2.27.0
```
