#!/usr/bin/env bash

REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )
. "${REPO_ROOT}/scripts/release/release_utils.sh"

export HOSTCURL="${REPO_ROOT}/docs/test/hostcurl.sh"

function usage {
    cat <<USAGE

Test markdown files with markdown-clitest.

Usage:
  $0 <MARKDOWN_FILE_OR_DIR> [<MARKDOWN_FILE_OR_DIR>...]

USAGE
}

function onExit {
    if [[ -n $REGISTRY_PID ]]; then
        kill "${REGISTRY_PID}"
    fi
    if [[ -n ${REGISTRY_OUTPUT} ]]; then
        rm -f "${REGISTRY_OUTPUT}"
    fi
}
trap onExit INT TERM HUP EXIT

function runRegistry {
    local REG_ARGS=()

    if [[ -n $ADAPT_RELEASE_TESTS ]]; then
        REG_ARGS+=(--empty)
        export ADAPT_PUSH_REMOTE=fork
    fi

    REGISTRY_OUTPUT=$(mktemp --tmpdir clitest-registry.XXXXXX)

    # Start the registry
    node "${REPO_ROOT}/testutils/bin/run-local-registry.js" "${REG_ARGS[@]}" > "${REGISTRY_OUTPUT}" &
    REGISTRY_PID=$!

    export NPM_CONFIG_REGISTRY=http://127.0.0.1:4873

    waitForRegistry || return 1

    if [[ -n $ADAPT_RELEASE_TESTS ]]; then
        "${REPO_ROOT}/scripts/release/publish.sh" --yes --local "${ADAPT_RELEASE_TYPE}" || return 1
    fi
}

function checkRegistry {
    grep "registry started" "${REGISTRY_OUTPUT}" >& /dev/null
}

function waitForRegistry {
    # Wait for about 90 sec
    i=90

    while ! checkRegistry ; do
        if [[ i -le 0 ]]; then
            echo ERROR: Registry did not become ready
            exit 1
        fi
        ((i=i-1))
        echo Waiting on registry...
        sleep 1
    done
    echo Registry is up
}

function runClitest {
    markdown-clitest "$1"

    # For debugging, use the following command instead:
    #DEBUG=clitest:output,clitest:commands markdown-clitest --no-cleanup "$1"
    # The above shows all command output while running and
    # leaves the temporary directory in place for debugging.
}


if [[ -z $ADAPT_RELEASE_TYPE ]]; then
    if [[ $(currentBranch) = "master" ]]; then
        ADAPT_RELEASE_TYPE=prerelease
    else
        ADAPT_RELEASE_TYPE=dev
    fi
fi


if [[ $# -eq 0 ]]; then
    usage
    exit 1
fi

runRegistry || { error "ERROR: Failed to start registry"; exit 1; }

for TO_TEST in "$@"
do
    runClitest "$TO_TEST" || { error "ERROR: TEST FAILED: ${TO_TEST}"; exit 1; }
done
