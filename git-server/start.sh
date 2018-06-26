#!/bin/sh

if [ ! -f config ]; then
    echo "Error, no /home/git/config file found!"
    exit 1
fi

if [ ! -f repo.git/HEAD ]; then
    echo "Creating Repository"
    (cd repo.git; git init --bare)
    cp post-receive.sh repo.git/hooks/post-receive
    chmod 755 repo.git/hooks/post-receive
    chown -R git:git repo.git
fi

if [ ! -f /etc/ssh/ssh_host_dsa_key ]; then
    echo "Generating SSH Keys"
    ssh-keygen -A
fi

echo "Starting sshd"
/usr/sbin/sshd -D