---
id: index
title: "Tutorial: Intro to Adapt Concepts"
---

<!-- DOCTOC SKIP -->

## Before we get started

This hands-on tutorial will introduce you to the basic concepts of Adapt by building and testing a small app back end that consists of a REST API server and a database.
At each step of building the app, we'll introduce and explain new Adapt concepts.

By the end of this tutorial, you should have a strong understanding of how to use Adapt to describe the infrastructure for your app and how to use Adapt to manage infrastructure across multiple types of environments.

> **Tip**
>
> If you're new to Adapt, we recommend you begin with the [Getting Started Guide](../getting_started/index.md) before this tutorial.
> The Getting Started Guide covers what Adapt is and shows you the basics of using Adapt to manage infrastructure for an app.

## What are we going to build?

This tutorial will walk you through describing and deploying the infrastructure to run a small REST API service that can search for movie titles.

Although Adapt can be used to manage apps built with almost any language or technology, this tutorial will use Node.js for the REST API service and a Postgres database to store the movie data.
Don't worry if you're not familiar with Node.js or Postgres.
You can simply think of them as placeholders for two of the components that make up your app.

We also need someplace to deploy our little example REST API service.
Again, Adapt can manage almost any type of infrastructure.
But for this tutorial, we've chosen to use a local instance of Docker.
If you don't already have Docker on your system, you can find info about installing Docker in [the first step of the tutorial](setup.md).

## Where to get help

<a href="https://gitter.im/UnboundedSystems/Adapt"><img class="remove-margin" src="https://badges.gitter.im/UnboundedSystems/Adapt.svg" alt="Chat on Gitter" /></a>

Join us on our [Gitter channel](https://gitter.im/UnboundedSystems/Adapt) to ask questions or to give us your feedback and suggestions.

## Next Step

Let's get started with a little bit of setup.

