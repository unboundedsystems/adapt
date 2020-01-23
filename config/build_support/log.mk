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

#
# Do pretty logging about starting and completing a command in a recipe
# First param: Descriptive name of task for log message
# Second param: Shell command to execute
#
# Example: $(call log_command,core-build,$(MAKE) -C core build)
#
define log_command =
@$(log) "$(1): START"
@echo $(2)
@$(2) || \
	($(log_err) "$(1): FAILED"; false)
@$(log_success) "$(1): COMPLETE"
endef
