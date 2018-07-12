#
# Default target
#
all: test
.PHONY: all


#
# submake-target
# Usage: $(eval $(call submake-target, target-name))
# Given a target-name (ex: build), create a target with that suffix for
# each directory in PROJ_DIRS. (ex: adapt-build, cli-build)
#
define submake-target =
  # Example: build_submakes = adapt-build cli-build ...
  $(1)_submakes = $(addsuffix -$(1),$(PROJ_DIRS))

  # The mechanics for calling out to a sub-make for each kind of target
  $$($(1)_submakes): %-$(1):
	@$$(log) "$$(@:-$(1)=): $(1) START"
	$$(MAKE) -C $$(@:-$(1)=) $(1)
	@$$(log_success) "$$(@:-$(1)=): $(1) COMPLETE"
  .PHONY: $$($(1)_submakes)

  # Declare target-name as phony target. Example: .PHONY: build
  .PHONY: $(1)
endef

# List of directory names for all directories that have a Makefile
PROJ_DIRS := $(patsubst %/, %, $(dir $(wildcard */Makefile)))


#
# Submake targets
# Define some targets that run a make target in all PROJ_DIRS. Examples of
# the targets created below are:
#   adapt-build, adapt-test, cli-build, cli-test, etc.
#
SUBMAKE_TARGETS:=build test clean cleaner pack lint

$(foreach target,$(SUBMAKE_TARGETS),$(eval $(call submake-target,$(target))))


#
# User-friendly targets: build, test, clean, etc.
#
build: setup $(build_submakes)

test: build $(test_submakes)

clean: $(clean_submakes)

cleaner: $(cleaner_submakes)

pack: build $(pack_submakes)

lint: setup $(lint_submakes)

#
# Build dependencies between directories
#
cli-build cloud-build: adapt-build
cli-build: cloud-build


#
# Initial setup, mostly stuff for a newly cloned repo
#
setup: containit/containit.sh

containit/containit.sh:
	git submodule update --init --recursive


#
# Logging
#

# colors
color_red = \033[01;31m
color_green = \033[01;32m
color_blue = \033[01;34m
color_white = \033[01;37m
color_bold = \033[1m
color_clear = \033[m

_log = printf "\n%b*****\n %s\n*****$(color_clear)\n\n"

log =         $(_log) "$(color_blue)"
log_success = $(_log) "$(color_green)"
log_err =     $(_log) "$(color_red)"
