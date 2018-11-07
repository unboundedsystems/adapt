// Do not allow the global objects to be modified/patched by collections.
const saveGlobals = require("./saveGlobals");
const restore = saveGlobals();

exports.Set = require("./set");

restore();
