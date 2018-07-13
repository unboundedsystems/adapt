#
# Dockerize.mk
# Always runs make inside the Docker container, using bin/make
#

IN_DOCKER := $(shell if [ -f /.dockerenv ]; then echo true; else echo false; fi; )
SCRIPT_DIR := $(dir $(lastword $(MAKEFILE_LIST)))
DMAKE := $(abspath $(SCRIPT_DIR)/../bin/make)

ifeq ($(IN_DOCKER),false)

ifeq ($(MAKECMDGOALS),)
FAKEGOAL := all

else
FAKEGOAL := $(firstword $(MAKECMDGOALS))

# For any other goals on the command line, THIS make will ignore, but we
# still pass them to the make inside docker to act on.
OTHERGOALS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
$(OTHERGOALS):
.PHONY: $(OTHERGOALS)
endif # MAKECMDGOALS

# Use "+" on the recipe line below to always run the make command inside
# the container (regardless of "-n") so THAT make actually does the processing
# of whatever options.
$(FAKEGOAL):
	+DOCKER_ARGS="-eMAKEFLAGS=$(MAKEFLAGS)" $(DMAKE) $(MAKECMDGOALS)
.PHONY: $(FAKEGOAL)
endif # IN_DOCKER==false
