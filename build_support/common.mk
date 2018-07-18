REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
BUILD_SUPPORT := $(REPO_ROOT)/build_support

include $(BUILD_SUPPORT)/log.mk

# List of directory names for all directories that have a Makefile.
# Ensures the trailing slash is removed.
PROJ_DIRS_ABS := $(patsubst %/, %, $(dir $(wildcard $(REPO_ROOT)/*/Makefile)))
PROJ_DIRS := $(foreach pdir_abs,$(PROJ_DIRS_ABS),$(notdir $(pdir_abs)))
