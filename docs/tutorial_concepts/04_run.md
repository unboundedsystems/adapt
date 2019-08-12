---
id: run
title: Running your project
---
<!-- DOCTOC SKIP -->


## Deployments

Now, let's deploy our Hello World app that's described in the `index.tsx` spec we just looked at in the previous step.

First, make sure you're in the Adapt project directory:
<!-- doctest command -->

```console
cd tutorial/deploy
```
The starter we're using expects to find Kubernetes cluster information in the project directory, so move the `kubeconfig.json` file we created during setup:
<!-- doctest command -->

```console
mv ../../kubeconfig.json .
```

Then run the app:
<!-- doctest command -->

```console
adapt run --deployID myapp k8s
```
This will create a new deployment of the `k8s` stack we saw defined in the last step.

An Adapt **deployment** is one set of instantiated infrastructure resources.
Each time you use the `adapt run` command, Adapt will attempt to instantiate another set of resources.

You can use Adapt to manage multiple deployments from a single project or across multiple projects.

Each deployment that Adapt creates has a unique **DeployID** that must be used to reference the deployment when you want to update or destroy it.
In the command above, we told Adapt to use `myapp` as the DeployID.
If we hadn't specified one, Adapt would create a unique one for us.

## Hello World?

When your `adapt run` command completes, you should see:
```console
Deployment created successfully. DeployID is: myapp
```

You now have a functioning Hello World app running inside the Kubernetes cluster on your local system.

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

