ADAPT_TEST_REGISTRY_PORT:=4873
export ADAPT_TEST_REGISTRY:=http://127.0.0.1:$(ADAPT_TEST_REGISTRY_PORT)

run-local-registry: build
	@$(log) "$@ START (port $(ADAPT_TEST_REGISTRY_PORT))"
	$(REPO_ROOT)/testutils/bin/run-local-registry.js stop $(ADAPT_TEST_REGISTRY_PORT) || true
	ADAPT_TEST_REGISTRY= $(REPO_ROOT)/testutils/bin/run-local-registry.js start --loglevel debug --port $(ADAPT_TEST_REGISTRY_PORT)
	@$(log_success) "$@ COMPLETE"
.PHONY: run-local-registry

ADAPT_PRERELEASE_REGISTRY_PORT:=5873
ADAPT_PRERELEASE_REGISTRY:=http://127.0.0.1:$(ADAPT_PRERELEASE_REGISTRY_PORT)

# The testutils-build pre-req is needed for the local registry and supporting code.
prerelease-registry-start: testutils-build
	@$(log) "$@ START (port $(ADAPT_PRERELEASE_REGISTRY_PORT))"
	ADAPT_TEST_REGISTRY= $(REPO_ROOT)/testutils/bin/run-local-registry.js start --empty --loglevel debug --port $(ADAPT_PRERELEASE_REGISTRY_PORT)
	@$(log_success) "$@ COMPLETE"
.PHONY: prerelease-registry-start
