---
id: upgrade
title: "Upgrading Adapt"
---
<!-- DOCTOC SKIP -->

## Upgrade overview

The typical and recommended installation of Adapt involves installing the Adapt CLI (package `@adpt/cli`) once globally and then also installing Adapt libraries such as `@adpt/core` and `@adpt/cloud` separately in each Adapt project you create.
That means you may have more than one location to upgrade.

Most users will need to perform the steps in [Upgrading the Adapt CLI (global install)](#upgrading-the-adapt-cli-global-install) once and will then need to repeat the steps in [Upgrading Adapt libraries in each existing project](#upgrading-adapt-libraries-in-each-existing-project) for every Adapt project they manage.

## Upgrading the Adapt CLI (global install)

If you installed the Adapt CLI globally with your preferred package manager, use the following command to upgrade to the latest stable version of Adapt:

<!--DOCUSAURUS_CODE_TABS-->
<!--npm-->

```console
npm install -g @adpt/cli@latest
```

<!--yarn-->

```console
yarn global add @adpt/cli@latest
```

<!--END_DOCUSAURUS_CODE_TABS-->

:::note
Depending on how your `npm` or `yarn` installation is set up, you may need root or administrator privileges to install a module globally.

If you get an `EACCES` error from `npm install` or see any other errors related to insufficient permissions you may need to retry the command with administrator privileges (e.g. with `sudo`).
:::

## Upgrading Adapt libraries in each existing project

Each Adapt project independently specifies which versions of Adapt libraries to use.

Repeat the following steps for each of your Adapt projects:

1. Change to the Adapt project directory (usually called `deploy`)

    ```console
    cd MYPROJECTDIR/deploy
    ```

2. Upgrade the Adapt libraries

    ```console
    yarn add @adpt/core@latest @adpt/cloud@latest
    ```

:::important
Adapt projects must be managed using the `yarn` version 1 package manager.
`npm` or any other package manager cannot be used for this step.
:::

<!-- markdownlint-disable ol-prefix -->

3. Update existing deployments of this project

    If you have any existing active deployments of this project, the version upgrade does not fully take effect on those deployments until you use an Adapt CLI command that affects each deployment.
    It is recommended that you update all active deployments of a project after upgrading its Adapt library versions.

    For each existing deployment of this project:

    ```console
    adapt update DEPLOYID
    ```

## Upgrading to the `next` release channel

Adapt releases are published on two release channels:

* The `latest` release channel contains stable releases and is recommended for most users.

* The `next` release channel contains the most recent "bleeding edge" features and bug fixes and releases more frequently than `latest`.
Releases on `next` may be less stable or have features that are only partially complete.

Users that would like to try out new Adapt features or that need specific bug fixes before they are released to `latest` can choose to install a `next` release.

To install or upgrade to the most recent `next` release, follow the upgrade instructions in the previous sections, but substitute `@next` instead of `@latest` in any commands.

For example, to upgrade the globally installed Adapt CLI using `npm`:

```console
npm install -g @adpt/cli@next
```
