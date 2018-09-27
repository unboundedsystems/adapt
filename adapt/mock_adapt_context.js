/*
 * Enables mocking of AdaptContext for unit testing. Creates a mock
 * AdaptContext when not having to use the Adapt compiler.
 * This is needed for unit testing Adapt plugins and observers.
 * Load this file prior to requiring any of your files that register
 * plugins or observers.
 * Example usage with mocha:
 *   mocha --register @usys/adapt/mock_adapt_context mytests/*
 */
const ts = require("./dist/src/ts");
ts.mockAdaptContext();
