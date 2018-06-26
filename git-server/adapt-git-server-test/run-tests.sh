#!/bin/sh -x

fail() {
    echo "Tests Failed!"
    exit 1
}

rm -f adapt-git-server-test-id_rsa*
ssh-keygen -t rsa -f adapt-git-server-test-id_rsa -N ""

docker-compose down
docker-compose up -d || fail
docker-compose exec test-client sh -xc "(cd /home/git/test-client; npm run test)" || fail
docker-compose down || fail
