<!-- DOCTOC SKIP -->
# Getting Started with Adapt

## Welcome to Adapt!

If you're new to Adapt, you're in the right place.
This guide will explain what Adapt is and help you create and deploy a simple app using Adapt.

If you're already familiar with the basics of using Adapt, you may also want to check out the [Intro to Adapt Concepts](../tutorial_concepts/index.md) tutorial or the [API Reference](../api/index.md) for more information on Adapt.

We're also working on a User Guide that will explain how Adapt works in more detail.

## Guide Contents

- [What is Adapt?](#what-is-adapt)
- [Step 0: MovieDB App Overview](./00_overview.md)
- [Step 1: Install Adapt](./01_install.md)
- [Step 2: Create and Run - Hello World App](./02_run.md)
- [Step 3: Add Code and Update - MovieDB App](./03_update.md)
- [Step 4: Clean Up](./04_cleanup.md)
- [More Information](./05_more_info.md)

## What is Adapt?

Adapt is a system to easily, reliably, and repeatably deploy applications and infrastructure.
Adapt is based on some core concepts used in web browsers that you're probably already familiar with, like HTML and style sheets.
Adapt also uses some key concepts from [React](https://reactjs.org), a framework that has made it easy for [tens of thousands of developers](https://insights.stackoverflow.com/survey/2019#technology-_-web-frameworks) to create sophisticated user interfaces.

If you are already familiar with React, many of the concepts will look familiar.
If not, don't worry.
This guide and the [Intro to Adapt Concepts](../tutorial_concepts/index.md) tutorial will cover everything you'll need to know to get started using Adapt.

## Key Features of Adapt

**Infrastructure as Code -- No, really. ACTUAL code.**

Unlike many other systems, Adapt specifications are not just configuration files, usually written in some YAML domain-specific language.
They're actual code.

Just like React, Adapt specs are written in JavaScript, using easy-to-understand [TSX or JSX](https://reactjs.org/docs/introducing-jsx.html) syntax, which looks very similar to HTML.
In React, you might use components like `<button>` and `<div>`, but in Adapt you'll use components like `<Container>` and `<EC2Instance>`.

**Developer-centric**

Adapt is designed to be used by developers.
It allows you to describe your app, along with it's interactions and dependencies, using concepts you already know and understand.
Adapt abstracts away the details and complexities of operator-centric technologies like Kubernetes, Docker, and AWS, so you can spend more time focusing on your app, not your infrastructure.

**Declarative**

Adapt specifications are declarative.
You describe the state you want your app or your infrastructure to be in, not how it should get there.
Adapt takes care of computing the minimal set of changes required to get your infrastructure to the desired state.

**Component-based**

Easily build encapsulated components that manage parts of your app or infrastructure or select components from existing libraries.
Then compose those components to build anything from a simple end-to-end app test case or an entire data center.

**Adaptive**

Most other systems only allow you to describe one single goal state for your infrastructure.
But modern application deployments are dynamic and must react and respond to their continually changing environment.

With Adapt, you can describe not only what your infrastructure should look like now, but also how it should respond to changes like:

* Increasing and decreasing load (CPU, network, etc.)
* New code pushed to your git repo canary test branch
* Outage of a server, a zone, or even an entire cloud provider

**Cloud and Technology Agnostic**

Adapt can be used to control infrastructure in your favorite cloud provider, on your laptop, in your own datacenter, or in all of those at once.

Adapt works great with the best of today's (and tomorrow's!) deployment technologies.
By simply choosing different components from the Adapt library, you can just as easily run your app on a Kubernetes cluster, as a single container on your laptop, on Amazon Lambda[^1], or installed as a service directly onto an EC2 instance, just by selecting a different component from the Adapt library.

[^1]: Lambda support coming soon

## Next Step

First, we'll start with a quick overview of what you'll be deploying.

| [Step 0: MovieDB App Overview >>](./00_overview.md) |
| --- |
