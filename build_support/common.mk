REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
BUILD_SUPPORT := $(REPO_ROOT)/build_support

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
