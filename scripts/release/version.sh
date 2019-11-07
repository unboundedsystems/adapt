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

VERSION=$1
PREID=$(prereleaseId)

if [ -n "${PREID}" ]; then
    VERSION="${VERSION}-${PREID}.0"
fi

if ! $(isTreeClean) ; then
    error "ERROR: Working directory must be clean to run this command"
    exit 1
fi

VERSION=$(sanitizeSemver "${VERSION}") || exit 1

echo "Ensuring build is up to date. Building..."
make build

LERNA_ARGS="version --force-publish=* --amend --no-git-tag-version ${VERSION}"
echo "Running:  lerna ${LERNA_ARGS}"
"${REPO_ROOT}/node_modules/.bin/lerna" ${LERNA_ARGS} || exit 1

git add -A || exit 1
echo "Committing the following files:"
git status -s
git commit -m "Update base version: ${VERSION}" || exit 1

echo
echo "Complete. Branch may now be pushed if desired."
 
