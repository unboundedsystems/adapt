function currentBranch {
    git symbolic-ref --short HEAD
}

function isReleaseBranch {
    case $(currentBranch) in
        master|next)
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
        master)
            # No preid
            ;;
        next)
            echo ${BRANCH}
            ;;
        *)
            echo dev-${BRANCH}
            ;;
    esac
}
