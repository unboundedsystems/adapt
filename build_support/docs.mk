include build_support/web.mk

docs: $(docs_submakes) .doctoc-updated
$(docs_submakes): $(build_submakes)

DOCTOC_FILES := $(shell grep -rL 'DOCTOC SKIP' --exclude-dir=api docs | grep '\.md$$')
.doctoc-updated: $(NODE_INSTALL_DONE) $(DOCTOC_FILES)
	doctoc --gitlab --title '## Table of Contents' $(DOCTOC_FILES)
	touch $@
CLEANS += .doctoc-updated
