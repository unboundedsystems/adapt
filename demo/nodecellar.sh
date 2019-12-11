DEMO_NAME=nodecellar
DEMO_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

. "${DEMO_DIR}/commands.sh"

cp -R "/src/systemtest/test_projects/${DEMO_NAME}" /tmp
cd "/tmp/${DEMO_NAME}"

echo
echo adapt run k8s
echo adapt run aws
