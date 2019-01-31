DEMO_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

. "${DEMO_DIR}/minikube.sh"
. "${DEMO_DIR}/commands.sh"

cp -R /src/cli/test_projects/nodecellar /tmp
cd /tmp/nodecellar

minikubeConnect || \
    { error Error connecting to minikube; return 1; }

cat ~/.kube/config | toJson > ./kubeconfig.json || \
    { error Error getting kubeconfig; return 1; }


echo
echo adapt deploy:create --init k8s
echo adapt deploy:create --init dev
echo adapt deploy:create --init aws

