#!/bin/sh -x

source /home/git/config

chown -R root:root /root/.ssh/
chmod 600 /root/.ssh/id_rsa
eval `ssh-agent` || exit 1
ssh-add || exit 1

git clone ssh://git@git-server/repo.git || exit 1

cd repo
git config user.email "testuser@localdomain" || exit 1
git config user.name "Test User" || exit 1

echo "This is an update" > somefile.txt
git add somefile.txt || exit 1
git commit -m"Test commit of somefile.txt" || exit 1
git push origin || exit 1

export ETCDCTL_API=3
export ETCDCTL_ENDPOINTS=${ADAPT_ETCD_EP}

result=`etcdctl get adapt-${ADAPT_DEPLOYMENT}-latestRef | tail -n 1`
test 0 = $? || exit 1

test `git rev-parse HEAD` = $result || exit 1
