---
id: install
title: "Install Adapt"
---

<!-- DOCTOC SKIP -->

## Requirements

To install and use Adapt, you must have **both** of the following:

| Requirement | Installation Instructions |
| --- | --- |
| [Node.js](https://nodejs.org) verson 10 | [Installing Node with npm](../user/install/requirements.md#nodejs-10-with-npm) |
| [Yarn Package Manager](https://yarnpkg.com) | [Installing yarn](../user/install/requirements.md#yarn) |

Additionally, this Getting Started Guide also requires [Docker](https://docker.com).
You'll need **one** of the following:

| Requirement | Installation Instructions |
| --- | --- |
| A Linux system with Docker | [Installing Docker on Linux](https://docs.docker.com/install/) |
| A MacOS system with Docker Desktop for Mac | [Installing Docker Desktop for Mac](https://docs.docker.com/docker-for-mac/) |

Lastly, certain commands assume you're using the `bash` shell.
If you use a different shell, you may need to adjust some commands slightly.

## Installing Adapt

To install the `adapt` CLI globally:
<!-- doctest command -->

```console
npm install -g @adpt/cli
```

> **NOTE**
>
> Depending on how your `npm` installation is set up, you may need root or administrator privileges to install an `npm` module globally.
>
> If you get an `EACCES` error from `npm install`, use the `npx` instructions below or retry the command with administrator privileges (e.g. with `sudo`).

<details>
<summary>Alternately, if you'd rather not install Adapt globally, you can run Adapt using npx (click to expand)</summary>

As an alternative to installing `adapt` globally, you can use `npx` instead.
To use Adapt via `npx`, any time you see an `adapt` CLI command in this guide, simply substitute `npx @adpt/cli` instead of `adapt`.
For example, if this guide asks you to run this command:
```console
adapt new blank
```
You would instead type:
```console
npx @adpt/cli new blank
```

The rest of this guide will assume you have installed `adapt` globally using `npm install -g`.
</details>

