DEMO_NAME=reactapp
DEMO_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

. "${DEMO_DIR}/minikube.sh"
. "${DEMO_DIR}/commands.sh"

cp -R "/src/systemtest/test_projects/${DEMO_NAME}" /tmp
cd "/tmp/${DEMO_NAME}/deploy"

minikubeConnect || \
    { error Error connecting to minikube; return 1; }

cat ~/.kube/config | toJson > ./kubeconfig.json || \
    { error Error getting kubeconfig; return 1; }

export DOCKER_HOST=$(minikubeDockerHost)

echo
echo adapt run laptop
echo adapt run k8s

