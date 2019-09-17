---
id: starters
title: Developing for the Adapt starters
---

<!-- DOCTOC SKIP -->

## Officially supported starters

This document is written for the officially supported starters in [https://gitlab.com/adpt/starters](https://gitlab.com/adpt/starters), so the requirements do not apply to Adapt starters written or maintained by others.
However, they can be considered recommended best practice for other starters in many cases.

## Branches and tags

Officially supported starters should always be tagged with an `adapt-vX.Y.Z` tag upon every Adapt release.
See [publishing a release](release.md) for more details on that process.

Typically, the name pattern `adapt-vX.Y.Z` should be reserved only for tags, not for branches.
However, branches can be created that start with that pattern, but are then followed by a dash and additional pre-release identifiers.
Example: `adapt-v1.2.3-featurename`

In order to be in sync with development in the Adapt repo, the latest `master` branch of each officially supported starter should always work correctly with the latest `master` branch of Adapt.
