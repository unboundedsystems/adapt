GIT_HOOKS_SRC := $(wildcard build_support/git_hooks/*)
GIT_HOOKS := $(patsubst build_support/git_hooks/%,.git/hooks/%,$(GIT_HOOKS_SRC))

$(GIT_HOOKS): $(GIT_HOOKS_SRC)
	@# Copy all src files to directory of target file
	cp $^ $(@D)
SETUP_TARGETS += $(GIT_HOOKS)
