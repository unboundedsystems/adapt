# Step 7: Destroying your deployment

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Destroying a deployment](#destroying-a-deployment)
- [Cleaning up](#cleaning-up)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Destroying a deployment

To destroy all resources that Adapt has created for a particular deployment, use the `adapt destroy` command.
This will destroy all the Kubernetes resources we created in our local cluster:
```
adapt destroy myapp
```

## Cleaning up

When you're completely done using the local Kubernetes cluster we created, first return the `DOCKER_HOST` environment variable to its original setting and then remove the k3s container and its image:
<!-- testdoc command -->
```
DOCKER_HOST="${ORIG_DOCKER_HOST}"
docker stop k3s
docker rmi unboundedsystems/k3s-dind
```


| [<< Step 6: Updating your deployment](./06_updating.md) |
| --- |
