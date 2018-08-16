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


#
# Submake targets
# Define some targets that run a make target in all PROJ_DIRS. Examples of
# the targets created below are:
#   adapt-build, adapt-test, cli-build, cli-test, etc.
#
SUBMAKE_TARGETS:=build test clean cleaner pack lint prepush

$(foreach target,$(SUBMAKE_TARGETS),$(eval $(call submake-target,$(target))))


#
# User-friendly targets: build, test, clean, etc.
#
build: setup $(build_submakes)

test: build $(test_submakes)

clean: $(clean_submakes)

cleaner: $(cleaner_submakes)
	rm -rf node_modules

pack: build $(pack_submakes)

lint: setup $(lint_submakes)

prepush: test lint $(prepush_submakes)

#
# Build dependencies between directories
#
adapt-build: utils-build dom-parser-build
cli-build: adapt-build cloud-build utils-build
cloud-build: adapt-build utils-build testutils-build
testutils-build: utils-build


#
# Initial setup, mostly stuff for a newly cloned repo
#
setup: $(SETUP_TARGETS)


endif # IN_DOCKER

