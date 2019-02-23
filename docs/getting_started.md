# Getting Started with Adapt

## A simple demo app

This guide shows you how to build and deploy a simple app that consists of
a NodeJS HTTP server and a PostgreSQL database.

Adapt can deploy to many different kinds of infrastructure, whether in a
public or private cloud, on your own data center, or even to your laptop.
In this guide, we'll illustrate deploying to a Kubernetes cluster running
locally on your system with minikube.

## System requirements

You'll need a system that has Docker installed and running.

## Setup

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
    npm install -g @usys/cli@next
    ```

1. Get the example app

    Clone the example app repo to your local system.
    ```
    git clone https://gitlab.com/unboundedsystems/adapt-examples/pg-app.git
    cd pg-app
    ```

1. Create a minikube cluster

    This creates a self-contained Docker-in-Docker minikube cluster.
    ```
    docker network create minikube
    docker run --rm --privileged -d --name minikube --network minikube --network-alias kubernetes unboundedsystems/minikube-dind
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

1. Deploy the app!

    This creates a new deployment, using the "k8s" style sheet.
    ```
    adapt deploy:create --init k8s
    ```

