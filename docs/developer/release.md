---
id: release
title: Publishing a Release
---

<!-- DOCTOC SKIP -->

## Major or Minor Release

> **NOTE:**
>
> The release versioning and publishing scripts specifically expect you to be working with a git remote called `fork`, which should be your own personal fork of Adapt.
> The name of that remote is specified in the Lerna config file `lerna.json`

1. Ensure your master branch is up to date with origin:
```
git fetch origin
git checkout master
git pull --ff-only
```

2. Set the `REL_VER` variable to the full version to be published and `BRANCH_VER` variable to the first two numbers (major.minor) of the release:

> **NOTE:**
>
> For releases starting with `0.0`, set both `REL_VER` and `BRANCH_VER` to the full release number, like `0.0.5`.

```
REL_VER=1.1.1
BRANCH_VER=1.1
```

3. Create the release branch locally and on fork and change the branch's base version:
```
git checkout -b release-${BRANCH_VER}
git push fork
scripts/release/version.sh ${REL_VER}
```

4. Review the newly created commit.
```
git show
```

5. Assuming all went well, tag and push to origin:
```
git tag v${REL_VER}
git push --no-verify origin release-${BRANCH_VER}
git push --no-verify origin v${REL_VER}
```

6. Now publish:
```
scripts/release/publish.sh from-package
```

5. Move master branch to next pre-release version

    Right now, you'll have to manually pick what the next expected version is.
    So for example, if you just pulled the 1.1 release branch (and published 1.1.0), master should be the pre-release branch for 1.2.0.
    Only specify the major, minor, and patch versions (A.B.C) to the version.sh command.
    The version script will automatically append the correct pre-release suffix (".next.0") for you.
    Note that because this is not a release, no tags are created.

```
NEXT_VER=1.2.0
git checkout master
scripts/release/version.sh ${NEXT_VER}
git push origin master
```

## Patch Release (release branch)
> Instructions not yet created
 
## `next` Release (master branch)

This will create a public release of the master branch and give it the NPM `dist-tag` of `next`. 

1. Ensure your master branch is up to date with origin:
```
git fetch origin
git checkout master
git pull --ff-only
git push origin master
```

2. Publish:
```
scripts/release/publish.sh
```

3. Assuming all went well, push to origin:
```
git push --no-verify --tags origin master
```

## Development Release (from a non-release branch)
> **IMPORTANT**
>
> Please only create a development release when absolutely necessary.

```
git checkout BRANCHNAME
scripts/release/publish.sh --dev
```

## Additional release activities

All of these need to be automated, but...

* Starter testing

    Test new release with current version of all starters in gitlab:adpt/starters.

* Starter tagging

    Tag all starters with a tag corresponding to the new Adapt release:
    ```bash
    REL_VER=1.1.1
    scripts/starters.js update
    scripts/starters.js tag adapt-v${REL_VER}
    ```

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
        