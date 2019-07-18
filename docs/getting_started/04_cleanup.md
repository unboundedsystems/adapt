# Step 4: Clean Up

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
## Table of Contents

- [Cleaning up](#cleaning-up)
- [Next Step](#next-step)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


## Cleaning up

When you're done, destroy the app deployment:
<!-- testdoc command -->
```
adapt destroy movieapp
```

Then, return the `DOCKER_HOST` environment variable to its original setting and remove the k3s container and its image:
<!-- testdoc command -->
```
DOCKER_HOST="${ORIG_DOCKER_HOST}"
docker stop k3s
docker rmi unboundedsystems/k3s-dind
```

## Next Step

Next are some more in-depth resources on Adapt for you to explore.

| [<< Step 3: Add Code and Update - MovieDB App](./03_update.md) | [More Information >>](./05_more_info.md) |
| --- | --- |