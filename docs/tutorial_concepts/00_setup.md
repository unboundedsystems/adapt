---
id: setup
title: Setup for this tutorial
---
<!-- DOCTOC SKIP -->

## Requirements

- What is Adapt?

    Although this tutorial doesn't assume any familiarity with using Adapt, we do recommend you read the [What is Adapt?](../getting_started/index.md#what-is-adapt) section of the [Getting Started Guide](../getting_started/index.md).

- HTML, CSS, and Programming

    You should have at least some basic familiarity with HTML and CSS.
    We'll also assume you're familiar with common programming concepts like functions, objects, and arrays, but will not assume any specific knowledge of JavaScript or any other language.

    However, as you become a more advanced user of Adapt, you may wish to review some JavaScript resources such as [this tutorial](https://developer.mozilla.org/en-US/docs/Web/JavaScript/A_re-introduction_to_JavaScript) from MDN.

- Install Adapt

    You'll need the Adapt CLI installed to follow along with this tutorial.
    The Getting Started Guide has [installation instructions](../getting_started/01_install.md).

- Docker

    Although it's not a requirement for Adapt, this tutorial requires [Docker](https://docker.com).

    You'll need one of the following:

    | Requirement | Installation Instructions |
    | --- | --- |
    | A Linux system with Docker | [Installing Docker on Linux](https://docs.docker.com/install/#server) |
    | A MacOS system with Docker Desktop for Mac | [Installing Docker Desktop for Mac](https://docs.docker.com/docker-for-mac/install/) |

    :::note
    If you're using Docker on Linux, you'll need to either run all `docker` commands as superuser (`root`) or ensure your user is part of the `docker` group.
    For instructions and more information, see the Docker [Linux post-install instructions](https://docs.docker.com/install/linux/linux-postinstall/).
    :::

    Docker is correctly installed if the command `docker ps` does not show any errors.

- Bash shell

    Certain commands assume you're using the `bash` shell.
    If you use a different shell, you may need to adjust some commands slightly.

## Next step

Next, we'll create an Adapt project.
