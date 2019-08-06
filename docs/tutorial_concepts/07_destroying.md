---
id: destroying
title: Destroying your deployment
---
<!-- DOCTOC SKIP -->


## Destroying a deployment

To destroy all resources that Adapt has created for a particular deployment, use the `adapt destroy` command.
This will destroy all the Kubernetes resources we created in our local cluster:
<!-- doctest command -->

```console
adapt destroy myapp
```

## Cleaning up

When you're completely done using the local Kubernetes cluster we created, first return the `DOCKER_HOST` environment variable to its original setting and then remove the k3s container and its image:
<!-- doctest command -->

```bash
DOCKER_HOST="${ORIG_DOCKER_HOST}"
docker stop k3s
docker rmi unboundedsystems/k3s-dind
```

