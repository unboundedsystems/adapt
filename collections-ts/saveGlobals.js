let saved;
const temp = {};

temp.Array = class TempArray extends Array {
    // collections does a getOwnPropertyDescriptor(Array.prototype, "find") so
    // here's a "find" for them to find.
    find() { }
}
temp.Function = class TempFunction extends Function {}
temp.Map = class TempMap extends Map {}
temp.Object = class TempObject extends Object {}
temp.RegExp = class TempRegExp extends RegExp {}
temp.Set = class TempSet extends Set {}

module.exports = function saveGlobals() {

    if (saved) return () => {};

    saved = {};
    save();
    return restore;

    function save() {
        for (const prop of Object.keys(temp)) {
            saved[prop] = global[prop];
            global[prop] = temp[prop];
        }
    }

    function restore() {
        for (const prop of Object.keys(temp)) {
            global[prop] = saved[prop];
        }
    }
}
