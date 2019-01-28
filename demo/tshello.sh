DEMO_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

. "${DEMO_DIR}/minikube.sh"

cp -R /src/cli/test_projects/tshello /tmp
cd /tmp/tshello

minikubeConnect || \
    { error Error connecting to minikube; return 1; }

cat ~/.kube/config | toJson > ./kubeconfig.json || \
    { error Error getting kubeconfig; return 1; }

echo
echo adapt deploy:create --init prod

