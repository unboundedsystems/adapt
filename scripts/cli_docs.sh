#!/usr/bin/env bash

set -e

# NOTE: This script can be sourced or executed, but NOT via symlink
REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )

ROOT_README="${REPO_ROOT}/README.md"
CLI_README="${REPO_ROOT}/cli/README.md"

cp "${ROOT_README}" "${CLI_README}"
cat >> "${CLI_README}" <<END

## Command Reference
<!-- commands -->
END

oclif-dev readme
