#!/usr/bin/env bash

# NOTE: This script can be sourced or executed, but NOT via symlink
REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )
. "${REPO_ROOT}/scripts/release/release_utils.sh"

function usage {
    echo 
    echo Explicitly sets the base version for this branch. For branches other
    echo than master, a prerelease string will be appended and the prerelease
    echo number will be set to zero.
    echo
    echo "Usage:"
    echo "  $0 BASE_VERSION"
    echo
    echo "Example:"
    echo "  $0 1.0.0"
}

if [[ $# -ne 1 ]]; then
    usage
    exit 1
fi

VERSION=$1
PREID=$(prereleaseId)

if [ -n "${PREID}" ]; then
    VERSION="${VERSION}-${PREID}.0"
fi

LERNA_ARGS="version --no-git-tag-version --no-push ${VERSION}"
echo "Running:  lerna ${LERNA_ARGS}"
"${REPO_ROOT}/node_modules/.bin/lerna" ${LERNA_ARGS}

 