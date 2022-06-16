[![Adapt logo](https://adaptjs.org/img/logo_lockup.svg)](https://adaptjs.org)

[![npm](https://img.shields.io/npm/v/@adpt/cli?color=blue)](https://www.npmjs.com/package/@adpt/cli)
![npm](https://img.shields.io/npm/dt/@adpt/core)
[![Gitter](https://badges.gitter.im/UnboundedSystems/Adapt.svg)](https://gitter.im/UnboundedSystems/Adapt)
[![License](https://img.shields.io/github/license/unboundedsystems/adapt)](https://opensource.org/licenses/Apache-2.0)

# Adapt - ReactJS for your infrastructure.

AdaptJS is a system to easily, reliably, and repeatably deploy your full-stack applications.  Adapt specifications look like [React](https://reactjs.org) apps, but instead of rendering browser DOM elements like `<input>`, or `<div>`, Adapt specifications use elements like AWS `<EC2Instance>`, Kubernetes `<Pod>`, or `<MongoDB>` database.
An Adapt description for a complete front end and back end app stack looks like this:

```jsx
import Adapt from "@adpt/core";
import { NodeService, ReactApp } from "@adpt/cloud/nodejs";
import { Postgres } from "@adpt/cloud/postgres";

function MyApp() {
  const pg = Adapt.handle();

  return (
    <Adapt.Group>
      <ReactApp srcDir="../frontend" />
      <NodeService srcDir="../backend" connectTo={pg} />
      <Postgres handle={pg} />
    </Adapt.Group>
  );
}
```

Each of the components above renders to simpler components until they get to primitive infrastructure.
You can also specify a style sheet to customize how components render to infrastructure (e.g., Docker vs. Kubernetes vs. AWS).
Styles can also swap out components entirely, for example, using a test database for your test environment and a hosted database service for production.

If you're already familiar with React, you'll feel right at home with Adapt.
But if not, don't worry, knowledge of React isn't required to start using Adapt.
You can get started with a starter, write your code and deploy, and come back to the Adapt specification when you need to change how it gets deployed.

## Getting Started

For a new project, it's easy to get started with Adapt by using a starter template.
The [Getting Started Guide](https://adaptjs.org/docs/getting_started) will walk through installing Adapt and deploying your first starter app.

## Creating and deploying an app

This example creates a new full-stack app from a starter template.
It has a [React](https://reactjs.org) UI, an [Nginx](https://nginx.org) web server, a [Node.js](https://nodejs.org) API server, and a [Postgres](https://postgresql.org) database, then deploys it to [Kubernetes](https://kubernetes.io/):

```bash
# Install adapt
npm install -g @adpt/cli

# Create a new app from a starter template
adapt new hello-react-node-postgres ./myapp
cd myapp/deploy

# Deploy full stack locally using Docker
adapt run laptop

# Or just as easily deploy everything to Kubernetes
adapt run k8s-test
```

## Adapt in action

This demo shows using Adapt to create and deploy a simple app called MovieDB that has a [React](https://reactjs.org) UI, an [Nginx](https://nginx.org) web server, an Nginx URL router, a [Node.js](https://nodejs.org) API server, and a [Postgres](https://postgresql.org) database, then deploys it to [Kubernetes](https://kubernetes.io/):

![Adapt in action](https://adaptjs.org/docs/assets/getting_started/adapt-demo-scaled.gif)

## More info

* [Adaptjs.org](https://adaptjs.org)

    Learn more about Adapt.

* [Getting Started Guide](https://adaptjs.org/docs/getting_started)

    This guide will walk you through setting up Adapt and then deploying an example MovieDB app.

* [Deploying on Google Kubernetes Engine](https://adaptjs.org/blog/2020/01/10/simple-hosting-react-app-on-google-cloud)

* [Adapt Documentation](https://adaptjs.org/docs)

    Adapt tutorials, API References, and more.

## Getting Help

[![Gitter](https://badges.gitter.im/UnboundedSystems/Adapt.svg)](https://gitter.im/UnboundedSystems/Adapt)

We'd love to hear about your experience with Adapt!
Join us on our [Gitter channel](https://gitter.im/UnboundedSystems/Adapt) to ask questions or to give us your feedback and suggestions.

If you've found a bug, you can also [file an issue](https://gitlab.com/unboundedsystems/adapt/issues).

## Sponsors
[<img alt="Adaptable.io" src="https://adaptable.io/img/color%20lockup.svg" width="100px">](https://adaptable.io) - the easiest way to deploy your app. [Deploy an app now](https://adaptable.io)!