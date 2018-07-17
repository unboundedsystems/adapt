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
