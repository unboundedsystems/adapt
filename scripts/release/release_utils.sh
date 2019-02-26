function error {
    echo "$*" >&2
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
