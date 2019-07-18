# Adapt Cloud API Overview

The Adapt Cloud library is a collection of Adapt Components, Hooks,
Deployment Plugins, and utilities to make it simple to create Adapt Specifications for your app deployments.

The library is divided into a few technology sections, shown below.

The complete list of all APIs can be found [here](./cloud.md).

## General

This section contains Components and other items not specific to any particular technologies.

### Components

The Components in this section are all abstract, so they cannot be deployed directly.
However, there are technology-specific Components that can be used in Style Sheets to replace the abstract Components.

> **Adapt Best Practice**
>
> Typically, your Adapt Specification should be written using the abstract Components from this section of the library.
> You then apply a Style Sheet that maps the abstract Component into a specific, concrete Component.
> For more information, see the Adapt User Guide.

- [Compute](./cloud.compute.md)
- [Container](./cloud.container.md)
- [DockerHost](./cloud.dockerhost.md)
- [ExternalDockerHost](./cloud.externaldockerhost.md)
- [NetworkService](./cloud.networkservice.md)
- [Service](./cloud.service.md)
- [HttpServer](./cloud.http.httpserver.md)
- [UrlRouter](./cloud.http.urlrouter.md)

### Hooks

- [useAsync(f, initial)](./cloud.useasync.md)
- [useMethod(hand, initial, method, args)](./cloud.usemethod.md)
- [useMethodFrom(hand, methodName, defaultVal, args)](./cloud.usemethodfrom.md)

### Other Utility Functions
- [callInstanceMethod(hand, def, methodName, args)](./cloud.callinstancemethod.md)
- [callNextInstanceMethod(hand, def, methodName, args)](./cloud.callnextinstancemethod.md)
- [dockerBuild(dockerfile, contextPath, options)](./cloud.dockerbuild.md)
- [getInstanceValue(hand, def, field, pred)](./cloud.getinstancevalue.md)
- [handles()](./cloud.handles.md)
- [hasInstanceMethod(name, skip)](./cloud.hasinstancemethod.md)


## AWS

### Components

- [EC2Instance](./cloud.aws.ec2instance.md)
- [EIPAssociation](./cloud.aws.eipassociation.md)

### Utilities
- [loadAwsCreds(options)](./cloud.aws.loadawscreds.md)
- [withCredentials(Wrapped, Ctx)](./cloud.aws.withcredentials.md)

## Docker

### Hooks

- [useDockerBuild(prepOrArgs)](./cloud.usedockerbuild.md)

## Kubernetes

### Components
- [K8sContainer](./cloud.k8s.k8scontainer.md)
- [Pod](./cloud.k8s.pod.md)
- [Resource](./cloud.k8s.resource.md)
- [Service](./cloud.k8s.service.md)
- [ServiceDeployment](./cloud.k8s.servicedeployment.md)

## Local

### Components
- [LocalCompute](./cloud.localcompute.md)
- [LocalContainer](./cloud.localcontainer.md)
- [LocalDockerHost](./cloud.localdockerhost.md)
- [LocalDockerImage](./cloud.localdockerimage.md)

## Nginx

### Components
- [HttpServer(propsIn)](./cloud.nginx.httpserver.md)
- [UrlRouter(propsIn)](./cloud.nginx.urlrouter.md)

## Node.js

### Components
- [LocalNodeContainer(props)](./cloud.nodejs.localnodecontainer.md)
- [NodeService(props)](./cloud.nodejs.nodeservice.md)

### Hooks
- [useBuildNodeContainer(srcDir, options)](./cloud.nodejs.usebuildnodecontainer.md)
- [useTypescriptBuild(srcDir, options)](./cloud.nodejs.usetypescriptbuild.md)

## Postgres
### Components
- [Postgres()](./cloud.postgres.postgres.md)
- [TestPostgres(props)](./cloud.postgres.testpostgres.md)

### Hooks
- [usePreloadedPostgres(mockDbName, mockDataPath)](./cloud.postgres.usepreloadedpostgres.md)

