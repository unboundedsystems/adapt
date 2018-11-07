// Do not allow the global objects to be modified/patched by collections.
const saveGlobals = require("./saveGlobals");
const restore = saveGlobals();

module.exports = require("collections/set").CollectionsSet;

restore();
