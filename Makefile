#
# FIXME: Get a real build system instead of Make
#

include build_support/dockerize.mk
ifeq ($(IN_DOCKER),true)

#
# Default target
#
all: test
.PHONY: all

include build_support/common.mk

# Place for any module to add stuff to the setup target
SETUP_TARGETS :=

include build_support/git.mk
include build_support/submake.mk
include build_support/node_modules.mk

# Turn on parallelism by default
ADAPT_PARALLEL_MAKE ?= -j $(shell nproc)
MAKEFLAGS += $(ADAPT_PARALLEL_MAKE)

#
# Submake targets
# Define some targets that run a make target in all PROJ_DIRS. Examples of
# the targets created below are:
#   adapt-build, adapt-test, cli-build, cli-test, etc.
#
SUBMAKE_TARGETS:=build test clean cleaner pack lint prepush coverage

$(foreach target,$(SUBMAKE_TARGETS),$(eval $(call submake-target,$(target))))


#
# User-friendly targets: build, test, clean, etc.
#
build: $(build_submakes)
$(build_submakes): setup $(NODE_INSTALL_DONE)

test: $(test_submakes)
$(test_submakes): build

clean: $(clean_submakes)

cleaner: $(cleaner_submakes)
	rm -rf node_modules

pack: $(pack_submakes)
$(pack_submakes): build

lint: $(lint_submakes)
$(lint_submakes): build

prepush: $(prepush_submakes)
$(prepush_submakes): lint test

# This top-level target is purposefully different. It's NOT just making the
# target in the submakes.
coverage: build
	nyc make test


#
# Build dependencies between directories
#
adapt-build: utils-build dom-parser-build testutils-build
cli-build: adapt-build cloud-build utils-build testutils-build
cloud-build: adapt-build utils-build testutils-build
testutils-build: utils-build

#
# Initial setup, mostly stuff for a newly cloned repo
#
setup: $(SETUP_TARGETS)
.PHONY: setup


endif # IN_DOCKER

