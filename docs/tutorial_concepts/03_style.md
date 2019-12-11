---
id: style
title: Styling your app
---
<!-- DOCTOC SKIP -->

## Separating app structure from deployment details

One of the unique and powerful capabilities that Adapt provides is the ability to describe your app's architecture separately from how your app gets deployed.

Adapt makes it easy to deploy the same app architecture, but with variations for different situations, such as:

- Environment (laptop, stage, prod)
- Cloud provider (AWS, Google, on-prem)
- End-to-end testing with different components or integrations

To understand how this works, let's take another look at the spec for our Hello World `<App>` component:

```tsx
function App() {
    return <NodeService srcDir="../backend" scope="external" />;
}
```

This is the entire description of our app, but notice that there isn't any information about how or where the app should be deployed.
This is because the `<NodeService>` component we're using is built from some abstract components.

## Abstract components

**Abstract components** are components that are essentially like placeholders.
They have a particular meaning and specify an interface, including what props they accept and what methods they provide.
But they have no implementation, which means they can't be deployed.

But by using abstract components as building blocks, we can create a higher-level component that describes how the pieces of an app fit together independent of what type of infrastructure it actually runs on.
The abstract components can then be replaced with any compatible non-abstract component later, using style sheets.

According to its documentation, [`<NodeService>`](../api/cloud/cloud.nodejs.nodeservice.md) uses three abstract components.
It builds into a [`<Service>`](../api/cloud/cloud.service.md) component that contains a [`<NetworkService>`](../api/cloud/cloud.networkservice.md) and a [`<Container>`](../api/cloud/cloud.container.md), so those are the components that will need to be replaced via style sheet.

## Style sheets

In a browser, you use HTML to describe the structure and content of what the browser will display.
But how that content actually gets presented (color, shape, size, animation, etc.) is typically described separately, using style sheets.

For example, to style all `<div>` elements blue, you'd write this in CSS:

```css
div { color: blue }
```

Adapt also has style sheets, which enable a similar separation between structure and presentation.
In Adapt, you can describe your app's architecture and then separately use style sheets to specify how your app gets deployed.

And by creating multiple style sheets, the same app architecture can be styled differently for different environments (laptop, stage, prod), different clouds (AWS, Google, on-prem), or any other type of variation in how your app gets deployed.

In the browser and in Adapt, a style sheet is made up of individual **rules**, where each rule contains:

1. Selectors that specify which elements this rule applies to.

    In the example above, the selector is `div`.

2. The action that should be applied to the selected elements.

    In the example, the action is to apply the color blue.

## Styling for Docker

Adapt style sheets are also written in the same TSX language as the rest of the Adapt spec.
A style sheet is defined using the `<Style>` component and can contain multiple rules.

Our Hello World app contains a couple of style sheets in the `styles.tsx` file in the Adapt project directory.
Let's take a closer look at `laptopStyle`:

```tsx
export const laptopStyle =
    <Style>
        {Service}
        {Adapt.rule(({ handle, ...remainingProps }) =>
            <ServiceContainerSet dockerHost={process.env.DOCKER_HOST} {...remainingProps} />)}
    </Style>;
```

This style sheet contains only one rule.
Each rule in a style sheet is made up of one or more selectors, then the action, which is defined using `Adapt.rule`.

Let's first look at the selector:

```tsx
        {Service}
```

Similar to the `div` selector from the earlier web browser example, this selector simply selects all elements of a particular type.
In this case, we're selecting all `Service` elements.

Recall that the `<NodeService>` component used in our app contains an abstract `<Service>` component that we need to replace, so this rule will affect that `<Service>`.

The action to perform is specified with an **action function**, which is passed into `Adapt.rule`.
The action function receives the props of the matched element.
The return value from the action function will **replace** the matched element.

Here's the action from our style sheet:

```tsx
        {Adapt.rule(({ handle, ...remainingProps }) =>
            <ServiceContainerSet dockerHost={process.env.DOCKER_HOST} {...remainingProps} />)}
```

Here, our action function returns a [`<ServiceContainerSet>`](../api/cloud/cloud.docker.servicecontainerset.md) element from the Adapt cloud [Docker library](../api/cloud/cloud.docker.md).
So that means each `<Service>` element will get replaced with a `<ServiceContainerSet>`.

But what about the remaining abstract elements in `<NodeService>`?

As described in [its documentation](../api/cloud/cloud.docker.servicecontainerset.md), the `<ServiceContainerSet>` component takes care of replacing those for us.
It looks for any abstract `<Container>` and `<NetworkService>` elements inside the `<Service>` it's replacing and transforms those into Docker-specific elements.

## Styling for Kubernetes

In that same `styles.tsx` file, you'll also notice a `k8sTestStyle` that allows the same app description to be deployed to [Kubernetes](https://kubernetes.io/).
Although we won't cover it in detail here, that style similarly replaces all `<Service>` components, but with the [`<ServiceDeployment>`](../api/cloud/cloud.k8s.servicedeployment.md) component from the Adapt [k8s (Kubernetes) library](../api/cloud/cloud.k8s.md).

## Next step

Now we're ready to deploy!
