# Capture DOCKER_HOST before we possibly change it to point to minikube later
export ORIG_DOCKER_HOST=${ORIG_DOCKER_HOST:-${DOCKER_HOST:-unix:///var/run/docker.sock}}

function outerDocker {
    docker -H "${ORIG_DOCKER_HOST}" "$@"
}

function error {
    echo "$*" >&2
}

function minikubeContainer {
    if [ -n "${MINIKUBE}" ]; then
        echo "${MINIKUBE}"
    else
        echo ${ADAPT_TEST_K8S:-k3s}
    fi
}

function minikube {
    outerDocker exec $(minikubeContainer) minikube "$@"
}

function selfContainer {
    local SELF_CTR=$(head -1 /proc/self/cgroup | cut -d/ -f 3)

    if [ -z "${SELF_CTR}" ]; then
        error This script should be run in a container
        return 1
    fi
    echo "${SELF_CTR}"
}

function containerNetworks {
    if [ -z "$1" ]; then
        error containerNetworks: No container name provided
        return 1
    fi
    local NETWORKS=$(outerDocker inspect  --format='{{range $name,$_ := .NetworkSettings.Networks}}{{$name}}{{end}}' $1)
    if [ -z "${NETWORKS}" ]; then
        error Cannot find network for container $1
        return 1
    fi
    echo "${NETWORKS}"
}

function containerIP {
    if [ -z "$1" ]; then
        error containerIP: No container name provided
        return 1
    fi
    local ADDR=$(outerDocker inspect  --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $1)
    if [ -z "${ADDR}" ]; then
        error Cannot find IP address for container $1
        return 1
    fi
    echo "${ADDR}"
}

function kubeconfig {
    outerDocker exec $(minikubeContainer) cat /kubeconfig
}

function toJson {
    python -c 'import sys, yaml, json; json.dump(yaml.load(sys.stdin), sys.stdout, indent=4)'
}

function minikubeConnect {
    local MK
    local SELF
    local NETWORK
    local MK_IP
    MK=$(minikubeContainer)
    SELF=$(selfContainer) || return 1
    NETWORK=$(containerNetworks ${MK}) || return 1
    MK_IP=$(containerIP ${MK}) || return 1

    outerDocker network connect ${NETWORK} ${SELF}

    if [ ! -f ~/.kube/config ]; then
        mkdir ~/.kube || \
            { error "Cannot create ~/.kube" ; return 1; }
        kubeconfig > ~/.kube/config || \
            { error "Cannot write kubeconfig" ; return 1; }
    fi

    installKubectl || \
        { error "Cannot install kubectl" ; return 1; }

    local MK_URL="https://${MK_IP}:8443/"
    curl -k ${MK_URL} >& /dev/null || \
        { error "Cannot connect to ${MK_URL}" ; return 1; }
}

KUBECTL=/usr/local/bin/kubectl
KUBECTL_VERSION=1.9.1

function installKubectl {
    if [ -f "${KUBECTL}" ]; then
        return
    fi

    curl -s -LO https://storage.googleapis.com/kubernetes-release/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl || \
        { error "Cannot download kubectl" ; return 1; }
    chmod +x ./kubectl
    mv ./kubectl "${KUBECTL}" || \
        { error "Cannot install kubectl" ; return 1; }
    apt-get install -qq bash-completion >& /dev/null
    source <(kubectl completion bash)
    . /etc/profile.d/bash_completion.sh
}

function minikubeDockerHost {
    containerIP $(minikubeContainer)
}

