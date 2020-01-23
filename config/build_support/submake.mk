#
# submake-target
# Usage: $(eval $(call submake-target, target-name))
# Given a target-name (ex: build), create a target with that suffix for
# each directory in PROJ_DIRS. (ex: core-build, cli-build)
#
define submake-target =
  # Example: build_submakes = core-build cli-build ...
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
