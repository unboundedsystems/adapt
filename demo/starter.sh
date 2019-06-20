DEMO_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

. "${DEMO_DIR}/minikube.sh"
. "${DEMO_DIR}/commands.sh"


minikubeConnect || \
    { error Error connecting to minikube; return 1; }

export KUBECONFIG="${HOME}/.kube/config.json"
cat ~/.kube/config | toJson > "${KUBECONFIG}" || \
    { error Error getting kubeconfig; return 1; }

export DOCKER_HOST=$(minikubeDockerHost)

cd /scratch

echo
echo adapt new hello-react-node-postgres ./moviedb

