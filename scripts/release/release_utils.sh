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

# Retry a command until it returns success or maximum retries is reached
#   retry <retries> <sleep secs> <command> [<args>...]
function retry {
    local TRIES="$1"; shift
    local SLEEP_SECS="$1"; shift

    while ! "$@"; do
        if [[ $(( --TRIES )) -le 0 ]]; then
            return 1
        fi
        sleep "${SLEEP_SECS}"
    done
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

function setupGitCreds {
    if [[ -z $(git config --get user.name) ]]; then
        if [[ -z ${GIT_USER_NAME} ]]; then
            error "Cannot determine git user.name. Set via GIT_USER_NAME environment var."
            return 1
        fi
        run git config --global user.name "${GIT_USER_NAME}" || return 1
    fi

    if [[ -z $(git config --get user.email) ]]; then
        if [[ -z ${GIT_USER_EMAIL} ]]; then
            error "Cannot determine git user.email. Set via GIT_USER_EMAIL environment var."
            return 1
        fi
        run git config --global user.email "${GIT_USER_EMAIL}" || return 1
    fi
}

function currentVersion {
    node -e "console.log(require('${REPO_ROOT}/lerna.json').version)"
}
