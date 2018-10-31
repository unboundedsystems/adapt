const mocha = require('mocha');

module.exports = BetterSlow;

// All defaults should be strings to align with options from the command line
const defaults = {
    mediumPercent: "80",
    useReporter: "spec",
};

/*
 * Locate an event listener by matching against the listener's source code (by
 * using Function.toString()) and replace that listener with a new one.
 */
function replaceListener(emitter, eventName, listenerMatchStr, newListener) {
    const listeners = emitter.listeners(eventName);

    const oldListenerIdx = listeners.findIndex(function (el) {
        const funcStr = el.toString().replace(/\s+/g, "");
        return funcStr.indexOf(listenerMatchStr) !== -1;
    });
    if (oldListenerIdx === -1) return false;

    listeners[oldListenerIdx] = newListener;

    // Now update the EventEmitter with our new set of listeners
    emitter.removeAllListeners(eventName);
    listeners.forEach(function (el) {
        emitter.on(eventName, el);
    });
    return true;
}

function BetterSlow(runner, inOptions) {
    const opts = Object.assign({}, defaults, inOptions.reporterOptions);

    const useReporter = mocha.reporters[opts.useReporter];
    if (!useReporter) {
        throw new Error("Invalid mocha reporter name '" + opts.useReporter + "'");
    }

    let mediumPercent = Number(opts.mediumPercent);
    if (isNaN(mediumPercent)) {
        throw new Error(
            "Invalid mediumPercent value '" + opts.mediumPercent + "'" +
            ": not a number");
    }
    if (mediumPercent < 0 || mediumPercent > 100) {
        throw new Error(
            "Invalid mediumPercent value '" + opts.mediumPercent + "'" +
            ": must be from 0-100");
    }
    mediumPercent = mediumPercent / 100;

    // Only need to set up prototype chain once.
    if (!(this instanceof useReporter)) {
        mocha.utils.inherits(BetterSlow, useReporter);
    }

    useReporter.call(this, runner);


    // The Base reporter 'pass' listener function has a hard-coded
    // test.slow()/2 in it. That's how we identify the correct listener.
    if (!replaceListener(runner, "pass", "test.slow()/2", onPass)) {
        throw new Error("Unable to find Base reporter 'pass' listener");
    }

    const stats = runner.stats;

    // Replacement pass listener allows mediumPercent configurability
    function onPass(test) {
        stats.passes = stats.passes || 0;
    
        if (test.duration > test.slow()) {
            test.speed = 'slow';
        } else if (test.duration > test.slow() * mediumPercent) {
            test.speed = 'medium';
        } else {
            test.speed = 'fast';
        }

        stats.passes++;
    };
}
