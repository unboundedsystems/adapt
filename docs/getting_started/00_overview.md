---
id: overview
title: "MovieDB App Overview"
---

<!-- DOCTOC SKIP -->

## A Complete MovieDB App Deployment

In this guide, we'll be deploying a complete end-to-end app onto a Kubernetes cluster on your local system.
It's a simple app with a React-based user interface that lets you search for movies.

The app consists of:

* A React user interface (built with [create-react-app](https://create-react-app.dev/docs/getting-started/))
* A static web server to serve the built HTML, CSS, and other static content for the user interface
* A Node.js REST API back end that allows searching for movies
* A Postgres database to store the movie data, automatically populated with test data
* A URL router that routes requests for `/api` to the Node.js API and all other requests to the static web server

![MovieDB Diagram](assets/getting_started/overview.png)

## Next Step

Next, we'll install Adapt.
