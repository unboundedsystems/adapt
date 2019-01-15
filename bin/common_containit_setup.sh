# Common containit script environment setup
#
# Must set TOP_DIR prior to sourcing this script.

CTR_ADD_PATH="/src/node_modules/.bin"

if [[ $(pwd) =~ ${TOP_DIR}/([^/]+) ]]; then
    PROJECT="${BASH_REMATCH[1]}"
    if [ -n "${PROJECT}" ]; then
        CTR_ADD_PATH="/src/${PROJECT}/node_modules/.bin:${CTR_ADD_PATH}"
    fi
fi

# Ensure the DNS cache is running and use that as the DNS server
DNS_IP=$("${TOP_DIR}/bin/dnsmasq")
if [ $? -ne 0 ]; then
    echo "Error starting DNS cache"
    exit 1
fi
DOCKER_ARGS+=" --dns ${DNS_IP}"

CTR_CACHE_DIR="/root/.cache/yarn"
DOCKER_ARGS+=" -eYARN_CACHE_FOLDER=${CTR_CACHE_DIR} -v${HOME}/.cache/yarn:${CTR_CACHE_DIR}"
DOCKER_ARGS+=" -eYARN_MUTEX=file:${CTR_CACHE_DIR}/.yarn-mutex"

DOCKER_ARGS+=" -v/var/run/docker.sock:/var/run/docker.sock"

DOCKER_CREDS="${HOME}/.docker/config.json"
if [ -f "${DOCKER_CREDS}" ]; then
    DOCKER_ARGS+=" -v${DOCKER_CREDS}:/root/.docker/config.json"
fi

CRED_FILE="${HOME}/.adaptAwsCreds"
if [ -f "${CRED_FILE}" ]; then
    DOCKER_ARGS+=" -v${CRED_FILE}:/root/.adaptAwsCreds"
fi

DOCKER_ARGS+=" -eNODE_NO_WARNINGS=1"

# Propagate these from current environment into the docker container env
DOCKER_ARGS+=" -eADAPT_PARALLEL_MAKE -eADAPT_TEST_HEAPDUMP"
DOCKER_ARGS+=" -eADAPT_TEST_MINIKUBE -eADAPT_RUN_LONG_TESTS"
DOCKER_ARGS+=" -eADAPT_NO_FORK"
DOCKER_ARGS+=" -eAWS_ACCESS_KEY_ID -eAWS_SECRET_ACCESS_KEY -eAWS_DEFAULT_REGION"
