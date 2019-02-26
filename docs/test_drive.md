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

## System requirements

You'll need a Linux system that has Docker installed and running.

## Setup Adapt and an example app

1. Run a NodeJS container


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
    npm install -g @usys/cli@next
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

    This creates a self-contained Docker-in-Docker minikube cluster.
    ```
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

## Deploy!

1. Create the deployment

    This creates a new deployment in minikube, using the "k8s" style sheet.
    ```
    DOCKER_HOST=minikube adapt deploy:create --init k8s
    ```

1. Connect to the web app

    The web app is available on minikube's IP address. This will print the
    URL to use in your web browser on your Linux system (outside the node
    container).
    ```
    echo http://$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' minikube):8080
    ```
    If you open this URL in your browser, you should see the web app show
    the first movie title from the Postgres database.

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
