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

    This creates a self-contained Docker-in-Docker minikube cluster. It
    exposes three ports from the container, making them available on the host
    system:
    * Port 31000: Inner Docker instance API
    * Port 8443: Kubernetes API
    * Port 8080: Our example app's web port

    ```
    docker run --rm --privileged -d --name minikube -p 31000:2375 -p 8443:8443 -p 8080:8080 unboundedsystems/minikube-dind
    ```

1. Get the kubeconfig from minikube

    In order to connect to the minikube cluster, we need a copy of its
    kubeconfig.
    ```
    docker exec minikube kubectl config view -o json --merge=true --flatten=true | sed 's/https:\/\/.*:8443/https:\/\/localhost:8443/' > kubeconfig.json
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
    DOCKER_HOST=localhost:31000 adapt deploy:create k8s
    ```
    When the deployment is complete, Adapt prints the DeployID. Take note
    of this for when you're ready to delete the deployment. It should look
    similar to this:

    > Deployment created successfully. DeployID is: **pg-app::k8s-aphe**

1. Connect to the example app

    Once the app is deployed into Kubernetes, it will be available at:

    [http://localhost:8080](http://localhost:8080)

    If you open this URL in your browser or use curl to fetch it, you should
    see the example app show the first movie title from the Postgres database:

    > Hello World! The first movie is "The Incredibles"!

    You can also check the app status directly in minikube:
    ```
    docker exec minikube kubectl get all
    ```

## Cleaning up

1. Destroy the deployment

    When you're done, destroy the app deployment using the DeployID you got
    from running `adapt deploy:create` earlier.
    ```
    adapt deploy:destroy YOUR_DEPLOY_ID
    ```

1. Stop minikube

    You may also want to stop minikube and remove the minikube container image:
    ```
    docker stop minikube
    docker rmi unboundedsystems/minikube-dind
    ```
