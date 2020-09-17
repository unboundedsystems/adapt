REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/../..)
BUILD_SUPPORT := $(REPO_ROOT)/config/build_support
ADAPT_TMPDIR_BASE := /tmp/adapt-test

IS_MINGW:=$(shell uname -s | grep MINGW >/dev/null && echo true || echo false)
ifeq ($(IS_MINGW),true)
    IS_WINDOWS:=true
else
    IS_WINDOWS:=false
endif

ifeq ($(IS_WINDOWS),true)
    # Set up a few things that are normally taken care of by our common
	# container setup, which we don't use on Windows
	export PATH:=$(REPO_ROOT)/node_modules/.bin:$(PATH)
	export YARN_AUTH_TOKEN:=faketoken
	export DOCKER_HOST?=tcp://localhost:2375
endif

include $(BUILD_SUPPORT)/log.mk

# Exclude these dirs from PROJ_DIRS
NOT_PROJ_DIRS:=web
NOT_PROJ_DIRS_ABS:=$(addprefix $(REPO_ROOT)/,$(NOT_PROJ_DIRS))

# List of directory names for all directories that have a Makefile.
# Ensures the trailing slash is removed.
ALL_PROJ_DIRS_ABS := $(patsubst %/, %, $(dir $(wildcard $(REPO_ROOT)/*/Makefile)))

# Final project directory names, with NOT_PROJ_DIRS excluded
PROJ_DIRS_ABS := $(filter-out $(NOT_PROJ_DIRS_ABS),$(ALL_PROJ_DIRS_ABS))
PROJ_DIRS := $(foreach pdir_abs,$(PROJ_DIRS_ABS),$(notdir $(pdir_abs)))

# Convert first arg to lower case
to_lower = $(shell echo "$(1)" | tr '[:upper:]' '[:lower:]')
rp:=)

# Convert first arg to boolean. Returns 'true' or 'false'
to_bool = $(shell lc=$$(echo "$(1)" | tr '[:upper:]' '[:lower:]'); case $${lc} in 0|false|off|no|''$(rp) echo false ;; *$(rp) echo true ;; esac)
