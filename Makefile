#
# FIXME: Get a real build system instead of Make
#

include build_support/common.mk
include build_support/dockerize.mk
ifeq ($(IN_DOCKER),true)

#
# Default target
#
all: test
.PHONY: all

# Variables that modules can add onto
SETUP_TARGETS :=
CLEANS :=

include build_support/git.mk
include build_support/submake.mk
include build_support/node_modules.mk
include build_support/ssh.mk

# Turn on parallelism by default
ADAPT_PARALLEL_MAKE ?= -j $(shell nproc)
MAKEFLAGS += $(ADAPT_PARALLEL_MAKE)

#
# Submake targets
# Define some targets that run a make target in all PROJ_DIRS. Examples of
# the targets created below are:
#   core-build, core-test, cli-build, cli-test, etc.
#
SUBMAKE_TARGETS:=build test clean cleaner pack lint prepush coverage docs

$(foreach target,$(SUBMAKE_TARGETS),$(eval $(call submake-target,$(target))))


#
# User-friendly targets: build, test, clean, etc.
#
build: $(build_submakes) docs
$(build_submakes): setup $(NODE_INSTALL_DONE)

test: $(test_submakes)
$(test_submakes): build

pack: $(pack_submakes)
$(pack_submakes): build

lint: $(lint_submakes)
$(lint_submakes): build

prepush: $(prepush_submakes)
$(prepush_submakes): lint

# This top-level target is purposefully different. It's NOT just making the
# target in the submakes.
coverage: build
	nyc make test


#
# Build dependencies between directories
#
core-build: utils-build dom-parser-build testutils-build
cli-build: core-build cloud-build utils-build testutils-build
cloud-build: core-build utils-build testutils-build
testutils-build: utils-build
cli-test: ssh-setup

include build_support/docs.mk

clean: $(clean_submakes)
	rm -rf $(CLEANS)

cleaner: clean $(cleaner_submakes)
	rm -rf node_modules .nyc_output

#
# Initial setup, mostly stuff for a newly cloned repo
#
setup: $(SETUP_TARGETS)
.PHONY: setup

endif # IN_DOCKER

