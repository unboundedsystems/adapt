---
id: release
title: Publishing a Release
---

<!-- DOCTOC SKIP -->

## `next` Release (master branch)

This will create a public release of the master branch and give it the NPM `dist-tag` of `next`.

```bash
git checkout master
scripts/release/publish.sh prerelease
```

## Major or Minor Release

### Pre-release testing

All of these need to be automated, but...

* Starter tagging

    > **Important**
    >
    > Although this will happen during the actual publish process, it's best to do this prior to testing documentation and starters.

    Tag all starters with a tag corresponding to the new Adapt release:

    ```bash
    REL_VER=1.1.1
    scripts/starters.js update
    scripts/starters.js tag adapt-v${REL_VER}
    ```

    > **Important**
    >
    > If pre-release testing fails and any of the starters must be updated, the tags will need to be moved when re-starting pre-release testing (using `starters.js tag -f`).

* Run a local NPM registry with the to-be-released version

    The getting started guide and tutorial both use Docker host networking, so can't be run from inside a container.
    And the getting started guide goes through installing Adapt, but it will install `latest`.

    So to be able to test outside of a container with a fake `latest` adapt version, run a local registry:

    ```bash
    DOCKER_ARGS="-p4873:4873" bin/node testutils/bin/run-local-registry.js
    ```

    Wait for the registry to start.
    It will give a message saying `Local NPM registry started`.
    Background that process or switch to a different terminal.

    Now set your environment to use the local registry:

    ```bash
    export NPM_CONFIG_REGISTRY=http://127.0.0.1:4873
    ```

    > **Important**
    >
    > Don't forget to stop the registry and unset `NPM_CONFIG_REGISTRY` when you're done.

* Documentation testing

    Test all docs against the release.
    This is only partly automated, so it still requires some analysis of the output vs. the docs.

    Things to check while running the getting started guide:

    * Check that the version installed during the `npm install` step is the latest `next` version on `master`.
    * When running `adapt new`, check that the version of starter that gets downloaded is the one you just tagged in the Starter tagging step above.
    * After the `adapt run` and `adapt update` steps, check `http://localhost:8080` in your browser to confirm things deployed correctly.

    Open the getting started markdown files in an editor and follow along as markdown-clitest executes the commands:

    ```bash
    markdown-clitest -i docs/getting_started
    ```

    Things to check while running the tutorial:

    * After `adapt run` check that `curl http://localhost:8080` returns `Hello World!`
    * After `adapt list`, check that there's one deployment called `myapp`.
    * After `curl http://localhost:8080/search/legocurl`, check that `The Lego Batman Movie` shows up.

    Then, do the same for the tutorial:

    ```bash
    markdown-clitest -i docs/tutorial_concepts
    ```

* Starter testing

    Test new release with current version of all starters in gitlab:adpt/starters.

    The `hello-react-node-postgres` starter is fairly well tested by the getting started doc testing.

    The `hello-node` starter is fairly well tested by the tutorial doc testing.

    So for remaining starters:

    * `adapt new <starter> ./test`
    * `cd ./test/deploy`
    * `adapt run`

        Probably after ensuring that k3s is running and kubeconfig is present.
    * Check results

### Publish the release

Once pre-release testing is complete, publish the release.

For a minor release:

```bash
git checkout master
scripts/release/publish.sh minor
```

Or, for a major release:

```bash
git checkout master
scripts/release/publish.sh major
```

### Post-release activities

* Version documentation

    * Ensure the most recent version of docs is in `adapt-web`:
        From the `adapt` repo:

        ```bash
        make web-build
        ```

    * Create the new version in `adapt-web`

        From the `adapt` repo:

        ```bash
        REL_VER=1.1.1
        cd web/website
        git checkout master
        git pull
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

## Patch Release (release branch)

> **NOTE**
>
> Release branch names only contain the major and minor version numbers.

```bash
git checkout release-X.Y
scripts/release/publish.sh patch
```

## Development Release (from a non-release branch)

> **IMPORTANT**
>
> Please only create a development release when absolutely necessary.

```bash
git checkout BRANCHNAME
scripts/release/publish.sh dev
```
