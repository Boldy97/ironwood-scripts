# What is this

An open-source collection of scripts to enhance Ironwood RPG.

Available on [Greasy Fork](https://greasyfork.org/en/scripts/475356-ironwood-rpg-pancake-scripts)

# How to contribute

* Fork this repository - [github docs](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
* Make a change to your fork
* Submit a pull request for your change - [github docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork)

# FAQ

## What's this module registry ?

Every script is registered as a seperate module. A module has a name, a list of dependencies, and a body.

* Each module is a Javascript function
* The name is determined by the filename
* The dependencies are the function arguments
* The body is the function body, and is executed after the dependencies have been filled in

First all modules are registered, and then a call to `moduleRegistry.build()` is made. This checks for unmatched / circular dependencies and initialises every module.

## How do I quickly make a new script

The easiest way is to inject a new script into the webpage. Either through TamperMonkey (automatically) or the console (manually).
Below is an example script that creates two modules, of which one depends on the other, and prints something to the console on success.
As you will see, the register order is irrelevant.

```js
window.moduleRegistry.add('test2', function (test1) {
  console.log('test1 returned :', test1);
});
window.moduleRegistry.add('test1', function () {
  // the return value is injected in other modules as dependency
  return 'success!';
});
window.moduleRegistry.build();
```

## What backend calls are available?

Some scripts depend on calls to my backend, which is not open source.
The only available endpoints are the ones that are used in scripts.
If you feel like you need a new functionality, open an issue or find me on Discord (@pancake.lord)

## Planned features

* inventory saved filters
* virtual levels over 100
* add graphs for exp / level progression
* display estimated market values for items
* add account value visualizer
* chat
* action/fight simulator with chosen equipments

## Current issues

* events are not taking into account

## Removed features

* tab title : Implemented in the base game
* guild badges : Planned to be implemented in the base game
* leaderboard badges : Planned to be implemented in the base game
