# What is this

An open-source collection of scripts to enhance Ironwood RPG.

TODO : add a link to tampermonkey repository

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

When using TamperMonkey it's important to place it under the TamperMonkey script, and add the first line below. It waits for the initialisation of the base scripts.

```js
await window.PANCAKE_LOADED;

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
