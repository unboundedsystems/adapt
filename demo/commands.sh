
function destroyall {
    adapt deploy:list -q | xargs -r -n1 adapt deploy:destroy
}

function _killregistry {
    /src/testutils/bin/run-local-registry.js stop "${ADAPT_TEST_REGISTRY}"
}

function _startregistry {
    unset ADAPT_TEST_REGISTRY
    export ADAPT_TEST_REGISTRY=$(/src/testutils/bin/run-local-registry.js start --port 4873 --loglevel debug)
}

function _removelockfile {
    # Safety check: Are we somewhere in /tmp?
    if pwd | egrep '^/tmp/' > /dev/null ; then
        rm -f yarn.lock
    fi
}

function restartregistry {
    _killregistry
    _removelockfile
    _startregistry
}

