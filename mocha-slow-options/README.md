# mocha-slow-options

Adds better configurability to your favorite mocha reporter to control
which tests show up with times in red, yellow, or print no time at all.

## Usage
### Example
```
  mocha --slow 100 --reporter mocha-slow-options --reporter-options useReporter=spec,mediumPercent=75 
```
This runs mocha with the default slow value set to 100ms, uses the `spec`
reporter, and sets the additional config option `mediumPercent` to 0.75.
Now, tests that take less than 75ms (100ms * .75) will print no time, tests
that take between 75 and 100ms will print time in yellow, and tests over 100ms
will print time in red.

### Installation
```
npm install --save-dev mocha-slow-options
```

### Basic usage
Once you've installed mocha-slow-options, you use it with the `--reporter`
command line option:
```
mocha --reporter mocha-slow-options <other mocha options>
```

### Options
All options for mocha-slow-options are set on the command line using mocha's
`--reporter-options` flag. You can specify multiple options, separating them
with a comma. See above for an example and [check out mocha's Usage section
for more info](https://mochajs.org/#usage).

* `useReporter`: The name of a mocha built-in reporter to use. Default: `spec`
* `mediumPercent`: A percentage from 0 to 100, to be applied to each
test's slow value. Tests that run longer than
`mediumPercent / 100 * <slow value>` will be marked as speed=medium,
which typically prints in yellow. Default: 80.

## Why?
Mocha [gives you some feedback](https://mochajs.org/#test-duration)
on tests that are taking a long time to run. It marks each passing test with
a speed:

* `slow`: Reporters typically show the test duration in red.
* `medium`: Reporters typically show the test duration in yellow.
* `fast`: Reporters typically do not show the test duration.

The `slow` setting is configurable using the `--slow` command line option or
using `this.slow(value)` in your code. And the threshold between `medium` and
`fast` is computed like this:
```
mediumPercent / 100 * <slow value>
```
However, mocha's built-in reporters don't allow you to configure `mediumPercent`.
For all of them, it's hard-coded to 50.

mocha-slow-options adds the ability to adjust the `mediumPercent` value, while
still using mocha's built-in reporters.

## How?
mocha-slow-options inserts itself between mocha and your chosen `useReporter`,
listening on mocha's test "pass" event, in order to compute which tests are
classified as slow, medium, or fast.
