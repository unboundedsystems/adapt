#!/bin/bash

version="$1"
shift

if [ -z "$version" ]; then
  echo "usage: $0 VERSION" 1>&2
  exit 1
fi

toplevel=$(git rev-parse --show-toplevel)

docker build \
  -f "${toplevel}/docker_hub/Dockerfile" \
  --build-arg ADAPT_VERSION="$version" \
  -t "unboundedsystems/adapt:${version}" \
  -t "unboundedsystems/adapt:latest" \
  "${toplevel}/docker_hub"
