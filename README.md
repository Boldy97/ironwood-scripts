# What is this

An open-source collection of scripts to enhance Ironwood RPG.

Available on [Greasy Fork](https://greasyfork.org/en/scripts/475356-ironwood-rpg-pancake-scripts)

# How to contribute

* Fork this repository - [github docs](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
* Make a change to your fork
* Submit a pull request for your change - [github docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork)

# How to develop

These steps assume you are using the Tampermonkey extension with Chrome

* Create a new Tampermonkey script, with this content.
Replace the last require with the path to the actual plugin.js
```
// ==UserScript==
// @name         Ironwood RPG - Development
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://ironwoodrpg.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ironwoodrpg.com
// @grant        none
// @require      https://code.jquery.com/jquery-3.6.4.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js
// @require      file://C:\some\path\here\plugin.js
// ==/UserScript==
```
* You may need to enable local file access for Tampermonkey
  * Go to chrome://extensions
  * Navigate to Tampermonkey > details
  * Scroll down, and enable "Allow access to file URLs"
* run `npm run watch` in the packager folder
  * this will update the plugin.js in the root folder every time a change is made to the scripts
* You can now load the page, and the scripts should be there

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
The only available endpoints are the ones that are used mentioned in `libraries/request.js`.
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

* events are not taken into account

## Removed features

* tab title : Implemented in the base game
* guild badges : Planned to be implemented in the base game
* leaderboard badges : Planned to be implemented in the base game