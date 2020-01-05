#!/usr/bin/env bash

# NOTE: This script can be sourced or executed, but NOT via symlink
REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )
. "${REPO_ROOT}/scripts/release/release_utils.sh"

function branchSha {
    local BRANCH="$1"
    git rev-parse "${BRANCH}"
}

if [[ -z ${CI} ]]; then
    error "ERROR: This script should only run in CI"
    exit 1
fi

if [[ -z ${CI_COMMIT_BRANCH} ]]; then
    error "ERROR: This script should only be run for branches"
    exit 1
fi

if [[ -z ${CI_COMMIT_SHA} ]]; then
    error "ERROR: CI_COMMIT_SHA is not defined"
    exit 1
fi

# Sanity check
if [[ $(branchSha "origin/${CI_COMMIT_BRANCH}") != ${CI_COMMIT_SHA} ]]; then
    error "ERROR: SHA of CI_COMMIT_BRANCH ($(branchSha "${CI_COMMIT_BRANCH}")) does not match CI_COMMIT_SHA (${CI_COMMIT_SHA})"
    exit 1
fi

run git branch -f "${CI_COMMIT_BRANCH}" "${CI_COMMIT_SHA}" || { error "Error updating branch"; exit 1; }
run git checkout "${CI_COMMIT_BRANCH}" || { error "Error checking out branch"; exit 1; }
