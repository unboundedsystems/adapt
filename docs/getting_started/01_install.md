# Step 1: Install Adapt

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Requirements](#requirements)
- [Installing Adapt](#installing-adapt)
- [Next Step](#next-step)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

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

> **Adapt is currently in limited-access preview**
>
> Because Adapt is in limited preview, you must enter NPM credentials to access Adapt.
>
> First, log in to NPM:
> ```
> npm login
> ```
>
> When prompted, enter the following information:
> 
> | Prompt | Value |
> | --- | --- |
> | Username: | `adapt_preview` |
> | Password: | `unbounded223344` |
> | Email: | `preview@unbounded.systems` |
> 

We can now install the `adapt` CLI globally:
<!-- doctest command -->
```
npm install -g @adpt/cli
```

<details>
<summary>Alternately, if you'd rather not install Adapt globally, you can run Adapt using npx (click to expand)</summary>

As an alternative to installing `adapt` globally, you can use `npx` instead.
To use Adapt via `npx`, any time you see an `adapt` CLI command in this guide, simply substitute `npx @adpt/cli` instead of `adapt`.
For example, if this guide asks you to run this command:
```
adapt new blank
```
You would instead type:
```
npx @adpt/cli new blank
```

The rest of this guide will assume you have installed `adapt` globally using `npm install -g`.
</details>

## Next Step

Next, we'll create a template Hello World app and deploy it.

| [<< Step 0: MovieDB App Overview](./00_overview.md) | [Step 2: Create and Run - Hello World App >>](./02_run.md) |
| --- | --- |
