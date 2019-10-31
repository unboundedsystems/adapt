---
id: index
title: "Tutorial: Extending Adapt with the Action component"
---
<!-- DOCTOC SKIP -->

## Who is this tutorial for?

This is an advanced Adapt tutorial for those users who want to create their own custom primitive component to interact with a cloud provider, API, or other tool not already supported by the existing Adapt libraries.

This tutorial will walk you through creating a simple primitive component, using the `Action` component from the Adapt cloud library.
The `Action` component is the easiest way to connect Adapt to a new API or command line tool.

## Prerequisites

This tutorial assumes familiarity with [TypeScript](https://www.typescriptlang.org) and some familiarity with Adapt.
It also assumes you have [installed Adapt globally](../getting_started/01_install.md).

## Primitive components

Primitive components are the most basic building blocks in Adapt.
They typically directly correspond to a single infrastructure resource that can be created, updated, and destroyed, like a `DockerContainer` or a Kubernetes `Resource`.
Those infrastructure resources typically have an existing API client or command line tool that can be used to manage the resource.
`Action` is a primitive component that you can use to interact with a resource's existing API client or command line tool so Adapt can manage the resource.
It's a simplified way to add functionality to Adapt, without having to create a deployment plugin.
Although deployment plugins are more flexible and can solve certain problems that `Action` cannot, `Action` is sufficient for many integrations.

In this tutorial, we'll be building a simple example component called `LocalFile` that can create, update and delete files on the local filesystem.
We'll use the [Node.js file system API](https://nodejs.org/docs/latest-v10.x/api/fs.html) to manage the files.

## Setting up

First, create a new directory and initialize a new blank Adapt project in that directory:

```bash
mkdir tutorial
adapt new blank ./tutorial
cd tutorial/deploy
```

## The Action component

`Action` is a primitive component that is designed to be used as a base class for custom components to inherit.
As with all Adapt components, it has `props` or properties that describe details about the component.

Our example `LocalFile` component will have two props:

- `path`: The filesystem path for the file.
- `contents`: The contents of the file, as a string.

Let's create the template for our `LocalFile` component.
Create a file called `LocalFile.ts` and copy the following code into it:

```tsx
import { ChangeType } from "@adpt/core";
import { Action, ActionContext, ShouldAct } from "@adpt/cloud/action";
import fs from "fs-extra";

export interface LocalFileProps {
    path: string;
    contents: string;
}

export class LocalFile extends Action<LocalFileProps> {

    async shouldAct(diff: ChangeType, context: ActionContext): Promise<ShouldAct> {
    }

    async action(diff: ChangeType, context: ActionContext) {
    }
}
```

We'll also be using the [fs-extra](https://www.npmjs.com/package/fs-extra) library to handle our file operations, so install it with the following command:

```bash
yarn add fs-extra
```

In this code, `LocalFileProps` defines the type of props that our component will accept.
And `LocalFile` is a class component that inherits from `Action`.

Any component that inherits from `Action` is required to implement two methods: `shouldAct` and `action`. Both methods take the same two parameters:

- `diff` (type [`ChangeType`](https://adaptjs.org/docs/api/core/core.adapt.changetype)) describes the difference between the previously deployed Element in the virtual DOM and the Element in the current DOM that we're in the process of deploying now.
Note that this **only** reflects information about the previous DOM and the current DOM.
It is up to our component to decide what changes actually need to happen.
`diff` can have the following possible values in `shouldAct` or `action`:
  - `ChangeType.create` - This DOM Element is being created for the first time.
  - `ChangeType.modify` - This DOM Element previously deployed successfully and is also in the current DOM, possibly with changes to its props.
  - `ChangeType.delete` - This DOM Element previously existed and is now being destroyed.
  - `ChangeType.none` - Not used in `Action` methods.
  - `ChangeType.replace` - Not used in `Action` methods.
- `context` is an [ActionContext](https://adaptjs.org/docs/api/cloud/cloud.action.actioncontext) that contains information and objects that can be useful for a component, such as a logger for logging messages.

## shouldAct method

The `shouldAct` method is called during the Adapt `observe` phase of deployment.
Its purpose is to determine if the resource that this component corresponds to is in the correct state and to communicate to the user what actions **would** happen if the deployment continues to the `act` phase.
It should only query the current state of resources and should never modify resources.
`shouldAct` is called both for an actual change to a deployment and also when a "dry run" is requested.

To implement our `LocalFile` component, `shouldAct` needs to look at the file referenced by the prop `path` and decide if the file contents match the `contents` prop, then communicate whether any action is needed and, if so, what action.

Here is an updated `shouldAct` method, along with a helper method `getContents` that retrieves the contents of a file:

```tsx
    async shouldAct(diff: ChangeType, context: ActionContext): Promise<ShouldAct> {
        const path = this.props.path;
        const contents = await this.getContents(path);
        let detail;

        if (diff === ChangeType.delete) {
            // Element is being deleted. Does the file exist on disk?
            if (contents !== undefined)
                detail = `Deleting file ${path}`;
        } else {
            // Element is being created or possibly modified.
            if (contents === undefined)
                detail = `Creating file ${path}`;
            else if (contents !== this.props.contents)
                detail = `Updating file ${path}`;
        }

        // If detail is unset, then no changes are required
        if (!detail) return false;

        // Return a ShouldAct object that says action is required and a string
        // that describes the action
        return { act: true, detail };
    }

    // Returns the contents of a file or undefined if the file doesn't exist
    async getContents(path: string) {
        try {
            return await fs.readFile(path, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') return undefined; // File doesn't exist
            else throw err; // Any other error
        }
    }
```

This `shouldAct` implementation gets the file path from `this.props.path` and calls `getContents` to read the contents of the file.
If the file doesn't exist, `contents` will be `undefined`.
It then checks the value of `diff` -- if `diff` is `ChangeType.delete` then the deployment is requesting that the file should **not** exist.
If the file does exist on disk, we set `detail` to a user-friendly message saying that the action we will take is to delete the file.
If the file does not exist, `detail` is not set.

If `diff` is not `delete`, then the file **should** exist and have the contents `this.props.contents`.
The else clause checks whether the file exists and compares the actual file contents to the expected contents.
Using that information, it can create a message in `detail` that describes the action that will be taken.
Or, in the fall-through case, the file contents are correct, so `detail` is not set.

if `detail` is not set, that means no action needs to be taken, so `shouldAct` informs the system of this by returning `false`.
Otherwise, a [`ShouldActDetail`](https://adaptjs.org/docs/api/cloud/cloud.action.shouldactdetail) object is returned that says action is required (`act: true`) and gives `detail` as the description of the action.

## action method

The `action` method is called during the Adapt `act` phase of deployment to make any changes that are needed to get the resource into the correct state.
It executes the actions that were described by `shouldAct`.
If the `shouldAct` of an `Action` component returns `false`, then the `action` method will not be called.
The `action` method is never called on a deployment dry run.

For the example `LocalFile` component, the `action` method must either delete the file, if `diff` is `ChangeType.delete` or create/update the file with the current `this.props.contents` otherwise.

Below is an updated `action` method that accomplishes this:

```tsx
    async action(diff: ChangeType, context: ActionContext) {
        const path = this.props.path;

        if (diff === ChangeType.delete) {
            // Removes the file, ignoring if the file does not exist
            await fs.remove(path);
        } else {
            await fs.writeFile(path, this.props.contents);
        }
    }
```

## Testing LocalFile

To test the `LocalFile` component, create an `index.tsx` file that uses it:

```tsx
import Adapt from "@adpt/core";
import { LocalFile } from "./LocalFile";

function App() {
    return <LocalFile path="hello.txt" contents="Hello world!" />;
}

Adapt.stack("default", <App />);
```

Then deploy the test app:

```bash
adapt run --deployID test
```

You should see output similar to the following:

```console
Adapt by Unbounded Systems [CLI v0.0.6]

  ✔ Installing node modules
  ✔ Validating project
  ✔ Creating new project deployment
    ✔ Compiling project
    ✔ Building new DOM
    ✔ Loading previous DOM
    ✔ Observing environment
    ✔ Deploying
      ✔ Deployment progress
      ✔ Applying changes to environment
        ✔ Creating file hello.txt

Deployment created successfully. DeployID is: test
```

And you should see a new `hello.txt` file in your project directory with the contents `Hello world!`.

Experiment by changing the `contents` prop in `index.tsx` or by adding another `<LocalFile>` element in `App` and running `adapt update test` to make the changes take effect.

> **Tip**
>
> If you add more than one `<LocalFile>` element to `App`, you'll need to wrap them inside an [`Adapt.Group`](https://adaptjs.org/docs/api/core/core.adapt.group) element.

## Saving component state

If you experimented with changing the props to `LocalFile`, you may have noticed that `LocalFile` has a bug.
When you deploy the component, then change the `path` prop, it will create a new file corresponding to the new `path` prop, but not delete the previously created file.
To Adapt, changing the `path` is simply changing a prop.
But for `LocalFile`, the `path` has a somewhat special meaning and when it changes, that means the file should no longer exist at the old `path` and should now exist at the new `path`.

To fix this bug, `LocalFile` will need to remember the `path` of the file that it has created, so it can decide what to do when the `path` changes.
To save information between runs of Adapt, the component needs to use state.

Add the following type to `LocalFile.ts` and modify the class definition to include the new type as the second type parameter to `Action`:

```tsx
export interface LocalFileState {
    lastPath?: string;
}

export class LocalFile extends Action<LocalFileProps, LocalFileState> {
    initialState() {
        return {};
    }
    ...
```

The above snippet also adds an `initialState` class method to set the initial state to an empty object (`lastPath` is `undefined`).
When we create or update a file with our component, we'll store the `path` from that file in `this.state.lastPath`.
Then, we can check to see if the path has changed since the last time the component was deployed.
The check needs to be added in both `shouldAct` and `action`.

Here's the updated `action` function:

```tsx
    async action(diff: ChangeType, context: ActionContext) {
        const path = this.props.path;

        // If the path has changed, remove the old file
        if (this.state.lastPath && this.state.lastPath !== path) {
            await fs.remove(this.state.lastPath);
        }

        if (diff === ChangeType.delete) {
            // Removes the file, ignoring if the file does not exist
            await fs.remove(path);
        } else {
            await fs.writeFile(path, this.props.contents);

            // Remember the path of the file we created/updated
            this.setState({ lastPath: path });
        }
    }
```

Notice the new check to see if `lastPath` has previously been set and whether the current `path` is the same.
If they're not the same, we `fs.remove` the old file `lastPath` before creating the new one.
Then, after creating the file with `fs.writeFile`, we use `this.setState` to set `lastPath` to the updated `path` value.

Here is the completed `LocalFile.ts` file:

```tsx
import { ChangeType } from "@adpt/core";
import { Action, ActionContext, ShouldAct } from "@adpt/cloud/action";
import fs from "fs-extra";

export interface LocalFileProps {
    path: string;
    contents: string;
}

export interface LocalFileState {
    lastPath?: string;
}


export class LocalFile extends Action<LocalFileProps, LocalFileState> {

    initialState() {
        return {};
    }

    async shouldAct(diff: ChangeType, context: ActionContext): Promise<ShouldAct> {
        const path = this.props.path;
        const contents = await this.getContents(path);
        let detail;

        if (diff === ChangeType.delete) {
            // Element is being deleted. Does the file exist on disk?
            if (contents !== undefined)
                detail = `Deleting file ${path}`;
        } else {
            // Element is being created or possibly modified.
            if (contents === undefined)
                detail = `Creating file ${path}`;
            else if (contents !== this.props.contents)
                detail = `Updating file ${path}`;
        }

        if (this.state.lastPath && this.state.lastPath !== path) {
            detail += ` and deleting file ${this.state.lastPath}`;
        }

        // If detail is unset, then no changes are required
        if (!detail) return false;

        // Return a ShouldActDetail object that says action is required and
        // a string that describes the action
        return { act: true, detail };
    }

    // Returns the contents of a file or undefined if the file doesn't exist
    async getContents(path: string) {
        try {
            return await fs.readFile(path, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') return undefined; // File doesn't exist
            else throw err; // Any other error
        }
    }

    async action(diff: ChangeType, context: ActionContext) {
        const path = this.props.path;

        // If the path has changed, remove the old file
        if (this.state.lastPath && this.state.lastPath !== path) {
            await fs.remove(this.state.lastPath);
        }

        if (diff === ChangeType.delete) {
            // Removes the file, ignoring if the file does not exist
            await fs.remove(path);
        } else {
            await fs.writeFile(path, this.props.contents);

            // Remember the path of the file we created/updated
            this.setState({ lastPath: path });
        }
    }
}
```

You should be able to `adapt update test` with this new file and verify by changing the `path` prop in `index.tsx` to see whether the old file gets deleted and the new one created.

## Mapping Adapt Elements to resources

The issue with the `LocalFile` component above is a common issue that a creator of a primitive Adapt component or Adapt deployment plugin must handle.
You must decide how to tell which Adapt Element corresponds to a particular external resource.
In almost all infrastructure tools and systems, each resource has some sort of unique identifier.
For a file system, each file has a unique path.
In Docker, each container has a unique name and each image has a unique ID.
In AWS, almost every resource you can create has an ID called an [ARN](https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html).

Each Adapt Element that corresponds to an external resource needs some way of knowing which resource it is responsible for so that it can create it if it doesn't exist and delete it when no longer needed.

In `LocalFile`, we used a prop as the ID and Adapt's component state to remember what file a given component instance is responsible for.
However, this approach has some limitations, especially when it comes to creating resources dynamically.

## Additional examples of Action components

To see a more complete and complex example of an `Action` component, look at `DockerContainer` in the Adapt cloud library.
The `DockerContainer` component uses the `docker` command line interface to start containers, update them, and delete them.
The `containerIsUpToDate` function is the key function that decides what actions need to take place to keep a container in sync with its Adapt Element.

The Kubernetes `Resource` component is also an `Action` component that uses the Kubernetes command line `kubectl` to interact with Kubernetes.
It uses the command line tool `kubectl diff` (see function `kubectlDiff`) to determine what changes are needed.
