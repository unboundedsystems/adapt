#!/usr/bin/env bash

# NOTE: This script can be sourced or executed, but NOT via symlink
REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )
. "${REPO_ROOT}/scripts/release/release_utils.sh"

function usage {
    cat <<USAGE

Publishes the next version of all packages.

Usage:
  $0 [ FLAGS ] [ VERSION_TYPE ]

  VERSION_TYPE:
      One of: major, minor, or patch
      For a release branch, the default VERSION_TYPE is patch.
      For any other branch, VERSION_TYPE is ignored and always
      set to prerelease.

  FLAGS:
      --dev         Allow publishing from a non-release branch
      -f | --force  Ensure lerna publishes even if this commit has been
                    published before.
      -h | --help   Display help for command

Example:
  $0 minor

USAGE
}

function publishTagArgs {
    local PREID=$(prereleaseId)
    if [ -z "${PREID}" ]; then
        PREID=latest
    fi
    echo "--dist-tag ${PREID}"
}

function preidArgs {
    local PREID=$(prereleaseId)
    if [ -n "${PREID}" ]; then
        echo "--preid ${PREID}"
    fi
}

function versionType {
    if [[ ! ( $(currentBranch) =~ ^release- ) ]]; then
        echo prerelease
        return
    fi
    if [ -z "$1" ]; then
        echo patch
        return
    fi
    case "$1" in
        major|minor|patch)
            echo $1
            ;;
        *)
            error ERROR: Unsupported version type: $1
            return 1
            ;;
    esac
}

LERNA_ARGS="publish"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;

        --debug)
            LERNA_ARGS+=" --loglevel=debug"
            ;;

        --dev)
            PUBLISH_DEV=1
            ;;

        -f|--force)
            LERNA_ARGS+=" --force-publish"
            ;;

        -*)
            error ERROR: Unrecognized flag: $1
            usage
            exit 1
            ;;

        *)
            if [[ -n "${VERSION_ARG}" ]]; then
                error ERROR: Too many arguments
                usage
                exit 1
            fi

            VERSION_ARG="$1"
            ;;
    esac
    shift
done


LERNA_ARGS+=" $(preidArgs) $(publishTagArgs)"

if [[ $PUBLISH_DEV -eq 1 ]] ; then
    if $(isReleaseBranch) ; then
        error "ERROR: Do not use --dev while on a release branch"
        exit 1
    fi
    LERNA_ARGS+=" --allow-branch=$(currentBranch)"

elif $(isReleaseBranch) ; then
    :
else
    error ERROR: Publishing not permitted from branch $(currentBranch)
    exit 1
fi

VERSION_TYPE=$(versionType "${VERSION_ARG}") || exit 1
LERNA_ARGS+=" ${VERSION_TYPE}"

echo "Running: lerna ${LERNA_ARGS}"
"${REPO_ROOT}/node_modules/.bin/lerna" ${LERNA_ARGS}
