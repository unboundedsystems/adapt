---
id: release
title: Publishing a Release
---

<!-- DOCTOC SKIP -->

:::note
The items under [Pre-release testing](#pre-release-testing) and [Post-release activities](#post-release-activities) still need to be automated.
:::

## Pre-release testing

* Starter testing

    Test new release with current version of all starters in gitlab:adpt/starters.

    The `hello-react-node-postgres` starter is fairly well tested by the getting started doc testing.

    The `hello-node` starter is fairly well tested by the tutorial doc testing.

    So for remaining starters:

    * `adapt new <starter> ./test`
    * `cd ./test/deploy`
    * `adapt run`
    * Check results

## Build, test, and publish

:::important
Make sure you are logged into [GitLab](https://gitlab.com) before clicking any of the links below.
(They give 404 errors if you're not logged in.)
:::

### `next` Release (master branch)

This will create a public release of the master branch and give it the NPM `dist-tag` of `next`.

* [Create Release](https://gitlab.com/unboundedsystems/adapt/pipelines/new?ref=master&var[ADAPT_RELEASE_TYPE]=prerelease)

### Major or Minor Release (master branch)

This will create a public release of the master branch and give it the NPM `dist-tag` of `latest`.

* [Create Minor Release](https://gitlab.com/unboundedsystems/adapt/pipelines/new?ref=master&var[ADAPT_RELEASE_TYPE]=minor)
* [Create Major Release](https://gitlab.com/unboundedsystems/adapt/pipelines/new?ref=master&var[ADAPT_RELEASE_TYPE]=major)

### Patch Release (release branch)

:::warning
Right now, there's no way to specify that these releases do not get the `dist-tag` of `latest`.
So if you're publishing a patch release from an older release, you'll need to either fix that or adjust the `dist-tag`s manually afterward.
:::

:::note
Release branch names only contain the major and minor version numbers.
:::

1. Go to the [Run Pipeline](https://gitlab.com/unboundedsystems/adapt/pipelines/new?ref=release-X.Y&var[ADAPT_RELEASE_TYPE]=patch) page for Adapt.

2. Select the release branch for the correct release (`release-X.Y`)

3. Double check that the environment variable `ADAPT_RELEASE_TYPE` is set to `patch`.

4. Click `Run Pipeline`.

### Development Release (from any other branch)

:::important
Please only create a development release when absolutely necessary.
:::

1. Go to the [Run Pipeline](https://gitlab.com/unboundedsystems/adapt/pipelines/new?ref=CHOOSE%20BRANCH&var[ADAPT_RELEASE_TYPE]=dev) page for Adapt.

2. Select the development branch you wish to publish.

3. Double check that the environment variable `ADAPT_RELEASE_TYPE` is set to `dev`.

4. Click `Run Pipeline`.

## Post-release activities

### Version documentation

For major, minor, and patch releases, you'll need to create a new version of the docs:

* First, ensure you have no uncommitted files in either `adapt` or `adapt-web`

    From the `adapt` repo:

    ```bash
    git status
    pushd web/website
    git status
    popd
    ```

* Update and build both the `adapt` and `adapt-web` repos

    :::note
    Set `REL_VER` to the version that you just built.
    :::

    From the `adapt` repo:

    ```bash
    REL_VER=1.1.1
    pushd web/website
    git checkout master
    git pull --ff-only
    popd
    git fetch origin
    git checkout v${REL_VER}
    make web-build
    ```

* Create the new version in `adapt-web`

    From the `adapt` repo:

    ```bash
    cd web/website
    yarn run version ${REL_VER}
    ```

* Confirm default version is correct

    The most recently created doc version will be listed first in `adapt/web/website/versions.json` and will therefore be the default documentation version for the site.
    Typically, the most recent stable version should be the default.
    If necessary, change the ordering in `versions.json` to put the correct default version first.

* Start the preview server

    ```bash
    cd ..
    make preview
    ```

* Review site

    Particularly check [http://localhost:3000/versions](http://localhost:3000/versions). Edit `web/website/pages/en/versions.js` as needed.

* Commit and push

    From `adapt/web`:

    ```bash
    git add .
    git commit -m "Creating versioned docs for ${REL_VER}"
    git push origin
    ```
