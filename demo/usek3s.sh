DEMO_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

function usage {
    cat <<END

Enable or disable use of local K3S DIND instance.

Usage:
  . ${BASH_SOURCE[0]} [on|off]

END
}

function enableK3s {
    . "${DEMO_DIR}/minikube.sh"

    minikubeConnect || \
        { error Error connecting to minikube; return 1; }

    export DOCKER_HOST=$(minikubeDockerHost)

    echo K3S is ready to use
}

function disableK3s {
    unset DOCKER_HOST
    if [ -n "${ORIG_DOCKER_HOST}" ]; then
        DOCKER_HOST="${ORIG_DOCKER_HOST}"
        unset ORIG_DOCKER_HOST
    fi
    echo K3S disabled
}

ACTION=${1:-on}
case "${ACTION}" in
    on)
        enableK3s
        ;;
    off)
        disableK3s
        ;;
    *)
        usage
        ;;
esac
