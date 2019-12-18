function error {
    echo "$*" >&2
}

function run {
    echo "$@"
    "$@"
}

function checkDryRun {
    if [[ -n ${ARGS[dry-run]} ]]; then
        echo "[SKIPPING]" "$@"
    else
        echo "$@"
        "$@"
    fi
}

function currentBranch {
    git symbolic-ref --short HEAD
}

function isReleaseBranch {
    case $(currentBranch) in
        master|release-*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

function prereleaseId {
    local BRANCH=$(currentBranch)
    case ${BRANCH} in
        release-*)
            # No preid
            ;;
        master)
            echo next
            ;;
        *)
            echo dev-${BRANCH}
            ;;
    esac
}

function isTreeClean {
    [ -z "$(git status --porcelain)" ]
}

function sanitizeSemver {
    # Translate some characters that are valid in branches, but not versions
    # For now, just translate "_" to "-"
    local UPDATED="${1//_/-}"

    # Check that the resulting version is valid
    if [ -z "$(${REPO_ROOT}/node_modules/.bin/semver ${UPDATED})" ]; then
        error "ERROR: version ${UPDATED} is not a valid semver version"
        exit 1
    fi
    echo "${UPDATED}"
}
