#!/bin/sh

#Read configuration for this deployment
source /home/git/config

while read oldrev newrev refname
do
    if [ "refs/heads/master" = $refname ]; then
        #Make sure this ref won't get pruned
        git tag adadpt-prune-ref-${newrev} ${newrev}
        #Poke etcd to invoke a build due to the git repo update
        ETCDCTL_API=3 etcdctl --endpoints ${ADAPT_ETCD_EP} put --prev-kv adapt-${ADAPT_DEPLOYMENT}-latestRef $newrev
        if [ 0 != $? ]; then
            echo "WARNING: new ref pushed, but could no update etcd, latest ref will not deploy!"
        fi
    fi
done
