ADAPT_TEST_REGISTRY_PORT:=4873
export ADAPT_TEST_REGISTRY:=http://127.0.0.1:$(ADAPT_TEST_REGISTRY_PORT)

run-local-registry: build
	@echo Starting local registry on port $(ADAPT_TEST_REGISTRY_PORT)
	ADAPT_TEST_REGISTRY= $(REPO_ROOT)/testutils/bin/run-local-registry.js start --loglevel debug --port $(ADAPT_TEST_REGISTRY_PORT)
.PHONY: run-local-registry

ADAPT_PRERELEASE_REGISTRY_PORT:=5873
ADAPT_PRERELEASE_REGISTRY:=http://127.0.0.1:$(ADAPT_PRERELEASE_REGISTRY_PORT)

prerelease-registry: build
	@if [ -z "$(ADAPT_RELEASE_TYPE)" ]; then $(log_err) "ERROR: ($@) ADAPT_RELEASE_TYPE must be set"; false; fi
	@echo Starting pre-release local registry on port $(ADAPT_PRERELEASE_REGISTRY_PORT)
	ADAPT_TEST_REGISTRY= $(REPO_ROOT)/testutils/bin/run-local-registry.js start --empty --loglevel debug --port $(ADAPT_PRERELEASE_REGISTRY_PORT)
	NPM_CONFIG_REGISTRY=$(ADAPT_PRERELEASE_REGISTRY) $(REPO_ROOT)/scripts/release/publish.sh --yes --local $(ADAPT_RELEASE_TYPE)
.PHONY: prerelease-registry
