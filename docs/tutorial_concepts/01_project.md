---
id: project
title: Creating your new project
---
<!-- DOCTOC SKIP -->


## Adapt projects

In Adapt, a **project** is simply a directory that contains one or more Adapt specifications.
The project directory should be treated just like any other code you write, so should typically be in a version control system such as git.
For many apps, it's easiest to simply create a subdirectory for the Adapt project alongside the source code for the app that Adapt will be managing.

## Start with a starter

The easiest way to create an Adapt project is to use an Adapt **starter**.
A starter is essentially a template for an entire app that also includes the Adapt project needed to deploy, test, and manage that app.

Starters are especially helpful if you're creating a brand new app from scratch, like we are here.

For this tutorial, we've chosen to build an app that's a Node.js REST API server.
So we'll use the `hello-node` starter, which will give us the complete framework for a Node.js HTTP server app that responds with "Hello World!".

Let's go ahead and create our new app:
<!-- doctest command -->

```console
adapt new hello-node ./tutorial
```

You should now see a new directory called `tutorial`, which contains:

- deploy

    This is the Adapt project directory.
    We'll take a closer look at this directory throughout the tutorial.

- package.json

    This is the package.json that contains information about the Node.js HTTP server app.
    Don't worry if you're not familiar with Node.js or this type of file.
    It's simply a required file for a Node.js app.

- backend

    This is the directory that contains the source code for the Node.js HTTP server app.
    Again, don't worry if you're not familiar with Node.js.
    You can think of this as the app source code you would write, in your language of choice.

## Other starters

More starters for different types of apps are available in the [Adapt starter library on GitLab](https://gitlab.com/adpt/starters).

To use a starter from the library, just use the name, like this:
```console
adapt new hello-react-node-postgres
```

Or for any other starter, you can specify it using a URL, a published NPM package reference, or [any of the other ways to specify an NPM dependency](https://docs.npmjs.com/files/package.json#dependencies):
```console
adapt new git+https://github.com/myusername/mystarterrepo
```

Available starters include:
* hello-react-node-postgres

    A Hello World starter that includes a React user interface (made with create-react-app), a Node.js API back end, a Postgres database, a static web server, and a URL router.

* hello-node

    A Hello World starter that just includes a Node.js API back end.

* blank

    A minimal starting point for creating an Adapt-enabled project.

## Next step

Next we'll cover how to describe your app in an Adapt spec.

