#!/bin/sh -x

fail() {
    echo "Tests Failed!"
    exit 1
}

rm -f adapt-git-server-test-id_rsa*
ssh-keygen -t rsa -f adapt-git-server-test-id_rsa -N ""

docker-compose down
docker-compose up -d || fail
docker exec -i -t adaptgitservertest_git-client_1 sh -x ./test.sh || fail
docker-compose down || fail
