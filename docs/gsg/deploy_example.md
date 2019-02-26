# Deploying an Example App
## A Hello World! app with a database deployed to Kubernetes

This step shows you how to build and deploy a simple app that consists of
a NodeJS HTTP server and a PostgreSQL database.

Adapt can deploy to many different kinds of infrastructure, whether in a
public or private cloud, in your own data center, or even to your laptop.
For this test drive, we'll illustrate deploying to a Kubernetes cluster running
locally on your system with minikube.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Get the example app](#get-the-example-app)
- [Setup Minikube](#setup-minikube)
- [Deploy!](#deploy)
- [Cleaning up](#cleaning-up)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Get the example app

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

    This creates a self-contained Docker-in-Docker minikube cluster.
    ```
    docker run --rm --privileged -d --name minikube unboundedsystems/minikube-dind
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

1. Get minikube's IP address

    This stores the IP address off minikube for use in later steps:
    ```
    MK_HOST=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' minikube)
    ```

## Deploy!

1. Create the deployment

    This creates a new deployment in minikube, using the "k8s" style sheet.
    ```
    DOCKER_HOST=$MK_HOST adapt deploy:create --init k8s
    ```

1. Connect to the web app

    The web app is available on minikube's IP address. This will print the
    URL to use in your web browser on your Linux system (outside the node
    container).
    ```
    echo http://${MK_HOST}:8080
    ```
    If you open this URL in your browser or use curl to fetch it, you should
    see the web app show the first movie title from the Postgres database.

    You can also check the app status directly in minikube.

    ```
    docker exec minikube kubectl get all
    ```

## Cleaning up

When you're done, you may want to stop minikube:
```
docker stop minikube
```
You may also want to remove the minikube container image.
```
docker rmi unboundedsystems/minikube-dind
```
