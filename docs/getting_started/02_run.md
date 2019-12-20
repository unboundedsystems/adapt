---
id: run
title: "Create and Run - Hello World App"
---

<!-- DOCTOC SKIP -->

## Create a project

We'll base our movie database off of an Adapt starter template called `hello-react-node-postgres`:

<!-- doctest command -->

```console
adapt new hello-react-node-postgres ./moviedb
```
<!-- doctest output { matchRegex: "Creating new project \\[completed\\]" } -->

This command creates a complete template for a "Hello World" app in a new directory, `moviedb`.

Our new Hello World app contains the front end user interface, all of its back end services, and the Adapt specification that allows everything to be easily deployed into different environments.
The app consists of:

- A simple React user interface, created with [create-react-app](https://create-react-app.dev/docs/getting-started/), that displays "Hello World!".
Source code for the UI is in the `moviedb/frontend` directory.
- A simple Node.js back end API server that responds to HTTP requests with "Hello World!".
Source code for the API server is in the `moviedb/backend` directory.
- A static web server that serves the app's HTML, CSS, JS, and image files.
- A URL router that directs HTTP requests that start with `/api/` to the Node.js back end and all other requests to the static web server.
- A Postgres database (which will be useful in a later step).

It also contains Adapt Style Sheets that allow the app to be deployed to different environments:

- The `laptop` style sheet deploys all the app components to your local Docker host--great for interactive debugging of end-to-end tests.
It can even pre-populate the Postgres database with test data for you.
- The `k8s-test` style sheet deploys all app components to a Kubernetes cluster for testing (without redundancy or database persistence).
- The `k8s-prod` style sheet shows how to use an existing database along with the other app components in Kubernetes.

## Run!

To run all the app components on your local Docker host:
<!-- doctest command -->

```console
cd moviedb/deploy
adapt run --deployID movieapp
```

This changes into the `moviedb/deploy` directory, where the Adapt deployment spec is located, and runs the deployment.
The `deployID` option gives the newly created deployment a name that we can refer to for later commands.
When the deployment is complete, you should see:

<!-- doctest output { matchRegex: "Deployment created successfully. DeployID is: movieapp" } -->

```console
Deployment created successfully. DeployID is: movieapp
```

## Test the Hello World App

The app should now be available at: [http://localhost:8080](http://localhost:8080)

<!-- doctest exec { cmd: "$HOSTCURL http://localhost:8080", matchRegex: "<title>React Hello World</title>" } -->

If you open this URL in your browser, you should see something like this:

![Hello World](assets/getting_started/helloworld.png)
