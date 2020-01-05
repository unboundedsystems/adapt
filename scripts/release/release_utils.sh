# Make a copy of stdout
exec 5>&1

function error {
    echo "$*" >&2
}

function run {
    # Use the copy of stdout so the other output can be redirected
    echo "$@" >&5
    "$@"
}

function checkDryRun {
    if [[ -n ${ARGS[dry-run]} ]]; then
        # Use the copy of stdout so the other output can be redirected
        echo "[SKIPPING]" "$@" >&5
    else
        # Use the copy of stdout so the other output can be redirected
        echo "$@" >&5
        "$@"
    fi
}

function currentBranch {
    if [[ -n ${CI_MERGE_REQUEST_TARGET_BRANCH_NAME} ]]; then
        echo "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME}"
        return
    fi
    if [[ -n ${CI_COMMIT_BRANCH} ]]; then
        echo "${CI_COMMIT_BRANCH}"
        return
    fi

    local BRANCH
    BRANCH=$(git symbolic-ref --short HEAD 2> /dev/null)
    if [[ -n ${BRANCH} ]]; then
        echo "${BRANCH}"
        return
    fi
}

function currentTag {
    if [[ -n ${CI_COMMIT_TAG} ]]; then
        echo "${CI_COMMIT_TAG}"
        return
    fi
    local TAG
    TAG=$(git describe --exact-match --tags 2> /dev/null)
    if [[ -n ${TAG} ]]; then
        echo "${TAG}"
    fi
}

function isMasterBranch {
    case $(currentBranch) in
        master|origin/master)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
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
            sanitizeVersionString "dev-${BRANCH}"
            ;;
    esac
}

function isTreeClean {
    [ -z "$(git status --porcelain)" ]
}

# Translate some characters that are valid in branches, but not versions
function sanitizeVersionString {
    # For now, just translate "_" to "-"
    echo "${1//_/-}"
}

function sanitizeSemver {
    local UPDATED=$(sanitizeVersionString "$1")

    # Check that the resulting version is valid
    if [ -z "$(${REPO_ROOT}/node_modules/.bin/semver ${UPDATED})" ]; then
        error "ERROR: version ${UPDATED} is not a valid semver version"
        exit 1
    fi
    echo "${UPDATED}"
}
