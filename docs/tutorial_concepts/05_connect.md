---
id: connect
title: Connecting components to each other
---

<!-- DOCTOC SKIP -->

## Adding a database

In the last step, we created a deployment of a Hello World HTTP service.
In order to turn that into the REST API service for searching movies, we need a database to store the movie data.
For this tutorial, we've chosen the open source [Postgres](https://www.postgresql.org/) database.

The [Adapt cloud library](../api/cloud/index.md) provides a [`<Postgres>`](../api/cloud/cloud.postgres.postgres.md) component, so we'll use that to interact with and manage the database.

The `<Postgres>` component is an abstract component, similar to the `<Service>` component we discussed in Step 3.
By using an abstract component for our database, we can then use style sheets to control which database we use in different environments.

For example, we might style `<Postgres>` into an AWS `<PostgresRDS>` instance in our production style sheet, but use a simpler [`<TestPostgres>`](../api/cloud/cloud.postgres.testpostgres.md) that gets pre-populated with test data in our test style sheet.

## Importing a component

To use a component from a library or one that's defined in another file, we'll need to import it.
(If you're already familiar with JavaScript or TypeScript, this is just a normal import.)

Open `index.tsx` in your editor again and add the following line at or near the top of the file:

```tsx
import { Postgres } from "@adpt/cloud/postgres";
```

This allows us to use the `<Postgres>` component in the `index.tsx` file.
If we also wanted to use it in other files, we would need to add this import line to those files too.

## Adding Postgres to our app

With `index.tsx` still open in your editor, find the `App` function component and replace this line:

```tsx
    return <NodeService srcDir="../backend" scope="external" />;
```

with this:

```tsx
    return (
      <Group>
        <NodeService srcDir="../backend" scope="external" />
        <Postgres />
      </Group>
    );
```

Now, the `<App>` component will build into a `<Group>` that contains a `<NodeService>` and a `<Postgres>`.

Why did we add a `<Group>`?
Because Adapt components can only build into either a single component or `null`.
However, that single component can contain other components.
The `<Group>` component's only purpose is to act as a container for other components.

## Connecting components together

Our new definition of our app now has a Postgres database.
But in order for our Node.js service to connect to the database, it will need to be provided some information about how to connect and authenticate to the database.

One of the strengths of a system like Adapt is that it can dynamically create and destroy a complete set of new infrastructure resources, like you might do for a test environment.
But if we create a new Postgres instance on the fly for each test, how will the Node.js service know how to connect to the database?

The `<NodeService>` component solves this by [accepting a prop](../api/cloud/cloud.nodejs.nodeserviceprops) called [`connectTo`](../api/cloud/cloud.nodejs.nodeserviceprops.connectto) that identifies other components that `<NodeService>` will connect to.

## Handles

To identify which component that `<NodeService>` should connect to, we use a **handle**.
A handle is a reference to a specific component instance.
In Adapt, every instance of a component is associated with a unique handle that identifies that instance.

A new handle is created each time you call the `handle` function from the Adapt API.
Let's create a handle for referring to the `<Postgres>` instance and store it in the variable `pg`.
Add this line as the first line inside the `App` function component:

```tsx
    const pg = handle();
```

Now replace the existing `<Postgres />` instance with:

```tsx
        <Postgres handle={pg} />
```

All Adapt components accept a prop called `handle`.
Here, we're associating the `pg` handle we created with the `<Postgres>` instance, so `pg` will refer to `<Postgres>`.

And finally, replace the existing `<NodeService ... />` instance with:

```tsx
        <NodeService srcDir="../backend" scope="external" connectTo={pg} />
```

Here, we're now passing the `pg` handle into the `connectTo` prop of `<NodeService>`, which will make it possible for `<NodeService>` to connect to `<Postgres>`.

We also need to add imports for the `Group` component and the `handle` function.
So your complete `index.tsx` file should now look like this:
<!-- doctest file-replace { file: "index.tsx" } -->

```tsx
import Adapt, { Group, handle } from "@adpt/core";
import { Postgres } from "@adpt/cloud/postgres";
import { NodeService } from "@adpt/cloud/nodejs";
import { k8sTestStyle, laptopStyle } from "./styles";


function App() {
    const pg = handle();

    return (
      <Group>
        <NodeService srcDir="../backend" scope="external" connectTo={pg} />
        <Postgres handle={pg} />
      </Group>
    );
}

Adapt.stack("default", <App />, laptopStyle);
Adapt.stack("laptop", <App />, laptopStyle);
Adapt.stack("k8s-test", <App />, k8sTestStyle());
```

## Styling the database with test data

We still need to use a style rule to replace the abstract `<Postgres>` element with a compatible component we can deploy.
We'll use the [`<TestPostgres>`](../api/cloud/cloud.postgres.testpostgres.md) component from the Adapt cloud library, which creates a simple Postgres container and allows us to populate it with some test data.

Open the `styles.tsx` file again and add an import line near the top of the file:

```tsx
import { Postgres, TestPostgres } from "@adpt/cloud/postgres";
```

And for simplicity, we'll just add another rule to each of the existing style sheets.
Add the following just after the `<Style>` tag in both `laptopStyle` and `k8sTestStyle`:

```tsx
        {Postgres}
        {Adapt.rule(() =>
            <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />
        )}
```

<details>
<summary>Expand to see the completed `styles.tsx` file</summary>

<!-- doctest file-replace { file: "styles.tsx" } -->

```tsx
import Adapt, { Style } from "@adpt/core";

import { Service } from "@adpt/cloud";
import { ServiceContainerSet } from "@adpt/cloud/docker";
import { makeClusterInfo, ServiceDeployment } from "@adpt/cloud/k8s";
import { Postgres, TestPostgres } from "@adpt/cloud/postgres";


export async function clusterInfo() {
    return makeClusterInfo({ registryUrl: process.env.KUBE_DOCKER_REPO || undefined });
}

/*
 * Laptop testing style - deploys to local Docker instance
 */
export const laptopStyle =
    <Style>
        {Postgres}
        {Adapt.rule(() =>
            <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />
        )}

        {Service}
        {Adapt.rule(({ handle, ...remainingProps }) =>
            <ServiceContainerSet dockerHost={process.env.DOCKER_HOST} {...remainingProps} />)}
    </Style>;

/*
 * Kubernetes testing style
 */
export async function k8sTestStyle() {
    const info = await clusterInfo();
    return (
        <Style>
            {Postgres}
            {Adapt.rule(() =>
                <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />
            )}

            {Service}
            {Adapt.rule((matchedProps) => {
                const { handle, ...remainingProps } = matchedProps;
                return <ServiceDeployment config={info} {...remainingProps} />;
            })}
        </Style>
    );
}
```

</details>

This rule says to match all `<Postgres>` elements and replace them with `<TestPostgres>` elements, which will load some mock data from local file `./test_db.sql`.

The `<TestPostgres>` component is actually made up of some abstract components as well.
Just like `<NodeService>`, it uses `<Service>`, `<NetworkService>` and `<Container>`.
However, our existing `<Service>` rule in `laptopStyle` will replace those abstract components with Docker components, so the test database will get deployed to our local Docker host too.

## Next step

Now we'll update the deployment to see the changes we've made.
