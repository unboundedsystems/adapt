GIT_HOOKS_SRC := $(wildcard build_support/git_hooks/*)
GIT_HOOKS := $(patsubst build_support/git_hooks/%,.git/hooks/%,$(GIT_HOOKS_SRC))

.git/hooks:
	mkdir -p $@

.git/hooks/%: build_support/git_hooks/% .git/hooks
	cp $< $@

SETUP_TARGETS += $(GIT_HOOKS)
