#!/usr/bin/env bash

# NOTE: This script can be sourced or executed, but NOT via symlink
REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )
. "${REPO_ROOT}/scripts/release/release_utils.sh"

function usage {
    echo 
    echo Publishes the next version of all packages.
    echo
    echo "Usage:"
    echo "  $0 [ VERSION_TYPE ]"
    echo
    echo "  VERSION_TYPE:"
    echo "      One of: major, minor, or patch"
    echo "      For a release branch, the default VERSION_TYPE is patch."
    echo "      For any other branch, VERSION_TYPE is ignored and always"
    echo "      set to prerelease."
    echo
    echo "Example:"
    echo "  $0 minor"
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

if [[ $# -ne 0 && $# -ne 1 ]]; then
    error ERROR: Incorrect number of arguments
    usage
    exit 1
fi

case "$1" in
    -h|--help)
        usage
        exit 0
        ;;
esac

if ! $(isReleaseBranch) ; then
    echo ERROR: Publishing not permitted from branch $(currentBranch)
    exit 1
fi

VERSION_TYPE=$(versionType "$1") || exit 1

LERNA_ARGS="publish $(preidArgs) $(publishTagArgs) ${VERSION_TYPE}"
echo "Running: lerna ${LERNA_ARGS}"
"${REPO_ROOT}/node_modules/.bin/lerna" ${LERNA_ARGS}
