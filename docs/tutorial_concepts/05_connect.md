# Step 5: Connecting components to each other

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Adding a database](#adding-a-database)
- [Importing a component](#importing-a-component)
- [Adding Postgres to our app](#adding-postgres-to-our-app)
- [Component instance methods](#component-instance-methods)
- [Handles](#handles)
- [Calling a component instance method](#calling-a-component-instance-method)
- [Styling the database with test data](#styling-the-database-with-test-data)
- [Next step](#next-step)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Adding a database

In the last step, we created a deployment of a Hello World HTTP service.
In order to turn that into the REST API service for searching movies, we need a database to store the movie data.
For this tutorial, we've chosen the open source [Postgres](https://www.postgresql.org/) database.

The [Adapt cloud library](../api/cloud/index.md) provides a [Postgres component](../api/cloud/cloud.postgres.postgres.md), so we'll use that to interact with and manage the database.

The `<Postgres>` component is an abstract component, similar to the `<Service>` component we discussed in Step 3.
By using an abstract component for our database, we can then use style sheets to control which database we use in different environments.

For example, we might style `<Postgres>` into an AWS `<PostgresRDS>` instance in our production style sheet, but use a simpler `<TestPostgres>` that gets pre-populated with test data in our test style sheet.

## Importing a component

To use a component from a library or one that's defined in another file, we'll need to import it.
(If you're already familiar with JavaScript or TypeScript, this is just a normal import.)

Open `index.tsx` in your editor again and add the following line at or near the top of the file:
```tsx
import { Postgres } from "@adpt/cloud/postgres";
```
Now we can use the `<Postgres>` component in the `index.tsx` file.
If we also wanted to use it in other files, we would need to add this import line to those files too.

## Adding Postgres to our app

With `index.tsx` still open in your editor, find the `App` function component and replace this line:
```tsx
    return <NodeService srcDir=".." scope="external" />;
```
with this:
```tsx
    return (
      <Group>
        <NodeService srcDir=".." scope="external" />
        <Postgres />
      </Group>
    );
```

Now, the `<App>` component will build into a `<Group>` that contains a `NodeService` and a `Postgres`.

Why did we add a `<Group>`?
Because Adapt components can only build into a single component.
However, that single component can contain other components.
The `<Group>` component's only function is to act as a container for other components.

## Component instance methods

Our new definition of our app now has a Postgres database.
But in order for our Node.js service to connect to the database, it will need to be provided some information about how to connect and authenticate to the database.

One of the strengths of a system like Adapt is that it can dynamically create and destroy a complete set of new infrastructure resources, like you might do for a test environment.
But if we create a new Postgres instance on the fly for each test, how will the Node.js service know how to connect to the database?

The `<Postgres>` component solves this problem by providing an **instance method** called `connectEnv` that returns all the information needed to connect to itself, in the form of a set of environment variables in the format that a typical Postgres client can consume.

You can see more information about the `connectEnv` instance method in the [Postgres component API documentation](../api/cloud/cloud.postgres.postgres.md).

## Handles

In order to call a method for a particular instance of a component, we need a way to identify which instance of which component we're talking about.
In Adapt, every instance of a component has a unique handle that identifies that instance.
A **handle** is simply a reference to a specific component instance.

Let's create a handle to refer to the `<Postgres>` instance.

Add this line as the first line inside the `App` function:
```tsx
    const pg = Adapt.handle();
```
This creates a new handle and stores it in a variable named `pg`;

Now replace the existing `<Postgres />` instance with:
```tsx
        <Postgres handle={pg} />
```
All Adapt components accept a prop called `handle`.
Here, we're associating the `pg` handle we created with the `<Postgres>` instance, so `pg` will refer to `<Postgres>`.

## Calling a component instance method

Now we can use the `pg` handle to get the database connection info. Add this line just after `const pg = Adapt.handle()`:
```tsx
    const connectEnv = useMethod(pg, {}, "connectEnv");
```
The `useMethod` function calls a method on the component instance that the handle references.
The second argument to `useMethod` is the default value, which is returned in certain cases that the referenced component instance is not yet built.

The `<NodeService>` prop named `env` allows us to specify a set of environment variables that will be built into the container image that `<NodeService>` creates.

So let's pass the database connection environment variables we have in the `connectEnv` variable into `<NodeService>` by replacing the existing `<NodeService>` line in our spec with:
```tsx
        <NodeService srcDir=".." scope="external" env={connectEnv} />
```

The complete `App` function should now look like this:
```tsx
function App() {
    const pg = Adapt.handle();
    const connectEnv = useMethod(pg, {}, "connectEnv");

    return (
      <Group>
        <NodeService srcDir=".." scope="external" env={connectEnv} />
        <Postgres handle={pg} />
      </Group>
    );
}
```

## Styling the database with test data

We still need to use a style rule to replace the abstract `<Postgres>` element with a compatible component we can deploy.
We'll use the `<TestPostgres>` component from the Adapt cloud library, which creates a simple Postgres container and allows us to populate it with some test data.

Open the `styles.tsx` file again and add an import line near the top of the file:
```tsx
import { Postgres, TestPostgres } from "@adpt/cloud/postgres";
```

And for simplicity, we'll just add another rule to the existing `k8sStyle` style sheet.
Add the following just after the first `<Style>` tag:
```tsx
        {Postgres}
        {Adapt.rule(() => {
            return <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />;
        })}
```

This rule says to match all `<Postgres>` elements and replace them with `<TestPostgres>` elements, which load some mock data from local file `../test_db.sql`.

The `<TestPostgres>` component is actually made up of some abstract components as well.
Just like `<NodeService>`, it uses `<Service>`, `<NetworkService>` and `<Container>`.
However, our existing `<Service>` rule will replace those abstract components with Kubernetes components, so the test database will get deployed to our local Kubernetes cluster too.

## Next step

Now we'll update the deployment to see the changes we've made.

| [<< Step 4: Running your project](./04_run.md) | [Step 6: Updating your deployment >> ](./06_updating.md) |
| --- | --- |
