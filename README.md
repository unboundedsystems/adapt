
# Unbounded Adapt

## What is Adapt?
Adapt is a system to easily, reliably, and repeatably deploy applications and infrastructure.
Adapt is based on some core concepts used in web browsers that you're probably already familiar with, like HTML and style sheets.
Adapt also uses some key concepts from [React](https://reactjs.org), a framework that has made it easy for [tens of thousands of developers](https://insights.stackoverflow.com/survey/2019#technology-_-web-frameworks) to create sophisticated user interfaces.

If you are already familiar with React, many of the concepts will look familiar.
If not, don't worry.
Knowledge of React isn't required to start using Adapt.

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

Easily build encapsulated components that manage parts of your app or infrastructure or use components from existing libraries.
Then compose those components to build anything from a simple end-to-end app test case or an entire data center.

**Adaptive**

Most other systems only allow you to describe a goal state for your infrastructure.
But modern application deployments are dynamic and must react and respond to their continually changing environment.

With Adapt, you can describe not only what your infrastructure should look like now, but also how it should respond to changes like:

* Increasing and decreasing load (CPU, network, etc.)
* New code pushed to your git repo canary test branch
* Outage of a server, a zone, or even an entire cloud provider

**Cloud and Technology Agnostic**

Adapt can be used to control infrastructure in your favorite cloud provider, on your laptop, in your own datacenter, or in all of those at once.

Adapt works great with the best of today's (and tomorrow's!) deployment technologies.
By simply choosing different components from the Adapt library, you can just as easily run your app on a Kubernetes cluster, as a single container on your laptop, on Amazon Lambda[^1], or installed as a service directly onto an EC2 instance.

[^1]: Lambda support coming soon

## Getting Started with Adapt
* [Getting Started Guide](docs/getting_started/index.md)

    This guide will walk you through setting up Adapt and then deploying an example MovieDB app.

* [Adapt Documentation](docs/index.md)

    Adapt tutorials, API References, and more.

## Getting Help
[![Gitter](https://badges.gitter.im/UnboundedSystems/Adapt.svg)](https://gitter.im/UnboundedSystems/Adapt)

We'd love to hear about your experience with Adapt!
Join us on our [Gitter channel](https://gitter.im/UnboundedSystems/Adapt) to ask questions or to give us your feedback and suggestions.

If you've found a bug, you can also [file an issue](https://gitlab.com/unboundedsystems/adapt/issues).
