# Adapt Concepts -- For React Developers

> **Tip**
>
> This section explains Adapt in depth, using concepts from [ReactJS](https://reactjs.org). If you're not already familiar with ReactJS, we suggest starting with [Adapt Concepts -- For Everyone Else](non_react.md) instead.
>
> Or, if you'd prefer to learn by doing, start with our [Getting Started Guide](../../gsg/index.md).

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Introduction: A Simple App](#introduction-a-simple-app)
- [Adapt Specifications](#adapt-specifications)
    - [Elements & the Virtual DOM](#elements-&-the-virtual-dom)
    - [Primitive and Non-Primitive Elements](#primitive-and-non-primitive-elements)
    - [Components](#components)
    - [Function and Class Components](#function-and-class-components)
    - [Primitive Components](#primitive-components)
    - [Hooks](#hooks)
    - [Style Sheets](#style-sheets)
- [Adapt Lifecycle](#adapt-lifecycle)
    - [Overview](#overview)
        - [Building the DOM](#building-the-dom)
        - [Observing the Environment](#observing-the-environment)
        - [Deploying](#deploying)
    - [Stacks](#stacks)
    - [Deployments](#deployments)
- [Footnotes](#footnotes)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Introduction: A Simple App
Adapt is the easiest way to reliably and repeatedly deploy your apps anywhere -- to your laptop, a Kubernetes cluster, your favorite cloud, or anywhere else.
Many of the concepts used in Adapt are similar to concepts used in ReactJS.
To illustrate, let's jump right in and look at some code:

```tsx
function MyApp(props: { port: number }) {
    return <NodeService srcDir=".." port={props.port} />
}

Adapt.stack("default", <MyApp />, laptopStyle)
```

If you know React, this probably looks mostly familiar, but with a couple of new things too.
It's written in JSX and uses Elements, just like React.
It also has a Function Component with props, just like React.

But instead of describing a user interface, this Adapt specification describes a simple Node.js app.
This specification can be used to build and deploy a Node.js app, like an HTTP REST API server, for example.

While React describes user interfaces and their interactions, Adapt describes apps and their interactions with the world.

The next few sections of this guide will cover the concepts shown in the example above and all the other important concepts in Adapt, along with their React counterparts, where applicable.

## Adapt Specifications
### Elements & the Virtual DOM
Adapt specifications are written in TSX or JSX[^1] and produce a virtual DOM that is made up of Elements, just like React.
[^1]: JSX supported in a future release. See #108.

The following example creates a NodeService Adapt Element:
```tsx
const element = <NodeService srcDir=".." port={props.port} />
```

Adapt currently uses the JSX/TSX processor from the TypeScript compiler with no modifications or extensions.
For a more in-depth description of JSX/TSX, see [Introducing JSX](https://reactjs.org/docs/introducing-jsx.html) from the React docs.

### Primitive and Non-Primitive Elements
In both React and Adapt, there are two types of Element: primitive and non-primitive.

The primitive Elements in React directly correspond to browser DOM tags, like `<div>`, `<img>`, or `<h1>`.
The browser understands these tags, so instantiating (displaying) these is handled directly by the browser.

In Adapt, primitive Elements typically correspond to some sort of resource that can be instantiated like a Docker image, a Kubernetes service, or an AWS EC2 instance.
Deployment Plugins handle instantiating these resources.

### Components
Just like React, Adapt Components let you split an application into independent, reusable pieces, and allow you to think about those Components in isolation.
In both systems, non-primitive Elements are defined by creating a Component.
Components "render" (React) or "build" (Adapt) into some number of primitive and/or non-primitive Elements.
This render/build process is repeated on any non-primitive Elements until only primitive Elements remain.

### Function and Class Components
React and Adapt both have two types of Component: Function Components and Class Components.

As with React, most Components can be written as either a Function Component or a Class Component, with Function Components tending to be slightly more concise.
However, there are some features that are unique to each of the two types of Component, which are detailed below.

### Primitive Components
Because React's primitive Elements correspond to tags understood by the browser, it has no corresponding primitive Components.
But in React, a library author or a user can create primitive Components that are resources to be instantiated.
These primitive Components are defined by creating a Class Component that derives from `Adapt.PrimitiveComponent`.

### Hooks

### Style Sheets

## Adapt Lifecycle
### Overview
#### Building the DOM
#### Observing the Environment
#### Deploying

### Stacks
### Deployments

## Footnotes
