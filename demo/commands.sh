
function destroyall {
    adapt deploy:list -q | xargs -r -n1 adapt deploy:destroy
}

function _killregistry {
    for pid in $(pgrep -f local-registry); do
        if [ "$(ps -o comm= ${pid})" = "node" ]; then
            kill ${pid}
            sleep 1
            kill ${pid}
        fi
    done
}

function _startregistry {
    node /src/testutils/bin/run-local-registry.js &
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

