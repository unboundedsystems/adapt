---
id: branches
title: "Branches & Versions"
---

<!-- DOCTOC SKIP -->


## Branch: master
All work on Adapt is done in the `master` branch, with a few small exceptions such as certain security fixes.
So that means all merge requests should target `master`.

The `master` branch is always versioned as a pre-release version of the next anticipated minor or major release, so it's pre-release ID is `next`.
For example, if the next anticipated Adapt minor release is `1.1.0`, `master` will have versions like `1.1.0-next.1`, `1.1.0-next.2`, etc.
Once the minor or major version has been released, the version on `master` will immediately change to the expected next minor or major version.
To continue the example, once `1.1.0` is released, the version of `master` would immediately change to `1.2.0.next.0` before any additional commits can be made to `master`.

## Branch: release
Production releases are releases that have no dash in them and no suffix.
They are always created from a branch that starts with `release-` and has **only** the major and minor version numbers.

To continue with our example, when it's time to release `1.1.0`, a new branch called `release-1.1` would be pulled from `master`.
Then, the version in package.json files on the `release-1.1` branch will get updated to `1.1.0` and be published.

## Branch: development (any other branches)
Other branches may exist, but should typically **not** be publishing public releases to NPM.
However, there may be cases where it makes sense to publish a version from one of these branches.

In those cases, the version will be of the form:

    A.B.C-dev-BRANCHNAME.D

The major, minor, and patch versions (`A.B.C`) should be derived from the closest master or production release.
`BRANCHNAME` is the name of the branch, possibly with some invalid characters substituted.
The final digit (`D`) is the sequence number, reflecting how many releases have been published from this branch.
