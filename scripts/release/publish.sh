#!/usr/bin/env bash

# NOTE: This script can be sourced or executed, but NOT via symlink
REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )
. "${REPO_ROOT}/scripts/release/release_utils.sh"

ADAPT_DOCKER_REPO=adaptjs/adapt

# Globals
declare -A ARGS
LERNA_ARGS=()
STARTERS_CMD="${REPO_ROOT}/scripts/starters.js"
ADAPT_PUSH_REMOTE=${ADAPT_PUSH_REMOTE:-origin}

function publishType {
    if [[ -n ${ARGS[no-update]} ]]; then
        echo from-package
        return
    fi
    if ! isReleaseBranch ; then
        echo prerelease
        return
    fi
    case "$1" in
        major|minor|patch|prerelease)
            echo $1
            ;;

        [0-9]*)
            echo from-package
            ;;

        *)
            error ERROR: Unsupported version type: $1
            return 1
            ;;
    esac
}

# Check version type/branch
function checkVersionArg {
    case "$1" in
        "")
            error "ERROR: Version type must be specified"
            usage
            return 1
            ;;

        dev)
            if isReleaseBranch ; then
                error "ERROR: Do not use 'dev' while on a release branch"
                return 1
            fi
            ;;

        major|minor|prerelease|[0-9]*)
            if [[ $(currentBranch) != "master" ]]; then
                error "ERROR: $1 releases must be made from master"
                return 1
            fi
            updateBranch || return 1
            ;;

        patch)
            if ! isReleaseBranch ; then
                error "ERROR: $1 releases must be made from a release branch"
                return 1
            fi
            updateBranch || return 1
            ;;

        *)
            error "ERROR: Invalid version type $1"
            return 1
            ;;
    esac
}

function setPublishArgs {
    local ALLOW_YES="$1"
    local PREID=$(prereleaseId)
    local BRANCH=$(currentBranch)
    local DIST_TAG PUBLISH_TYPE

    # Always publish all packages together
    LERNA_ARGS=(publish --force-publish "--gitRemote=${ADAPT_PUSH_REMOTE}")

    if [[ -n ${ARGS[debug]} ]]; then
        LERNA_ARGS+=("--loglevel=silly")
    fi

    if [[ ${ALLOW_YES} = "yes" && -n ${ARGS[yes]} ]]; then
        LERNA_ARGS+=("--yes")
    fi

    if [[ ${ARGS[version]} = "dev" ]]; then
        LERNA_ARGS+=("--allow-branch=${BRANCH}")
    fi

    if [[ -n ${ARGS[local]} || -n ${ADAPT_RELEASE_TESTS} ]]; then
        LERNA_ARGS+=(--no-push)
    fi

    DIST_TAG=$(distTag) || return 1
    LERNA_ARGS+=("--dist-tag=${DIST_TAG}")

    if [[ -n $PREID ]]; then
        LERNA_ARGS+=("--preid=${PREID}" "--pre-dist-tag=${DIST_TAG}")
    fi

    PUBLISH_TYPE=$(publishType "${ARGS[version]}") || return 1
    LERNA_ARGS+=("${PUBLISH_TYPE}")
}

function finalVersion {
    if [[ -n ${ARGS[no-update]} ]]; then
        currentVersion
        return
    fi
    if [[ ${ARGS[version]} =~ ^[0-9] ]]; then
        echo "${ARGS[version]}"
        return
    fi

    local OUTPUT
    setPublishArgs no || return 1

    # Run lerna to see what version it will create, but don't use --yes 
    # The version lines look like this:
    #  - @adpt/core: 0.1.0-next.0 => 0.1.0-next.1
    OUTPUT=$(run "${REPO_ROOT}/node_modules/.bin/lerna" "${LERNA_ARGS[@]}" <<<"" | \
        egrep '^ - .*: .* => ' | head -1 | sed 's/^.* => //')
    if [[ ${OUTPUT} = "" ]]; then
        error "ERROR: Unable to parse version information from lerna"
        return 1
    fi
    echo "${OUTPUT}"
}

function checkRegistry {
    if [[ ${ARGS[local]} = "1" && -z $NPM_CONFIG_REGISTRY ]]; then 
        error ERROR: NPM_CONFIG_REGISTRY must be set when --local flag is used
        return 1
    fi
    if [[ -z ${ARGS[local]} && -n $NPM_CONFIG_REGISTRY ]]; then 
        error ERROR: NPM_CONFIG_REGISTRY must NOT be set unless --local flag is used
        return 1
    fi
}

function checkReleaseBranch {
    local BRANCH="$1"

    if [[ -n ${BRANCH} ]] && branchExists "${BRANCH}"; then
        if [[ -n ${ARGS[redo]} ]]; then
            printf "\n** Deleting branch '${BRANCH}' due to --redo flag **\n\n"
            run git branch -D "${BRANCH}"
        else
            error "ERROR: release branch '${BRANCH}' already exists"
            return 1
        fi
    fi
}

function checkTag {
    local TAG="$1"

    if [[ -n ${ARGS[no-update]} ]]; then
        # We're doing a publish from already committed changes to versions.
        # The tag SHOULD exist so we can push it if the publish is successful.
        if ! tagExists "${TAG}"; then
            error "ERROR: git tag '${TAG}' should already exist when using --no-update"
            return 1
        fi
    else
        # We will update versions, commit, and tag.
        # Confirm the version tag we will create does NOT exist
        if tagExists "${TAG}"; then
            if [[ -n ${ARGS[redo]} ]]; then
                printf "\n** Deleting tag ${TAG} due to --redo flag **\n\n"
                run git tag -d "${TAG}"
            else
                error "ERROR: git tag '${TAG}' already exists"
                return 1
            fi
        fi
    fi
}

function updateBranch {
    if ! isTreeClean ; then
        error "ERROR: source tree must not have any modifications"
        return 1
    fi

    if ! isReleaseBranch ; then
        return
    fi
    if [[ -n ${ARGS[no-update]} ]]; then
        return
    fi

    run git fetch origin || return 1
    run git pull --ff-only || return 1
}

function doBuild {
    if [[ -z ${ARGS[no-build]} ]]; then
        echo "Ensuring build is up to date. Building..."
        make build
    else
        echo "[SKIPPING] make build"
    fi
}

function distTag {
    if [[ ${ARGS[dist-tag]} =~ ^[-0-9v] ]]; then
        error "ERROR: Invalid tag '${ARGS[dist-tag]}' specified for dist-tag"
        return 1
    fi

    if [[ -n ${ARGS[dist-tag]} ]]; then
        echo "${ARGS[dist-tag]}"
        return
    fi

    case "${ARGS[version]}" in
        major|minor|patch)
            echo latest
            return
            ;;

        prerelease|dev)
            local TAG=$(prereleaseId)
            # Pre-release tag on a release branch is "alpha"
            TAG=${TAG:-alpha}
            echo ${TAG}
            return
            ;;

        [-0-9v]*)
            error "ERROR: --dist-tag must be specified with version ${ARGS[version]}"
            return 1
            ;;

        *)
            error "ERROR: invalid version ${ARGS[version]}"
            return 1
            ;;
    esac
}

function doSpecificVersion {
    local VERSION
    VERSION=$(sanitizeSemver "${ARGS[version]}") || return 1

    LERNA_ARGS=(version --force-publish --amend --no-git-tag-version "--gitRemote=${ADAPT_PUSH_REMOTE}" "${VERSION}")
    checkDryRun "${REPO_ROOT}/node_modules/.bin/lerna" "${LERNA_ARGS[@]}" || return 1

    if [[ -n ${ARGS[dry-run]} ]]; then
        return
    fi

    git add -A || return 1
    echo "Committing the following files:"
    git status -s
    git commit -m "${VERSION}" || return 1
}

function tagStarters {
    local VERSION="$1"
    run "${STARTERS_CMD}" update || return 1
    checkDryRun "${STARTERS_CMD}" tag -f "adapt-v${VERSION}" || return 1
}

function releaseBranchName {
    local VERSION="$1"
    if [[ ${ARGS[version]} != "major" && ${ARGS[version]} != "minor" ]]; then
        return
    fi
    if [[ ${VERSION} =~ (^[0-9]+\.[0-9+]) ]]; then
        local MAJ_MIN="${BASH_REMATCH[1]}"
        echo "release-${MAJ_MIN}"
    else
        error "ERROR: Could not parse major and minor version from release version"
        return 1
    fi
}

function branchExists {
    local BRANCH="$1"
    [[ -n $(git branch --list ${BRANCH}) ]]
}

function tagExists {
    local TAG="$1"
    [[ -n $(git tag --list ${TAG}) ]]
}

function pushForce {
    if [[ -z ${ARGS[redo]} ]]; then
        return
    fi
    echo "-f"
}

function pushToRemote {
    local TAG="$1"
    local FORCE=$(pushForce)

    # These options mean we don't do any pushing ever
    if [[ -n ${ARGS[local]} || -n ${ADAPT_RELEASE_TESTS} ]]; then
        return
    fi

    # If no-update is NOT set, then lerna already did the pushes, so nothing
    # for us to do.
    if [[ -z ${ARGS[no-update]} ]]; then
        return
    fi

    checkDryRun git push ${FORCE} --no-verify "${ADAPT_PUSH_REMOTE}" "$(currentBranch)" || return 1
    checkDryRun git push ${FORCE} --no-verify "${ADAPT_PUSH_REMOTE}" "${TAG}" || return 1
}

function createReleaseBranch {
    local BRANCH="$1"
    local FORCE=$(pushForce)

    # Release branch starting point is always from a commit on master
    if [[ -n ${ADAPT_RELEASE_TESTS} || $(currentBranch) != "master" ]]; then
        return
    fi
    checkDryRun git branch "${BRANCH}" || return 1
    checkDryRun git push ${FORCE} --no-verify "${ADAPT_PUSH_REMOTE}" "${BRANCH}"
}

function updateMasterNext {
    local VERSION="$1"
    local NEXT_VERSION
    if [[ ${ARGS[version]} != "major" && ${ARGS[version]} != "minor" ]]; then
        return
    fi
    if [[ $(currentBranch) != "master" ]]; then
        return
    fi

    NEXT_VERSION=$("${REPO_ROOT}/node_modules/.bin/semver" -i preminor --preid next "${VERSION}") || return 1

    L_ARGS=(version --yes --force-publish --amend --no-git-tag-version "--gitRemote=${ADAPT_PUSH_REMOTE}" "${NEXT_VERSION}")
    checkDryRun "${REPO_ROOT}/node_modules/.bin/lerna" "${L_ARGS[@]}" || return 1

    checkDryRun git add -A || return 1
    echo "Committing the following files:"
    git status -s
    checkDryRun git commit -m "Update base version to ${NEXT_VERSION}" || return 1

    if [[ -z ${ADAPT_RELEASE_TESTS} ]]; then
        checkDryRun git push --no-verify "${ADAPT_PUSH_REMOTE}" master
    fi
}

function dockerBuild {
    local VER="$1"

    if [[ -n ${ARGS[local]} || -n ${ADAPT_RELEASE_TESTS} ]]; then
        return
    fi

    local BUILDARGS=(
        --build-arg ADAPT_VERSION="${VER}"
        --tag "${ADAPT_DOCKER_REPO}:${VER}"
        "${REPO_ROOT}/docker_hub"
    )

    checkDryRun docker build "${BUILDARGS[@]}"
}

function dockerPush {
    local VER="$1"

    if [[ -n ${ARGS[local]} || -n ${ADAPT_RELEASE_TESTS} ]]; then
        return
    fi

    local TAG_VER="${ADAPT_DOCKER_REPO}:${VER}"
    local TAG_DIST="${ADAPT_DOCKER_REPO}:$(distTag)"

    checkDryRun docker tag "${TAG_VER}" "${TAG_DIST}"
    checkDryRun docker push "${TAG_VER}"
    checkDryRun docker push "${TAG_DIST}"
}

function usage {
    cat <<USAGE

Publishes all packages to NPM registry and publishes image to Docker Hub.

Usage:
  $0 [ FLAGS ] <VERSION_TYPE>

  VERSION_TYPE:
      One of: major, minor, patch, prerelease, or dev.

  FLAGS:
      --debug           Show additional debugging output
      --dist-tag <tag>  NPM dist-tag to use. Defaults to 'latest' for
                        non-prerelease versions, 'next' for master prerelease,
                        and 'dev-<branchname>' for dev releases.
      --dry-run | -n    Do not commit, tag, or publish
      --local           Only publish packages to a local NPM registry, NOT the
                        global registry. NPM_CONFIG_REGISTRY must be set.
      --no-build        Do not run 'make build'
      --no-update       Do not update package.json versions. Publish existing
                        versions.
      --yes | -y        Do not prompt for confirmation
      -h | --help       Display help

  USE WITH CAUTION:
      --redo            If the tag or release branch to be created already
                        exists, they will be DELETED before starting the
                        publish process and will be FORCE PUSHED.
                        NOTE: The --dry-run flag does NOT affect this flag.

Example:
  $0 minor

USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --debug)
            ARGS[debug]=1
            ;;

        --dist-tag)
            shift
            if [[ -z $1 ]]; then
                error "ERROR: no tag specified for dist-tag"
                exit 1
            fi
            ARGS[dist-tag]="$1"
            ;;

        --dry-run|-n)
            ARGS[dry-run]=1
            ;;

        --local)
            ARGS[local]=1
            ;;

        --no-build)
            ARGS[no-build]=1
            ;;

        --no-update)
            ARGS[no-update]=1
            ;;

        --redo)
            ARGS[redo]=1
            ;;

        --yes|-y)
            ARGS[yes]=1
            ;;

        -h|--help)
            usage
            exit 0
            ;;

        -*)
            error "ERROR: Unrecognized flag: $1"
            usage
            exit 1
            ;;

        *)
            if [[ -n "${ARGS[version]}" ]]; then
                error ERROR: Too many arguments
                usage
                exit 1
            fi

            ARGS[version]="$1"
            ;;
    esac
    shift
done

#
# Main script sequence
#

# Check version type/branch
checkVersionArg "${ARGS[version]}" || exit 1

# Check for git credentials
setupGitCreds || exit 1

# Check if we're publishing locally
checkRegistry || exit 1

# Compute what version we're going to create
FINAL_VERSION=$(finalVersion) || exit 1
FINAL_TAG="v${FINAL_VERSION}"
printf "\nVersion to publish will be '${FINAL_VERSION}'\n\n"

RELEASE_BRANCH=$(releaseBranchName "${FINAL_VERSION}") || exit 1

# If we're going to create a release branch, confirm it does NOT exist
checkReleaseBranch "${RELEASE_BRANCH}" || exit 1

# Check that the tag is in the correct state for us to start
checkTag "${FINAL_TAG}" || exit 1

# Build everything
doBuild || exit 1

# Tag the starters
tagStarters "${FINAL_VERSION}" || exit 1

if [[ ${ARGS[version]} =~ ^[0-9] ]]; then
    doSpecificVersion || exit 1
fi

# Populate LERNA_ARGS
setPublishArgs yes || exit 1

# Do the publish
checkDryRun "${REPO_ROOT}/node_modules/.bin/lerna" "${LERNA_ARGS[@]}" || exit 1

# Push to remote (if needed)
pushToRemote "${FINAL_TAG}" || exit 1

# Create new release branch for appropriate release types
createReleaseBranch "${RELEASE_BRANCH}" || exit 1

# Update version to 'next.0' as needed
updateMasterNext "${FINAL_VERSION}" || exit 1

# Build and push to Docker Hub
dockerBuild "${FINAL_VERSION}" || exit 1
dockerPush "${FINAL_VERSION}" || exit 1
