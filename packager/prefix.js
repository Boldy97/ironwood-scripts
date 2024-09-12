// ==UserScript==
// @name         Ironwood RPG - Pancake-Scripts
// @namespace    http://tampermonkey.net/
// @version      4.13.1
// @description  A collection of scripts to enhance Ironwood RPG - https://github.com/Boldy97/ironwood-scripts
// @author       Pancake
// @match        https://ironwoodrpg.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ironwoodrpg.com
// @grant        none
// @require      https://code.jquery.com/jquery-3.6.4.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js
// ==/UserScript==

window.PANCAKE_ROOT = 'https://iwrpg.vectordungeon.com';
window.PANCAKE_VERSION = '4.13.1';
Object.defineProperty(Array.prototype, '_groupBy', {
    enumerable: false,
    value: function(selector) {
        return Object.values(this.reduce(function(rv, x) {
            (rv[selector(x)] = rv[selector(x)] || []).push(x);
            return rv;
        }, {}));
    }
});
Object.defineProperty(Array.prototype, '_distinct', {
    enumerable: false,
    value: function() {
        return [...new Set(this)];
    }
});
