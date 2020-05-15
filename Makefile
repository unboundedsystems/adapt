#
# FIXME: Get a real build system instead of Make
#

include config/build_support/common.mk
include $(BUILD_SUPPORT)/dockerize.mk
ifeq ($(IN_DOCKER),true)

#
# Default target
#
all: test
.PHONY: all

# Clean up the log directory if we're logging. Don't clean in CI because
# we're already logging to files in the log dir by this point.
ifneq ($(strip $(ADAPT_BUILD_LOGDIR)),)
  ifeq ($(strip $(CI)),)
    # Ensure absolute path
    export ADAPT_BUILD_LOGDIR:=$(abspath $(ADAPT_BUILD_LOGDIR))

    # Check that we don't accidentally delete the entire repo we're in
    ifeq ($(ADAPT_BUILD_LOGDIR),$(abspath .))
      $(error ADAPT_BUILD_LOGDIR cannot be set to the current directory)
    endif

    # Empty for each build
    IGNORED:=$(shell rm -rf $(ADAPT_BUILD_LOGDIR); mkdir -p $(ADAPT_BUILD_LOGDIR))
  endif
endif

# Variables that modules can add onto
SETUP_TARGETS :=
CLEANS :=

include $(BUILD_SUPPORT)/git.mk
include $(BUILD_SUPPORT)/submake.mk
include $(BUILD_SUPPORT)/node_modules.mk
include $(BUILD_SUPPORT)/ssh.mk
include $(BUILD_SUPPORT)/local_registry.mk
include $(BUILD_SUPPORT)/release.mk

# Turn on parallelism by default
ADAPT_PARALLEL_MAKE ?= -j $(shell nproc)
MAKEFLAGS += $(ADAPT_PARALLEL_MAKE)

#
# Submake targets
# Define some targets that run a make target in all PROJ_DIRS. Examples of
# the targets created below are:
#   core-build, core-test, cli-build, cli-test, etc.
#
SUBMAKE_TARGETS:=build test clean cleaner pack lint prepush coverage docs release-test

$(foreach target,$(SUBMAKE_TARGETS),$(eval $(call submake-target,$(target))))


#
# User-friendly targets: build, test, clean, etc.
#
build: $(build_submakes) docs
$(build_submakes): setup $(NODE_INSTALL_DONE)

test: $(test_submakes)
$(test_submakes): build

release-test: $(release-test_submakes)
$(release-test_submakes): prerelease-registry

pack: $(pack_submakes)
$(pack_submakes): build

lint: $(lint_submakes)
$(lint_submakes): build

prepush: $(prepush_submakes)
$(prepush_submakes): lint

# This top-level target is purposefully different. It's NOT just making the
# target in the submakes.
coverage: build
	nyc --nycrc-path config/.nycrc make test


#
# Build dependencies between directories
#
core-build: utils-build dom-parser-build testutils-build
cli-build: core-build cloud-build utils-build testutils-build
cloud-build: core-build utils-build testutils-build
testutils-build: utils-build
systemtest-build: core-build cloud-build utils-build testutils-build cli-build
core-test: run-local-registry
cli-test: ssh-setup run-local-registry
docs-test: run-local-registry
systemtest-test: ssh-setup run-local-registry
docs-release-test: ssh-setup prerelease-registry

# Artificial dependency to remove parallelism
docs-test: core-test cloud-test

include $(BUILD_SUPPORT)/docs.mk

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

