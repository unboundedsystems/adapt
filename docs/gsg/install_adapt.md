# Installing Adapt
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Prerequisites](#prerequisites)
- [Log into NPM](#log-into-npm)
- [Run npm install](#run-npm-install)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Prerequisites

Before you install Adapt, make sure you've [installed all prerequisites](docs/gsg/prerequisites.md).

## Log into NPM

Adapt is currently in a private preview stage, so in order to access
the private NPM packages, you'll need to be added to the Adapt preview
program and will need to use your login information for npmjs.com.
```
npm login
```

## Run npm install

The Adapt CLI should typically be installed globally to be used across
multiple Adapt projects.

**NOTE:** This will install the pre-release `next` version of Adapt.

```
npm install -g @usys/cli@next
```

**[Next Step: Deploy an Example App](docs/gsg/deploy_example.md)**
