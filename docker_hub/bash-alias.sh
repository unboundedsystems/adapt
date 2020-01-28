# Instructions:
#   Use the Bash `source` command to read this file in your ~/.bashrc.
#
#   By default, the Docker image used will be `adaptjs/adapt:latest`.
#   You can set the ADAPT_DOCKER_IMAGE environment variable if you'd
#   like to use a different image.

adapt() {
  local image_name="${ADAPT_DOCKER_IMAGE:-adaptjs/adapt:latest}"

  if ! docker image inspect "$image_name" >/dev/null 2>&1 ; then
    docker pull "$image_name"
  fi

  docker run --rm -ti \
    -v "$(pwd):/src/" \
    -v "${HOME}/.local/share/adapt:/root/.local/share/adapt" \
    -v "${HOME}/.ssh:/root/.ssh" \
    "$image_name" \
    "$@"
}
