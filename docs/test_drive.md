# Adapt Test Drive
## A Hello World! app with a database deployed to Kubernetes

This guide shows you how to build and deploy a simple app that consists of
a NodeJS HTTP server and a PostgreSQL database.

Adapt can deploy to many different kinds of infrastructure, whether in a
public or private cloud, in your own data center, or even to your laptop.
For this test drive, we'll illustrate deploying to a Kubernetes cluster running
locally on your system with minikube.

To keep everything self contained and easy to install and clean up, we'll do
everything inside of containers.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [System requirements](#system-requirements)
- [Setup Adapt and an example app](#setup-adapt-and-an-example-app)
- [Setup Minikube](#setup-minikube)
- [Deploy!](#deploy)
- [Cleaning up](#cleaning-up)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## System requirements

You'll need either:
* A Linux system that has [Docker](https://docs.docker.com/install/)
installed and running.
* A MacOS system that has
[Docker Desktop for Mac](https://docs.docker.com/docker-for-mac/)
installed and running.

Platforms not currently tested with this guide:
* Windows
* Running inside Docker Desktop for Windows
* Docker Toolbox for Mac

## Setup Adapt and an example app

1. Run a NodeJS container

    This container image has NodeJS 10 and Docker client pre-installed.
    ```
    docker network create minikube
    docker run --rm -it --network minikube -v/var/run/docker.sock:/var/run/docker.sock unboundedsystems/node-testimg bash
    ```

    **NOTE:** This starts a bash shell in a container. All the commands below
    should be executed in this bash shell.

1. Log into NPM

    Adapt is currently in a private preview stage, so in order to access
    the private NPM packages, you'll need to be added to the Adapt preview
    program and will need to use your login information for npmjs.com.
    ```
    npm login
    ```

1. Install the Adapt CLI

    **NOTE:** This will install the pre-release `next` version of Adapt.
    ```
    npm install -g @adpt/cli@next
    ```

1. Get an example app

    Clone the example app repo to your local system.
    ```
    git clone https://gitlab.com/unboundedsystems/adapt-examples/pg-app.git
    ```

    You'll need to enter your credentials. Then change to the new directory.

    ```
    cd pg-app
    ```

## Setup Minikube

1. Create a minikube cluster

    This creates a self-contained Docker-in-Docker minikube cluster and exposes
    our example app's port, 8080.
    ```
    docker run --rm --privileged -d --name minikube --network minikube -p 8080:8080 unboundedsystems/minikube-dind
    ```

1. Get the kubeconfig from minikube

    In order to connect to the minikube cluster, we need a copy of its
    kubeconfig.
    ```
    docker exec minikube kubectl config view -o json --merge=true --flatten=true > kubeconfig.json
    ```
    Sometimes, minikube can take a little while to start. Take a look at the
    resulting kubeconfig.json to confirm the command completed successfully.
    The beginning of the file should look similar to this:
    ```
    {
        "kind": "Config",
        "apiVersion": "v1",
    ...
    ```

## Deploy!

1. Create the deployment

    This creates a new deployment in minikube, using the "k8s" style sheet.
    ```
    DOCKER_HOST=minikube adapt deploy:create k8s
    ```

1. Connect to the example app

    Once the app is deployed into Kubernetes, it will be available from
    **outside** the NodeJS container at:

    [http://localhost:8080](http://localhost:8080)

    If you open this URL in your browser or use curl to fetch it, you should
    see the example app show the first movie title from the Postgres database:

    > Hello World! The first movie is "The Incredibles"!

    You can also check the app status directly in minikube.

    ```
    docker exec minikube kubectl get all
    ```

## Cleaning up

When you're done, exit the NodeJS container bash shell:
```
exit
```
Now stop minikube and remove the network we created.
```
docker stop minikube
docker network rm minikube
```
You may also want to remove the container images.
```
docker rmi unboundedsystems/node-testimg unboundedsystems/minikube-dind
```
