---
id: spec
title: Describing your app
---
<!-- DOCTOC SKIP -->


## Adapt concepts from the web

Adapt uses many concepts from web browsers and web development that you're probably already familiar with.
Each time we introduce one of those concepts, we'll first review the web concept briefly before talking about the related Adapt concept.

Here's the first one...

## HTML and the DOM

In a web browser, you use **HTML** to declaratively describe the structure and content of what you want displayed, using primitives like `<div>` and `<button>`.
That structure and content is called the browser **Document Object Model** or **DOM**.

Adapt also uses the DOM concept, but instead of describing a user interface using primitives like `<div>` and `<button>`, Adapt describes your app using primitives like `<Container>` and `<EC2Instance>`.

## Plus reusable components

Although HTML and the DOM have proven to be an excellent foundation for the web, HTML by itself doesn't allow you to combine its primitives into higher-level, reusable components.
A huge number of tools, languages, and other solutions have been created over the years that solve this problem in different ways.

Adapt uses many of the concepts from the popular web development framework [React](https://reactjs.org) to allow you to combine those primitives like `<Container>` and `<EC2Instance>` into higher-level, reusable components that are used in Adapt specifications.

## Adapt specifications

An Adapt **specification** (or "spec" for short) is a description of the components that make up your app and how those components relate and interact with each other.

Adapt specs are written in [TSX or JSX](https://reactjs.org/docs/introducing-jsx.html)[^1], which are based on TypeScript and JavaScript, but with the added ability to use HTML-like syntax.
If you're not familiar with any of those languages, don't worry.
We'll cover enough basics to get you started.

[^1]: JSX support is planned for a future release.

## Adapt components

Adapt allows you to compose complex app infrastructures from small, isolated, reusable blocks of code called **components**.

Adapt has a few kinds of components, but for now, you only need to know about two:

### Primitive components

These are the most basic building blocks in Adapt.
They typically directly correspond to a single infrastructure resource that can be created and destroyed.
They are the only kind of component that cannot contain other components.

Examples of primitive components are an AWS `<EC2Instance>`, a Docker `<Container>`, or a Kubernetes `<Pod>`.

### Function components

This is the most commonly used type of component in Adapt because they're simple to write and very flexible.

The most basic thing that a function component does is to describe how you assemble some lower-level components together into a higher-level construct.

This is an example of a function component that describes a search API microservice.
```tsx
function SearchService() {
    return (
        <Group>
            <Container image="search-api-server" />
            <MongoDB />
        </Group>
    )
}
```
With a function component, the return value is how you describe how to construct that component.

Looking at the return value of the example component above, it says that a `<SearchService>` is constructed from a `<Group>` which contains a `<Container>` and a `<MongoDB>`.

Each time you use a component, a new instance of that component is created.
Those instances of components are called **elements**.

### Component naming

In order for components to be used with TSX/JSX in Adapt specs, Adapt component names must start with a capital letter.
By convention, components are named using Pascal case, which is just like [camel case](https://en.wikipedia.org/wiki/Camel_case), but with the first letter capitalized.

### Component props

All Adapt components can accept a set of **props** or properties, in a standardized way.

In the `<SearchService>` component above, it's passing a prop named `image` with the value `"search-api-server"` to the `<Container>` component.

## The Hello World spec

Now let's take a look at the spec for the app we're building.
In [an earlier step](project.md), we created a new Hello World template app in a directory called `tutorial`.
The Adapt project directory is in `tutorial/deploy` and by convention, the name of the primary spec in an Adapt project is `index.tsx`.

You can use your favorite editor to open `index.tsx` and take a look.

There is a function component in `index.tsx` that looks like this:
```tsx
function App() {
    return <NodeService srcDir=".." scope="external" />;
}
```
This function component says that an `<App>` component is built from just a single `<NodeService>` component and that the `<NodeService>` component should be created with its `srcDir` prop set to `".."` and `scope` prop set to `"external"`.

The `<NodeService>` component comes from the Adapt cloud library and encapsulates:
- Building a Node.js app from source code into a container image
- Creating a container using the built container image
- Exposing a network service on a port

## Stacks

In our `index.tsx` spec, the `<App>` component is intended to represent our entire app.
It's a complete set of infrastructure that we want Adapt to manage.

We create an Adapt **stack** to tell Adapt that `<App>` is the root component that can be deployed, along with the Adapt style sheet to use when deploying it.
(More on style sheets later.)

Each stack also needs a unique name that we'll be able to use to refer to it later.

In our `index.tsx` file, we've defined one stack named `k8s` that associates our `<App>` component with the `k8sStyle` style sheet:
```tsx
Adapt.stack("k8s", <App />, k8sStyle);
```

Once we're ready to deploy our app, we'll use the name `k8s` on the command line to tell Adapt what to deploy.

## Next Step

Next, you'll learn how to deploy the same app description to different environments with style sheets.

