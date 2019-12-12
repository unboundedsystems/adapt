---
id: run
title: Running your project
---
<!-- DOCTOC SKIP -->

## Deployments

Now, let's deploy our Hello World app that's described in the `index.tsx` spec we looked at earlier.

First, make sure you're in the Adapt project directory:
<!-- doctest command -->

```console
cd tutorial/deploy
```

Then run the app:
<!-- doctest command -->

```console
adapt run --deployID myapp laptop
```

This will create a new deployment of the `laptop` stack we saw defined in the last step.

An Adapt **deployment** is one set of instantiated infrastructure resources.
Each time you use the `adapt run` command, Adapt will attempt to create another set of resources.

You can use Adapt to manage multiple deployments from a single project or across multiple projects.

Each deployment that Adapt creates has a unique **DeployID** that must be used to reference the deployment when you want to update or destroy it.
In the command above, we told Adapt to use `myapp` as the DeployID.
If we hadn't specified one, Adapt would create a unique one for us.

## Hello World?

When your `adapt run` command completes, you should see:

```console
Deployment created successfully. DeployID is: myapp
```

You now have a functioning Hello World app running on your local Docker host.

To verify that it's working, use `curl` or a web browser to access [http://localhost:8080](http://localhost:8080)

You should see:

```console
Hello World!
```

You can also get a list of all your active Adapt deployments:
<!-- doctest command -->

```console
adapt list
```

You should see just one deployment listed: `myapp`

## Next Step

Next, you'll add a database to your app.
