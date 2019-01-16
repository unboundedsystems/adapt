# Imports Docker auth from env into the current container

DOCKER_DIR="${HOME}/.docker"
DOCKER_CFG="${DOCKER_DIR}/config.json"

if [ -f "${DOCKER_CFG}" ]; then
    exit 0 # Already set up
fi
if [ -z "${DOCKER_AUTH_CONFIG}" ]; then
    exit 0 # No auth data to write
fi
mkdir -p "${DOCKER_DIR}"
touch "${DOCKER_CFG}"
chmod -R 0600 "${DOCKER_DIR}"
echo "${DOCKER_AUTH_CONFIG}" > "${DOCKER_CFG}"
