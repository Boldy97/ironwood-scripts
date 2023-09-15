// ==UserScript==
// @name         Ironwood RPG - Pancake-Scripts
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  A collection of scripts to enhance Ironwood RPG - https://github.com/Boldy97/ironwood-scripts
// @author       Pancake
// @match        https://ironwoodrpg.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ironwoodrpg.com
// @grant        none
// @run-at       document-start
// @require      https://code.jquery.com/jquery-3.6.4.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js
// ==/UserScript==

window.PANCAKE_ROOT = 'https://iwrpg.vectordungeon.com';
window.PANCAKE_LOADED = new Promise((res,rej) => {
    window.PANCAKE_LOADED_RESOLVE = res;
});

const newScriptElement = document.createElement('script');
newScriptElement.src = `${window.PANCAKE_ROOT}/resources/script.js`;
newScriptElement.type = 'module';
document.head.append(newScriptElement);
