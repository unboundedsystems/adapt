#!/usr/bin/env bash

docker run --rm --net=host curlimages/curl:7.67.0 "$@"
