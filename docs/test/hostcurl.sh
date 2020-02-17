#!/usr/bin/env bash

docker run --rm --net=host curlimages/curl:7.67.0 --retry-connrefused --retry-delay 1 --retry 3 "$@"
