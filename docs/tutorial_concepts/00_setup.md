# Step 0: Setup for this tutorial

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Requirements](#requirements)
- [Set up local Kubernetes](#set-up-local-kubernetes)
- [Next step](#next-step)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

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
    | A Linux system with Docker | [Installing Docker on Linux](https://docs.docker.com/install/) |
    | A MacOS system with Docker Desktop for Mac | [Installing Docker Desktop for Mac](https://docs.docker.com/docker-for-mac/) |

- Bash shell

    Certain commands assume you're using the `bash` shell.
    If you use a different shell, you may need to adjust some commands slightly.

## Set up local Kubernetes

> **Note**
>
> Adapt can deploy your apps to many different kinds of infrastructure, whether in a public or private cloud, in your own data center, or even to your laptop.

For this tutorial, we're going to deploy to Kubernetes, so we'll create a Kubernetes cluster on your local Docker system using [k3s](https://k3s.io), a lightweight version of Kubernetes.
In order to keep everything self-contained and easy to clean up, we'll use a Docker-in-Docker version of k3s.

To deploy the local cluster and get the credentials:

<!-- testdoc command -->
```
docker run --rm --privileged -d -p10001:2375 -p8443:8443 -p8080:8080 --name k3s unboundedsystems/k3s-dind

docker exec k3s get-kubeconfig.sh -json > kubeconfig.json
```

You now have a self-contained Docker-in-Docker Kubernetes cluster that exposes three ports, making them available on the host system:
* Port 10001: Inner Docker instance API
* Port 8443: Kubernetes API
* Port 8080: Our new app's web port

To make sure all the rest of the steps in this tutorial use the new Docker-in-Docker instance we just created, we need to change your `DOCKER_HOST` environment variable.
We'll also save the old value, so we can set it back after we're done.
<!-- testdoc command -->
```
ORIG_DOCKER_HOST="${DOCKER_HOST}"
export DOCKER_HOST=localhost:10001
```

## Next step

Next, we'll create an Adapt project.

| [<< Tutorial Overview ](./index.md) | [Step 1: >> Creating your new project](./01_project.md) |
| --- | --- |
