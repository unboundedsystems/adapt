#
# Create an official release
#
# Important: 'prerelease-publish' has the side effect of committing a version
# change to git. That commit from 'prerelease-publish' is needed as a pre-req
# in order to do the publish with --no-update in 'release'.
#
release: ssh-setup prerelease-publish release-test
	@$(log) "$@ START"
	@if [ -z "$(CI)" ]; then $(log_err) "ERROR: ($@) release target should only run in CI"; false; fi
	@if [ -z "$(ADAPT_WEB_TOKEN)" ]; then $(log_err) "ERROR: ($@) ADAPT_WEB_TOKEN must be set"; false; fi
	@if [ -z "$(ADAPT_NPM_TOKEN)" ]; then $(log_err) "ERROR: ($@) ADAPT_NPM_TOKEN must be set"; false; fi
	@if [ -z "$(ADAPT_RELEASE_TYPE)" ]; then $(log_err) "ERROR: ($@) ADAPT_RELEASE_TYPE must be set"; false; fi

	# This should only be done in CI because it modifies the repo's remote settings
	git remote set-url --push origin "https://gitlab-ci-token:$(ADAPT_WEB_TOKEN)@gitlab.com/$(CI_PROJECT_PATH).git"
	# This should only be done in CI because it modifies the user's NPM auth settings
	npm config set '//registry.npmjs.org/:_authToken' "$(ADAPT_NPM_TOKEN)"
	# Set up Docker auth for CI
	. "$(REPO_ROOT)/bin/setup-docker-auth.sh"

	ADAPT_RELEASE_TESTS= $(REPO_ROOT)/scripts/release/publish.sh --yes --no-build --no-update $(ADAPT_RELEASE_TYPE)
	@$(log_success) "$@ COMPLETE"
.PHONY: release

#
# Run the publish process, including creating the version commit to git, but
# publish to our local registry for testing.
# If testing goes well, this will get pushed.
#
prerelease-publish: cli-build prerelease-registry-start
	@$(log) "$@ START"
	@if [ -z "$(ADAPT_RELEASE_TYPE)" ]; then $(log_err) "ERROR: ($@) ADAPT_RELEASE_TYPE must be set"; false; fi
	@if [ -z "$(ADAPT_RELEASE_TESTS)" ]; then $(log_err) "ERROR: ($@) ADAPT_RELEASE_TESTS must be set"; false; fi
	NPM_CONFIG_REGISTRY=$(ADAPT_PRERELEASE_REGISTRY) $(REPO_ROOT)/scripts/release/publish.sh --yes --local --no-build $(ADAPT_RELEASE_TYPE)
	@$(log_success) "$@ COMPLETE"
.PHONY: prerelease-publish

prerelease-registry: prerelease-publish
.PHONY: prerelease-registry

