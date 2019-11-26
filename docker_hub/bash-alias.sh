# Use the Bash `source` command to read this file in your ~/.bashrc.

adapt() {
  local image_name='unboundedsystems/adapt:latest'  

  if ! docker image inspect "$image_name" >/dev/null 2>&1 ; then
    docker pull "$image_name"
  fi

  mkdir -p ~/.local/share/adapt

  docker run --rm -ti \
    -v "$(pwd):/src/" \
    -v "${HOME}/.local/share/adapt:/root/.local/share/adapt" \
    -v "${HOME}/.ssh:/root/.ssh" \
    "$image_name" \
    "$@"
}
