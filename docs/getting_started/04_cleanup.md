---
id: cleanup
title: "Clean Up"
---
<!-- DOCTOC SKIP -->


## Cleaning up

When you're done, destroy the app deployment:
<!-- doctest command -->

```console
adapt destroy movieapp
```

Then, return the `DOCKER_HOST` environment variable to its original setting and remove the k3s container and its image:
<!-- doctest command -->

```bash
DOCKER_HOST="${ORIG_DOCKER_HOST}"
docker stop k3s
docker rmi unboundedsystems/k3s-dind
```

## Next Step

Next are some more in-depth resources on Adapt for you to explore.

