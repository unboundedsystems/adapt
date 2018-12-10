#!/usr/bin/env sh
if [ ! -e /.dockerenv ]; then 
    echo "Error: You probably meant to run install-ansible.sh in a container, right?"
    exit 1
fi
echo deb http://ppa.launchpad.net/ansible/ansible/ubuntu trusty main > /etc/apt/source.list.d/ansible.list
echo deb http://ppa.launchpad.net/ansible/ansible/ubuntu trusty main > /etc/apt/sources.list.d/ansible.list
apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 93C4A3FD7BB9C367
apt-get update
apt-get install -y --no-install-recommends ansible