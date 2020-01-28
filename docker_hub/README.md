[![Adapt logo](https://adaptjs.org/img/logo_lockup.svg)](https://adaptjs.org)

[![npm](https://img.shields.io/npm/v/@adpt/cli?color=blue)](https://www.npmjs.com/package/@adpt/cli)
[![Gitter](https://badges.gitter.im/UnboundedSystems/Adapt.svg)](https://gitter.im/UnboundedSystems/Adapt)
[![License](https://img.shields.io/github/license/unboundedsystems/adapt)](https://opensource.org/licenses/Apache-2.0)

# Adapt - ReactJS for your infrastructure.

AdaptJS is a system to easily, reliably, and repeatably deploy your full-stack applications.  Adapt specifications look like [React](https://reactjs.org) apps, but instead of rendering browser DOM elements like `<input>`, or `<div>`, Adapt specifications use elements like AWS `<EC2Instance>`, Kubernetes `<Pod>`, or `<MongoDB>` database.

If you're already familiar with React, you'll feel right at home with Adapt.
But if not, don't worry, knowledge of React isn't required to start using Adapt.

## Using the Adapt Docker image

> **TIP**
>
> This Docker image is intended for more advanced Docker users who prefer running Adapt in Docker rather than installing it on their system.
>
> To use Adapt without this Docker image, see the [Adapt Getting Started Guide](https://adaptjs.org/docs/getting_started).

### Example usage (TL;DR)

The following will `adapt run` the Adapt app description in the current directory, using the `laptop` style sheet:

```console
docker run --rm -ti -v "/myprojectdir:/src/" -v "${HOME}:/root" --workdir /src/deploy adaptjs/adapt run laptop
```

### How to use this Docker image

The `adapt` command uses files from your local file system, so you'll typically need to use Docker volume bind mounts to make certain files or directories available, using the `-v` option to `docker run`.
At minimum, you'll probably want to create a bind mounts for:

* Your project directory

    This includes ALL files related to your project that Adapt will need to access.
    This should be mounted inside the container as `/src/`.

* Any authentication and/or credentials that Adapt will need

    This information is often found in your home directory (e.g. in directories like `.ssh`, `.docker`, and `.kube`).
    Although each of these can be bind mounted separately, it's usually easiest to bind mount your entire home directory.
    It should be mounted inside the container as `/root/`.

* Adapt's local storage directory

    Adapt saves information about the state of your current deployments and needs that information to persist across multiple CLI commands.
    By default, Adapt stores this state in `$HOME/.local/share/adapt`.
    You can mount this directory inside the container as `/root/.local/share/adapt`, but it's usually easier to mount your entire home directory instead.

> **TIP**
>
> This Docker image works great with [ContainIt](https://github.com/unboundedsystems/containit), which is designed to make it easy to run Docker commands instead of native commands inside your projects.
> ContainIt takes care of setting up the `docker run` project directory mounts, workdir option, signals, and other details for you.

### Using this Docker image with the Adapt Getting Started Guide

To use this Docker image instead of installing Adapt on your system, bash users can run the following code, which will add the `adapt` command to your current shell as a bash function:

```bash
adapt() {
    docker run --rm -ti -v "$(dirname $(pwd)):/src/" -v "${HOME}:/root" --workdir /src/deploy adaptjs/adapt "$@"
}
```

> **NOTE**
>
> The above function assumes the specific directory structure used in the Getting Started Guide.

You can then just type `adapt` on your command line and it will run the Docker image.
Example:

```bash
adapt run laptop
```

## More info about Adapt

* [Adaptjs.org](https://adaptjs.org)

    Learn more about Adapt.

* [Getting Started Guide](https://adaptjs.org/docs/getting_started)

    This guide will walk you through setting up Adapt and then deploying an example MovieDB app.

* [Adapt Documentation](https://adaptjs.org/docs)

    Adapt tutorials, API References, and more.

## Getting Help

[![Gitter](https://badges.gitter.im/UnboundedSystems/Adapt.svg)](https://gitter.im/UnboundedSystems/Adapt)

We'd love to hear about your experience with Adapt!
Join us on our [Gitter channel](https://gitter.im/UnboundedSystems/Adapt) to ask questions or to give us your feedback and suggestions.

If you've found a bug, you can also [file an issue](https://gitlab.com/unboundedsystems/adapt/issues).
