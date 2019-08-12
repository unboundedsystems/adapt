WEB_DIR:=web
WEB_DOCS_DIR:=$(WEB_DIR)/docs

#
# adapt-web git repo
#

# We only care if the repo exists, not about its modification time.
# Don't create a dependency on $(WEB_DIR)/.git if it already exists.
WEB_REPO_EXISTS:=$(shell test -e $(WEB_DIR)/.git && echo yes)

ifdef ADAPT_WEB_TOKEN
# A generated GitLab Personal Access Token can have write (push) permissions
WEB_REPO:=https://gitlab-ci-token:$(ADAPT_WEB_TOKEN)@gitlab.com/unboundedsystems/adapt-web.git

else ifdef CI_JOB_TOKEN
# The CI_JOB_TOKEN is generated for all CI jobs, but only has read permissions
WEB_REPO:=https://gitlab-ci-token:$(CI_JOB_TOKEN)@gitlab.com/unboundedsystems/adapt-web.git

else
# Non-CI users need SSH while Adapt is still set to private
# Once adapt-web is public, we can probably change to https
WEB_REPO:=git@gitlab.com:unboundedsystems/adapt-web.git
WEB_GIT_DEPS:=ssh-setup
endif

ifneq ($(WEB_REPO_EXISTS),yes)

$(WEB_DIR)/.git: $(WEB_GIT_DEPS)
	git clone $(WEB_REPO) $(WEB_DIR)

endif # WEB_REPO_EXISTS

# web Makefile needs these exported
export REPO_ROOT
export PROJ_DIRS_ABS

web-docs: $(WEB_DIR)/.git docs .doctoc-updated
	$(call log_command,$@,$(MAKE) -C $(WEB_DIR) update-from-adapt)
.PHONY: web-docs

web-build: web-docs
	$(call log_command,$@,$(MAKE) -C $(WEB_DIR) build)
.PHONY: web-build

web-test: web-docs
	$(call log_command,$@,$(MAKE) -C $(WEB_DIR) test)
.PHONY: web-test

web-clean: $(WEB_DIR)/.git
	$(call log_command,$@,$(MAKE) -C $(WEB_DIR) clean)
.PHONY: web-clean
clean_submakes += web-clean

web-release-master: $(WEB_GIT_DEPS) web-docs
	$(call log_command,$@,$(MAKE) -C $(WEB_DIR) push-docs-master)
.PHONY: web-release-master

ssh-setup: $(HOME)/.ssh/known_hosts
.PHONY: ssh-setup

$(HOME)/.ssh/known_hosts:
	mkdir -p "${HOME}/.ssh"
	chmod 0700 "${HOME}/.ssh"
	ssh-keyscan -H gitlab.com >> "${HOME}/.ssh/known_hosts"
