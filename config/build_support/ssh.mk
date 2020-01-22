ssh-setup: $(HOME)/.ssh/known_hosts
.PHONY: ssh-setup

$(HOME)/.ssh/known_hosts:
	mkdir -p "${HOME}/.ssh"
	chmod 0700 "${HOME}/.ssh"
	ssh-keyscan -H gitlab.com >> "${HOME}/.ssh/known_hosts"
	ssh-keyscan -H github.com >> "${HOME}/.ssh/known_hosts"
