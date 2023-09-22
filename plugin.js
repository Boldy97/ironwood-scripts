// ==UserScript==
// @name         Ironwood RPG - Pancake-Scripts
// @namespace    http://tampermonkey.net/
// @version      2.9
// @description  A collection of scripts to enhance Ironwood RPG - https://github.com/Boldy97/ironwood-scripts
// @author       Pancake
// @match        https://ironwoodrpg.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ironwoodrpg.com
// @grant        none
// @run-at       document-body
// @require      https://code.jquery.com/jquery-3.6.4.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js
// ==/UserScript==

window.PANCAKE_ROOT = 'https://iwrpg.vectordungeon.com';
window.PANCAKE_VERSION = '2.9';
(() => {

    if(window.moduleRegistry) {
        return;
    }

    window.moduleRegistry = {
        add,
        get,
        build
    };

    const modules = {};

    function add(name, initialiser) {
        modules[name] = createModule(name, initialiser);
        buildModule(modules[name], true);
    }

    function get(name) {
        return modules[name] || null;
    }

    function build() {
        for(const module of Object.values(modules)) {
            buildModule(module);
        }
    }

    function createModule(name, initialiser) {
        const dependencies = extractParametersFromFunction(initialiser).map(dependency => {
            const name = dependency.replaceAll('_', '');
            const module = get(name);
            const optional = dependency.startsWith('_');
            return { name, module, optional };
        });
        const module = {
            name,
            initialiser,
            dependencies
        };
        for(const other of Object.values(modules)) {
            for(const dependency of other.dependencies) {
                if(dependency.name === name) {
                    dependency.module = module;
                }
            }
        }
        return module;
    }

    function buildModule(module, partial, chain) {
        if(module.built) {
            return true;
        }

        chain = chain || [];
        if(chain.includes(module.name)) {
            chain.push(module.name);
            throw `Circular dependency in chain : ${chain.join(' -> ')}`;
        }
        chain.push(module.name);

        for(const dependency of module.dependencies) {
            if(!dependency.module) {
                if(partial) {
                    return false;
                }
                if(dependency.optional) {
                    continue;
                }
                throw `Unresolved dependency : ${dependency.name}`;
            }
            const built = buildModule(dependency.module, partial, chain);
            if(!built) {
                return false;
            }
        }

        const parameters = module.dependencies.map(a => a.module?.reference);
        module.reference = module.initialiser.apply(null, parameters);
        module.built = true;

        chain.pop();
        return true;
    }

    function extractParametersFromFunction(fn) {
        const PARAMETER_NAMES = /([^\s,]+)/g;
        var fnStr = fn.toString();
        var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(PARAMETER_NAMES);
        return result || [];
    }

})();
// actionCache
window.moduleRegistry.add('actionCache', (auth, request, Promise) => {

    const authenticated = auth.ready;
    const isReady = new Promise.Deferred();

    const exports = {
        ready: isReady.promise,
        list: [],
        byId: null,
        byName: null
    };

    async function initialise() {
        await authenticated;
        const actions = await request.listActions();
        exports.byId = {};
        exports.byName = {};
        for(const action of actions) {
            exports.list.push(action);
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
        isReady.resolve();
    }

    initialise();

    return exports;

}
);
// auth
window.moduleRegistry.add('auth', (Promise) => {

    const authenticated = new Promise.Deferred();
    let TOKEN = null;

    const exports = {
        ready: authenticated.promise,
        isReady: false,
        register,
        getHeaders
    };

    function register(name, password) {
        TOKEN = 'Basic ' + btoa(name + ':' + password);
        authenticated.resolve();
        exports.isReady = true;
        $('#authenticatedMarker').remove();
    }

    function getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': TOKEN
        };
    }

    return exports;

}
);
// colorMapper
window.moduleRegistry.add('colorMapper', () => {

    const colorMappings = {
        // https://colorswall.com/palette/3
        primary: '#0275d8',
        success: '#5cb85c',
        info: '#5bc0de',
        warning: '#f0ad4e',
        danger: '#d9534f',
        inverse: '#292b2c',
        // component styling
        componentLight: '#393532',
        componentRegular: '#28211b',
        componentDark: '#211a12'
    };

    function mapColor(color) {
        return colorMappings[color] || color;
    }

    return mapColor;

}
);
// components
window.moduleRegistry.add('components', (elementWatcher, colorMapper, elementCreator) => {

    const exports = {
        addComponent,
        removeComponent,
        search
    }

    const $ = window.$;
    const rowTypeMappings = {
        item: createRow_Item,
        input: createRow_Input,
        break: createRow_Break,
        buttons: createRow_Button,
        dropdown: createRow_Select,
        header: createRow_Header,
        checkbox: createRow_Checkbox,
        segment: createRow_Segment,
        progress: createRow_Progress,
        chart: createRow_Chart,
        list: createRow_List
    };

    function initialise() {
        elementCreator.addStyles(styles);
    }

    function removeComponent(blueprint) {
        $(`#${blueprint.componentId}`).remove();
    }

    async function addComponent(blueprint) {
        if($(blueprint.dependsOn).length) {
            actualAddComponent(blueprint);
            return;
        }
        await elementWatcher.exists(blueprint.dependsOn);
        actualAddComponent(blueprint);
    }

    function actualAddComponent(blueprint) {
        $(`#${blueprint.componentId}`).remove();
        const component =
            $('<div/>')
                .addClass('customComponent')
                .attr('id', blueprint.componentId);
        if(blueprint.onClick) {
            component
                .click(blueprint.onClick)
                .css('cursor', 'pointer');
        }

        // TABS
        const theTabs = createTab(blueprint);
        component.append(theTabs);

        // PAGE
        const selectedTabBlueprint = blueprint.tabs[blueprint.selectedTabIndex] || blueprint.tabs[0];
        selectedTabBlueprint.rows.forEach((rowBlueprint, index) => {
            component.append(createRow(rowBlueprint));
        });

        if(blueprint.prepend) {
            $(`${blueprint.parent}`).prepend(component);
        } else {
            $(`${blueprint.parent}`).append(component);
        }
    }

    function createTab(blueprint) {
        if(!blueprint.selectedTabIndex) {
            blueprint.selectedTabIndex = 0;
        }
        if(blueprint.tabs.length === 1) {
            return;
        }
        const tabContainer = $('<div/>').addClass('tabs');
        blueprint.tabs.forEach((element, index) => {
            if(element.hidden) {
                return;
            }
            const tab = $('<button/>')
                .attr('type', 'button')
                .addClass('tabButton')
                .text(element.title)
                .click(changeTab.bind(null, blueprint, index));
            if(blueprint.selectedTabIndex !== index) {
                tab.addClass('tabButtonInactive')
            }
            if(index !== 0) {
                tab.addClass('lineLeft')
            }
            tabContainer.append(tab);
        });
        return tabContainer;
    }

    function createRow(rowBlueprint) {
        if(!rowTypeMappings[rowBlueprint.type]) {
            console.warn(`Skipping unknown row type in blueprint: ${rowBlueprint.type}`, rowBlueprint);
            return;
        }
        if(rowBlueprint.hidden) {
            return;
        }
        return rowTypeMappings[rowBlueprint.type](rowBlueprint);
    }

    function createRow_Item(itemBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        if(itemBlueprint.image) {
            parentRow.append(createImage(itemBlueprint));
        }
        if(itemBlueprint?.name) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemName name')
                        .text(itemBlueprint.name)
                );
        }
        parentRow // always added because it spreads pushes name left and value right !
            .append(
                $('<div/>')
                    .addClass('myItemValue')
                    .text(itemBlueprint?.extra || '')
            );
        if(itemBlueprint?.value) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemWorth')
                        .text(itemBlueprint.value)
                )
        }
        return parentRow;
    }

    function createRow_Input(inputBlueprint) {
        const parentRow = $('<div/>').addClass('customRow myItemInputRowAdjustment');
        if(inputBlueprint.text) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemInputText')
                        .addClass(inputBlueprint.class || '')
                        .text(inputBlueprint.text)
                        .css('flex', `${inputBlueprint.layout?.split('/')[0] || 1}`)
                )
        }
        parentRow
            .append(
                $('<input/>')
                    .attr('id', inputBlueprint.id)
                    .addClass('myItemInput')
                    .addClass(inputBlueprint.class || '')
                    .attr('type', inputBlueprint.inputType || 'text')
                    .attr('placeholder', inputBlueprint.name)
                    .attr('value', inputBlueprint.value || '')
                    .css('flex', `${inputBlueprint.layout?.split('/')[1] || 1}`)
                    .keyup(inputDelay(function(e) {
                        inputBlueprint.value = e.target.value;
                        inputBlueprint.action(inputBlueprint.value);
                    }, inputBlueprint.delay || 0))
            )
        return parentRow;
    }

    function createRow_Break(breakBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        parentRow.append('<br/>');
        return parentRow;
    }

    function createRow_Button(buttonBlueprint) {
        const parentRow = $('<div/>').addClass('customRow myItemInputRowAdjustment');
        for(const button of buttonBlueprint.buttons) {
            parentRow
                .append(
                    $(`<button class='myButton'>${button.text}</button>`)
                        .css('background-color', button.disabled ? '#ffffff0a' : colorMapper(button.color || 'primary'))
                        .css('flex', `${button.size || 1} 1 0`)
                        .prop('disabled', !!button.disabled)
                        .addClass(button.class || '')
                        .click(button.action)
                );
        }
        return parentRow;
    }

    function createRow_Select(selectBlueprint) {
        const parentRow = $('<div/>').addClass('customRow myItemInputRowAdjustment');
        const select = $('<select/>')
            .addClass('myItemSelect')
            .addClass(selectBlueprint.class || '')
            .change(inputDelay(function(e) {
                for(const option of selectBlueprint.options) {
                    option.selected = this.value === option.value;
                }
                selectBlueprint.action(this.value);
            }, selectBlueprint.delay || 0));
        for(const option of selectBlueprint.options) {
            select.append(`<option value='${option.value}' ${option.selected ? 'selected' : ''}>${option.text}</option>`);
        }
        parentRow.append(select);
        return parentRow;
    }

    function createRow_Header(headerBlueprint) {
        const parentRow =
            $('<div/>')
                .addClass('myHeader lineTop')
        if(headerBlueprint.image) {
            parentRow.append(createImage(headerBlueprint));
        }
        parentRow.append(
            $('<div/>')
                .addClass('myName')
                .text(headerBlueprint.title)
        )
        if(headerBlueprint.action) {
            parentRow
                .append(
                    $('<button/>')
                        .addClass('myHeaderAction')
                        .text(headerBlueprint.name)
                        .attr('type', 'button')
                        .css('background-color', colorMapper(headerBlueprint.color || 'success'))
                        .click(headerBlueprint.action)
                )
        } else if(headerBlueprint.textRight) {
            parentRow.append(
                $('<div/>')
                    .addClass('level')
                    .text(headerBlueprint.title)
                    .css('margin-left', 'auto')
                    .html(headerBlueprint.textRight)
            )
        }
        if(headerBlueprint.centered) {
            parentRow.css('justify-content', 'center');
        }
        return parentRow;
    }

    function createRow_Checkbox(checkboxBlueprint) {
        const checked_false = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 24 24' stroke-width='1.5' stroke='currentColor' fill='none' stroke-linecap='round' stroke-linejoin='round' class='customCheckBoxDisabled ng-star-inserted'><path stroke='none' d='M0 0h24v24H0z' fill='none'></path><rect x='4' y='4' width='16' height='16' rx='2'></rect></svg>`;
        const checked_true = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 24 24' stroke-width='1.5' stroke='currentColor' fill='none' stroke-linecap='round' stroke-linejoin='round' class='customCheckBoxEnabled ng-star-inserted'><path stroke='none' d='M0 0h24v24H0z' fill='none'></path><rect x='4' y='4' width='16' height='16' rx='2'></rect><path d='M9 12l2 2l4 -4'></path></svg>`;

        const buttonInnerHTML = checkboxBlueprint.checked ? checked_true : checked_false;

        const parentRow = $('<div/>').addClass('customRow')
            .append(
                $('<div/>')
                    .addClass('customCheckBoxText')
                    .text(checkboxBlueprint?.text || '')
            )
            .append(
                $('<div/>')
                    .addClass('customCheckboxCheckbox')
                    .append(
                        $(`<button>${buttonInnerHTML}</button>`)
                            .html(buttonInnerHTML)
                            .click(() => {
                                checkboxBlueprint.checked = !checkboxBlueprint.checked;
                                checkboxBlueprint.action(checkboxBlueprint.checked);
                            })
                    )

            );

        return parentRow;
    }

    function createRow_Segment(segmentBlueprint) {
        if(segmentBlueprint.hidden) {
            return;
        }
        return segmentBlueprint.rows.flatMap(createRow);
    }

    function createRow_Progress(progressBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        const up = progressBlueprint.numerator;
        const down = progressBlueprint.denominator;
        parentRow.append(
            $('<div/>')
                .addClass('myBar')
                .append(
                    $('<div/>')
                        .css('height', '100%')
                        .css('width', progressBlueprint.progressPercent + '%')
                        .css('background-color', colorMapper(progressBlueprint.color || 'rgb(122, 118, 118)'))
                )
        );
        parentRow.append(
            $('<div/>')
                .addClass('myPercent')
                .text(progressBlueprint.progressPercent + '%')
        )
        parentRow.append(
            $('<div/>')
                .css('margin-left', 'auto')
                .text(progressBlueprint.progressText)
        )
        return parentRow;
    }

    function createRow_Chart(chartBlueprint) {
        const parentRow = $('<div/>')
        .addClass('lineTop')
            .append(
                $('<canvas/>')
                    .attr('id', chartBlueprint.chartId)
            );
        return parentRow;
    }

    function createRow_List(listBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        parentRow // always added because it spreads pushes name left and value right !
            .append(
                $('<ul/>')
                    .addClass('myListDescription')
                    .append(...listBlueprint.entries.map(entry =>
                        $('<li/>')
                            .addClass('myListLine')
                            .text(entry)
                    ))
            );
        return parentRow;
    }
    
    function createImage(blueprint) {
        return $('<div/>')
            .addClass('myItemImage image')
            .append(
                $('<img/>')
                    .attr('src', `${blueprint.image}`)
                    .css('filter', `${blueprint.imageFilter}`)
                    .css('image-rendering', blueprint.imagePixelated ? 'pixelated' : 'auto')
            )
    }

    function changeTab(blueprint, index) {
        blueprint.selectedTabIndex = index;
        addComponent(blueprint);
    }

    function inputDelay(callback, ms) {
        var timer = 0;
        return function() {
            var context = this, args = arguments;
            window.clearTimeout(timer);
            timer = window.setTimeout(function() {
                callback.apply(context, args);
            }, ms || 0);
        };
    }

    function search(blueprint, query) {
        if(!blueprint.idMappings) {
            generateIdMappings(blueprint);
        }
        if(!blueprint.idMappings[query]) {
            throw `Could not find id ${query} in blueprint ${blueprint.componentId}`;
        }
        return blueprint.idMappings[query];
    }

    function generateIdMappings(blueprint) {
        blueprint.idMappings = {};
        for(const tab of blueprint.tabs) {
            addIdMapping(blueprint, tab);
            for(const row of tab.rows) {
                addIdMapping(blueprint, row);
            }
        }
    }

    function addIdMapping(blueprint, element) {
        if(element.id) {
            if(blueprint.idMappings[element.id]) {
                throw `Detected duplicate id ${element.id} in blueprint ${blueprint.componentId}`;
            }
            blueprint.idMappings[element.id] = element;
        }
        let subelements = null;
        if(element.type === 'segment') {
            subelements = element.rows;
        }
        if(element.type === 'buttons') {
            subelements = element.buttons;
        }
        if(subelements) {
            for(const subelement of subelements) {
                addIdMapping(blueprint, subelement);
            }
        }
    }

    const styles = `
        :root {
            --background-color: ${colorMapper('componentRegular')};
            --border-color: ${colorMapper('componentLight')};
            --darker-color: ${colorMapper('componentDark')};
        }
        .customComponent {
            margin-top: var(--gap);
            background-color: var(--background-color);
            box-shadow: 0 6px 12px -6px #0006;
            border-radius: 4px;
            width: 100%;
        }
        .myHeader {
            display: flex;
            align-items: center;
            padding: 12px var(--gap);
            gap: var(--gap);
        }
        .myName {
            font-weight: 600;
            letter-spacing: .25px;
        }
        .myHeaderAction{
            margin: 0px 0px 0px auto;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 0px 5px;
        }
        .customRow {
            display: flex;
            justify-content: center;
            align-items: center;
            border-top: 1px solid var(--border-color);
            padding: 5px 12px 5px 6px;
            min-height: 0px;
            min-width: 0px;
            gap: var(--margin);
        }
        .myItemImage {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 24px;
            width: 24px;
            min-height: 0px;
            min-width: 0px;
        }
        .myItemImage > img {
            max-width: 100%;
            max-height: 100%;
            width: 100%;
            height: 100%;
        }
        .myItemValue {
            display: flex;
            align-items: center;
            flex: 1;
            color: #aaa;
        }
        .myItemInputText {
            height: 40px;
            width: 100%;
            display: flex;
            align-items: center;
            padding: 12px var(--gap);
        }
        .myItemInput {
            height: 40px;
            width: 100%;
            background-color: #ffffff0a;
            padding: 0 12px;
            text-align: center;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        }
        .myItemInputRowAdjustment {
            padding-right: 6px !important;
        }
        .myItemSelect {
            height: 40px;
            width: 100%;
            background-color: #ffffff0a;
            padding: 0 12px;
            text-align: center;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        }
        .myItemSelect > option {
            background-color: var(--darker-color);
        }
        .myButton {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            height: 40px;
            font-weight: 600;
            letter-spacing: .25px;
        }
        .myButton[disabled] {
            pointer-events: none;
        }
        .sort {
           padding: 12px var(--gap);
           border-top: 1px solid var(--border-color);
           display: flex;
           align-items: center;
           justify-content: space-between;
        }
        .sortButtonContainer {
            display: flex;
            align-items: center;
            border-radius: 4px;
            box-shadow: 0 1px 2px #0003;
            border: 1px solid var(--border-color);
            overflow: hidden;
        }
        .sortButton {
           display: flex;
           border: none;
           background: transparent;
           font-family: inherit;
           font-size: inherit;
           line-height: 1.5;
           font-weight: inherit;
           color: inherit;
           resize: none;
           text-transform: inherit;
           letter-spacing: inherit;
           cursor: pointer;
           padding: 4px var(--gap);
           flex: 1;
           text-align: center;
           justify-content: center;
           background-color: var(--darker-color);
        }
        .tabs {
           display: flex;
           align-items: center;
           overflow: hidden;
           border-radius: inherit;
        }
        .tabButton {
            border: none;
            border-radius: 0px !important;
            background: transparent;
            font-family: inherit;
            font-size: inherit;
            line-height: 1.5;
            color: inherit;
            resize: none;
            text-transform: inherit;
            cursor: pointer;
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 48px;
            font-weight: 600;
            letter-spacing: .25px;
            padding: 0 var(--gap);
            border-radius: 4px 0 0;
        }
        .tabButtonInactive{
            background-color: var(--darker-color);
        }
        .lineRight {
            border-right: 1px solid var(--border-color);
        }
        .lineLeft {
            border-left: 1px solid var(--border-color);
        }
        .lineTop {
            border-top: 1px solid var(--border-color);
        }
        .customCheckBoxText {
            flex: 1;
            color: #aaa
        }
        .customCheckboxCheckbox {
            display: flex;
            justify-content: flex-end;
            min-width: 32px;
            margin-left: var(--margin);
        }
        .customCheckBoxEnabled {
            color: #53bd73
        }
        .customCheckBoxDisabled {
            color: #aaa
        }
        .myBar {
            height: 12px;
            flex: 1;
            background-color: #ffffff0a;
            overflow: hidden;
            max-width: 50%;
            border-radius: 999px;
        }
        .myPercent {
            margin-left: var(--margin);
            margin-right: var(--margin);
            color: #aaa;
        }
        .myListDescription {
            list-style: disc;
            width: 100%;
        }
        .myListLine {
            margin-left: 20px;
        }
    `;

    initialise();

    return exports;
}
);
// configuration
window.moduleRegistry.add('configuration', (auth, request, Promise) => {

    const loaded = new Promise.Deferred();

    const exports = {
        ready: loaded.promise,
        registerCheckbox,
        registerInput,
        registerDropdown,
        registerJson,
        items: []
    };

    async function initialise() {
        await load();
    }

    const CHECKBOX_KEYS = ['category', 'key', 'name', 'default', 'handler'];
    function registerCheckbox(item) {
        validate(item, CHECKBOX_KEYS);
        return register(Object.assign(item, {
            type: 'checkbox'
        }));
    }

    const INPUT_KEYS = ['category', 'key', 'name', 'default', 'inputType', 'handler'];
    function registerInput(item) {
        validate(item, INPUT_KEYS);
        return register(Object.assign(item, {
            type: 'input'
        }));
    }

    const DROPDOWN_KEYS = ['category', 'key', 'name', 'options', 'default', 'handler'];
    function registerDropdown(item) {
        validate(item, DROPDOWN_KEYS);
        return register(Object.assign(item, {
            type: 'dropdown'
        }));
    }

    const JSON_KEYS = ['key', 'default', 'handler'];
    function registerJson(item) {
        validate(item, JSON_KEYS);
        return register(Object.assign(item, {
            type: 'json'
        }));
    }

    function register(item) {
        const handler = item.handler;
        item.handler = (value, isInitial) => {
            item.value = value;
            handler(value, item.key, isInitial);
            if(!isInitial) {
                save(item, value);
            }
        }
        exports.items.push(item);
        return item;
    }

    async function load() {
        const configs = await request.getConfigurations();
        for(const item of exports.items) {
            let value;
            if(configs[item.key]) {
                value = JSON.parse(configs[item.key]);
            } else {
                value = item.default;
            }
            item.handler(value, true);
        }
        loaded.resolve();
    }

    async function save(item, value) {
        if(item.type === 'toggle') {
            value = !!value;
        }
        if(item.type === 'input' || item.type === 'json') {
            value = JSON.stringify(value);
        }
        await request.saveConfiguration(item.key, value);
    }

    function validate(item, keys) {
        for(const key of keys) {
            if(!(key in item)) {
                throw `Missing ${key} while registering a configuration item`;
            }
        }
    }

    initialise();

    return exports;

}
);
// elementCreator
window.moduleRegistry.add('elementCreator', () => {

    const exports = {
        addStyles
    };

    function addStyles(css) {
        const head = document.getElementsByTagName('head')[0]
        if(!head) {
            console.error('Could not add styles, missing head');
            return;
        }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        head.appendChild(style);
    }

    return exports;

}
);
// elementWatcher
window.moduleRegistry.add('elementWatcher', (Promise) => {

    const exports = {
        exists,
        childAdded,
        childAddedContinuous
    }

    const $ = window.$;

    async function exists(selector) {
        const promiseWrapper = new Promise.Checking(() => {
            return $(selector)[0];
        }, 10, 5000);
        return promiseWrapper.promise;
    }

    async function childAdded(selector) {
        const promiseWrapper = new Promise.Expiring(5000);

        try {
            const parent = await exists(selector);
            const observer = new MutationObserver(function(mutations, observer) {
                for(const mutation of mutations) {
                    if(mutation.addedNodes?.length) {
                        observer.disconnect();
                        promiseWrapper.resolve();
                    }
                }
            });
            observer.observe(parent, { childList: true });
        } catch(error) {
            promiseWrapper.reject(error);
        }

        return promiseWrapper.promise;
    }

    async function childAddedContinuous(selector, callback) {
        const parent = await exists(selector);
        const observer = new MutationObserver(function(mutations, observer) {
            for(const mutation of mutations) {
                if(mutation.addedNodes?.length) {
                    callback();
                }
            }
        });
        observer.observe(parent, { childList: true });
    }

    return exports;

}
);
// estimationCache
window.moduleRegistry.add('estimationCache', (events, request, configuration, itemCache, userCache, util) => {

    const registerPageHandler = events.register.bind(null, 'page');
    const registerXhrHandler = events.register.bind(null, 'xhr');
    const registerUserCacheHandler = events.register.bind(null, 'userCache');
    const getLastPage = events.getLast.bind(null, 'page');
    const getLastEstimation = events.getLast.bind(null, 'estimation');
    const emitEvent = events.emit.bind(null, 'estimation');

    let enabled = false;
    let cache = {};

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'estimations',
            name: 'Estimations',
            default: true,
            handler: handleConfigStateChange
        });

        registerPageHandler(handlePage);
        registerXhrHandler(handleXhr);
        registerUserCacheHandler(handleUserCache);
    }

    function handleConfigStateChange(state) {
        const previous = enabled;
        enabled = state;
        if(!enabled) {
            emitEvent(null);
        }
        if(enabled && !previous) {
            handlePage(getLastPage());
        }
    }

    async function handlePage(page) {
        emitEvent(null);
        let result = null;
        if(!enabled || !page) {
            result = null;
        } else if(page.type === 'action') {
            const cacheKey = `action-${page.skill}-${page.action}`;
            const fetcher = getAction.bind(null, page.skill, page.action);
            result = await getEstimationData(cacheKey, fetcher);
        } else if(page.type === 'automation') {
            const cacheKey = `automation-${page.action}`;
            const fetcher = getAutomation.bind(null, page.action);
            result = await getEstimationData(cacheKey, fetcher);
        }
        // it could have changed by now
        if(enabled && page === getLastPage()) {
            emitEvent(result);
        }
    }

    function handleXhr(xhr) {
        if(xhr.url.endsWith('/time')) {
            return;
        }
        cache = {};
        emitEvent(null);
        handlePage(getLastPage());
    }

    async function handleUserCache() {
        await updateAll();
        emitEvent(getLastEstimation());
    }

    async function getEstimationData(cacheKey, fetcher) {
        const estimation = cache[cacheKey] || await fetcher();
        cache[cacheKey] = estimation;
        return estimation;
    }

    async function getAction(skill, action) {
        const result = await request.getActionEstimation(skill, action);
        result.actionId = action;
        return convertEstimation(result);
    }

    async function getAutomation(action) {
        const result = await request.getAutomationEstimation(action);
        result.actionId = action;
        return convertEstimation(result);
    }

    async function convertEstimation(estimation) {
        await itemCache.ready;
        const loot = estimation.loot;
        const materials = estimation.materials;
        const equipments = estimation.equipments;
        estimation.loot = [];
        for(const entry of Object.entries(loot)) {
            estimation.loot.push({
                item: itemCache.byId[entry[0]],
                amount: entry[1],
                gold: entry[1] * (itemCache.byId[entry[0]].attributes.SELL_PRICE || 0)
            });
        }
        estimation.materials = [];
        for(const entry of Object.entries(materials)) {
            estimation.materials.push({
                item: itemCache.byId[entry[0]],
                amount: entry[1],
                stored: 0,
                secondsLeft: 0,
                gold: entry[1] * (itemCache.byId[entry[0]].attributes.SELL_PRICE || 0)
            });
        }
        estimation.equipments = [];
        for(const entry of Object.entries(equipments)) {
            estimation.equipments.push({
                item: itemCache.byId[entry[0]],
                amount: entry[1],
                stored: 0,
                secondsLeft: 0,
                gold: entry[1] * (itemCache.byId[entry[0]].attributes.SELL_PRICE || 0)
            });
        }
        estimation.goldLoot = estimation.loot.map(a => a.gold).reduce((a,v) => a+v, 0);
        estimation.goldMaterials = estimation.materials.map(a => a.gold).reduce((a,v) => a+v, 0);
        estimation.goldEquipments = estimation.equipments.map(a => a.gold).reduce((a,v) => a+v, 0);
        estimation.goldTotal = estimation.goldLoot - estimation.goldMaterials - estimation.goldEquipments;
        await updateOne(estimation);
        return estimation;
    }

    async function updateAll() {
        if(!enabled) {
            return;
        }
        for(const estimation of Object.values(cache)) {
            await updateOne(estimation);
        }
    }

    async function updateOne(estimation) {
        await userCache.ready;
        for(const material of estimation.materials) {
            material.stored = userCache.inventory[material.item.id] || 0;
            material.secondsLeft = material.stored / material.amount * 3600;
        }
        for(const equipment of estimation.equipments) {
            equipment.stored = userCache.equipment[equipment.item.id] || 0;
            equipment.secondsLeft = equipment.stored / equipment.amount * 3600;
        }
        if(estimation.type === 'AUTOMATION' && userCache.automations[estimation.actionId]) {
            estimation.amountSecondsLeft = estimation.actionSpeed * (userCache.automations[estimation.actionId].maxAmount - userCache.automations[estimation.actionId].amount);
        } else if(estimation.maxAmount) {
            estimation.amountSecondsLeft = estimation.actionSpeed * (estimation.maxAmount - userCache.action.amount);
        } else {
            estimation.amountSecondsLeft = Number.MAX_VALUE;
        }
        if(estimation.type === 'AUTOMATION' && estimation.amountSecondsLeft !== Number.MAX_VALUE) {
            estimation.secondsLeft = estimation.amountSecondsLeft;
        } else {
            estimation.secondsLeft = Math.min(
                estimation.amountSecondsLeft,
                ...estimation.materials.map(a => a.secondsLeft),
                ...estimation.equipments.map(a => a.secondsLeft)
            );
        }
        const currentExp = userCache.exp[estimation.skill];
        estimation.secondsToNextlevel = util.expToNextLevel(currentExp) / estimation.exp * 3600;
        estimation.secondsToNextTier = util.expToNextTier(currentExp) / estimation.exp * 3600;
    }

    initialise();

}
);
// events
window.moduleRegistry.add('events', () => {

    const exports = {
        register,
        emit,
        getLast
    };

    const handlers = {};
    const lastCache = {};

    function register(name, handler) {
        if(!handlers[name]) {
            handlers[name] = [];
        }
        handlers[name].push(handler);
        if(lastCache[name]) {
            handle(handler, lastCache[name]);
        }
    }

    // options = { skipCache }
    function emit(name, data, options) {
        if(!options?.skipCache) {
            lastCache[name] = data;
        }
        if(!handlers[name]) {
            return;
        }
        for(const handler of handlers[name]) {
            handle(handler, data);
        }
    }

    function handle(handler, data) {
        try {
            handler(data);
        } catch(e) {
            console.error('Something went wrong', e);
        }
    }

    function getLast(name) {
        return lastCache[name];
    }

    return exports;

}
);
// interceptor
window.moduleRegistry.add('interceptor', (events) => {

    function initialise() {
        registerInterceptorXhr();
        registerInterceptorUrlChange();
        events.emit('url', window.location.href);
    }

    function registerInterceptorXhr() {
        const XHR = XMLHttpRequest.prototype;
        const open = XHR.open;
        const send = XHR.send;
        const setRequestHeader = XHR.setRequestHeader;

        XHR.open = function() {
            this._requestHeaders = {};
            return open.apply(this, arguments);
        }
        XHR.setRequestHeader = function(header, value) {
            this._requestHeaders[header] = value;
            return setRequestHeader.apply(this, arguments);
        }
        XHR.send = function() {
            let requestBody = undefined;
            try {
                requestBody = JSON.parse(arguments[0]);
            } catch(e) {}
            this.addEventListener('load', function() {
                const status = this.status
                const url = this.responseURL;
                if(!url.includes('ironwoodrpg.com')) {
                    return;
                }
                console.debug(`intercepted ${url}`);
                const responseHeaders = this.getAllResponseHeaders();
                if(this.responseType === 'blob') {
                    return;
                }
                const responseBody = extractResponseFromXMLHttpRequest(this);
                events.emit('xhr', {
                    url,
                    status,
                    request: requestBody,
                    response: responseBody
                }, { skipCache:true });
            })

            return send.apply(this, arguments);
        }
    }

    function extractResponseFromXMLHttpRequest(xhr) {
        if(xhr.responseType === 'blob') {
            return null;
        }
        let responseBody;
        if(xhr.responseType === '' || xhr.responseType === 'text') {
            try {
                return JSON.parse(xhr.responseText);
            } catch (err) {
                console.debug('Error reading or processing response.', err);
            }
        }
        return xhr.response;
    }

    function registerInterceptorUrlChange() {
        const pushState = history.pushState;
        history.pushState = function() {
            pushState.apply(history, arguments);
            console.debug(`Detected page ${arguments[2]}`);
            events.emit('url', arguments[2]);
        };
        const replaceState = history.replaceState;
        history.replaceState = function() {
            replaceState.apply(history, arguments);
            console.debug(`Detected page ${arguments[2]}`);
            events.emit('url', arguments[2]);
        }
    }

    initialise();

}
);
// itemCache
window.moduleRegistry.add('itemCache', (auth, request, Promise) => {

    const authenticated = auth.ready;
    const isReady = new Promise.Deferred();

    const exports = {
        ready: isReady.promise,
        list: [],
        byId: null,
        byName: null,
        byImage: null,
        attributes: null
    };

    async function initialise() {
        await authenticated;
        const enrichedItems = await request.listItems();
        exports.byId = {};
        exports.byName = {};
        exports.byImage = {};
        for(const enrichedItem of enrichedItems) {
            const item = Object.assign(enrichedItem.item, enrichedItem);
            delete item.item;
            exports.list.push(item);
            exports.byId[item.id] = item;
            exports.byName[item.name] = item;
            const lastPart = item.image.split('/').at(-1);
            if(exports.byImage[lastPart]) {
                exports.byImage[lastPart].duplicate = true;
            } else {
                exports.byImage[lastPart] = item;
            }
            if(!item.attributes) {
                item.attributes = {};
            }
            if(item.charcoal) {
                item.attributes.CHARCOAL = item.charcoal;
            }
            if(item.compost) {
                item.attributes.COMPOST = item.compost;
            }
            if(item.speed) {
                item.attributes.SPEED = item.speed;
            }
        }
        for(const image of Object.keys(exports.byImage)) {
            if(exports.byImage[image].duplicate) {
                exports.byImage[image];
            }
        }
        exports.attributes = await request.listItemAttributes();
        exports.attributes.push({
            technicalName: 'CHARCOAL',
            name: 'Charcoal',
            image: '/assets/items/charcoal.png'
        },{
            technicalName: 'COMPOST',
            name: 'Compost',
            image: '/assets/misc/compost.png'
        });
        isReady.resolve();
    }

    initialise();

    return exports;

}
);
// pageDetector
window.moduleRegistry.add('pageDetector', (events) => {

    const registerUrlHandler = events.register.bind(null, 'url');
    const emitEvent = events.emit.bind(null, 'page');

    async function initialise() {
        registerUrlHandler(handleUrl);
    }

    function handleUrl(url) {
        let result = null;
        const parts = url.split('/');
        if(url.includes('/skill/') && url.includes('/action/')) {
            result = {
                type: 'action',
                skill: +parts[parts.length-3],
                action: +parts[parts.length-1]
            };
        } else if(url.includes('house/produce')) {
            result = {
                type: 'automation',
                building: +parts[parts.length-2],
                action: +parts[parts.length-1]
            };
        } else if(url.includes('house/build')) {
            result = {
                type: 'structure',
                building: +parts[parts.length-1]
            };
        } else {
            result = {
                type: parts.pop()
            };
        }
        emitEvent(result);
    }

    initialise();

}
);
// pages
window.moduleRegistry.add('pages', (elementWatcher, events, colorMapper, util, skillCache, elementCreator) => {

    const registerPageHandler = events.register.bind(null, 'page');
    const getLastPage = events.getLast.bind(null, 'page');

    const exports = {
        register,
        requestRender,
        show,
        hide
    }

    const pages = [];

    function initialise() {
        registerPageHandler(handlePage);
        elementCreator.addStyles(styles);
    }

    function handlePage(page) {
        // handle navigating away
        if(!pages.some(p => p.path === page.type)) {
            $('custom-page').remove();
            $('nav-component > div.nav > div.scroll > button')
                .removeClass('customActiveLink');
            $('header-component div.wrapper > div.image > img')
                .css('image-rendering', '');
            headerPageNameChangeBugFix(page);
        }
    }

    async function register(page) {
        if(pages.some(p => p.name === page.name)) {
            console.error(`Custom page already registered : ${page.name}`);
            return;
        }
        page.path = page.name.toLowerCase().replaceAll(' ', '-');
        page.class = `customMenuButton_${page.path}`;
        page.image = page.image || 'https://ironwoodrpg.com/assets/misc/settings.png';
        page.category = page.category?.toUpperCase() || 'MISC';
        page.columns = page.columns || 1;
        pages.push(page);
        console.debug('Registered pages', pages);
        await setupNavigation(page);
    }

    function show(name) {
        const page = pages.find(p => p.name === name)
        if(!page) {
            console.error(`Could not find page : ${name}`);
            return;
        }
        $(`.${page.class}`).show();
    }

    function hide(name) {
        const page = pages.find(p => p.name === name)
        if(!page) {
            console.error(`Could not find page : ${name}`);
            return;
        }
        $(`.${page.class}`).hide();
    }

    function requestRender(name) {
        const page = pages.find(p => p.name === name)
        if(!page) {
            console.error(`Could not find page : ${name}`);
            return;
        }
        if(getLastPage()?.type === page.path) {
            render(page);
        }
    }

    function render(page) {
        $('.customComponent').remove();
        page.render();
    }

    async function setupNavigation(page) {
        await elementWatcher.exists('div.nav > div.scroll');
        // MENU HEADER / CATEGORY
        let menuHeader = $(`nav-component > div.nav > div.scroll > div.header:contains('${page.category}'), div.customMenuHeader:contains('${page.category}')`);
        if(!menuHeader.length) {
            menuHeader = createMenuHeader(page.category);
        }
        // MENU BUTTON / PAGE LINK
        const menuButton = createMenuButton(page)
        // POSITIONING
        if(page.after) {
            $(`nav-component button:contains('${page.after}')`).after(menuButton);
        } else {
            menuHeader.after(menuButton);
        }
    }

    function createMenuHeader(text) {
        const menuHeader =
            $('<div/>')
                .addClass('header customMenuHeader')
                .append(
                    $('<div/>')
                        .addClass('customMenuHeaderText')
                        .text(text)
                );
        $('nav-component > div.nav > div.scroll')
            .prepend(menuHeader);
        return menuHeader;
    }

    function createMenuButton(page) {
        const menuButton =
            $('<button/>')
                .attr('type', 'button')
                .addClass(`customMenuButton ${page.class}`)
                .css('display', 'none')
                .click(() => visitPage(page))
                .append(
                    $('<img/>')
                        .addClass('customMenuButtonImage')
                        .attr('src', page.image)
                        .css('image-rendering', page.imagePixelated ? 'pixelated' : 'auto')
                )
                .append(
                    $('<div/>')
                        .addClass('customMenuButtonText')
                        .text(page.name)
                );
        return menuButton;
    }

    async function visitPage(page) {
        if($('custom-page').length) {
            $('custom-page').remove();
        } else {
            await setupEmptyPage();
        }
        createPage(page.columns);
        updatePageHeader(page);
        updateActivePageInNav(page.name);
        history.pushState({}, '', page.path);
        page.render();
    }

    async function setupEmptyPage() {
        util.goToPage('settings');
        await elementWatcher.exists('settings-page');
        $('settings-page').remove();
    }

    function createPage(columnCount) {
        const custompage = $('<custom-page/>');
        const columns = $('<div/>')
            .addClass('customGroups');
        for(let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
            columns.append(
                $('<div/>')
                    .addClass('customGroup')
                    .addClass(`column${columnIndex}`)
            )
        };
        custompage.append(columns);
        $('div.padding > div.wrapper > router-outlet').after(custompage);
    }

    function updatePageHeader(page) {
        $('header-component div.wrapper > div.image > img')
            .attr('src', page.image)
            .css('image-rendering', page.imagePixelated ? 'pixelated' : 'auto');
        $('header-component div.wrapper > div.title').text(page.name);
    }

    function updateActivePageInNav(name) {
        //Set other pages as inactive
        $(`nav-component > div.nav > div.scroll > button`)
            .removeClass('active-link')
            .removeClass('customActiveLink');
        //Set this page as active
        $(`nav-component > div.nav > div.scroll > button > div.customMenuButtonText:contains('${name}')`)
            .parent()
            .addClass('customActiveLink');
    }

    // hacky shit, idk why angular stops updating page header title ???
    async function headerPageNameChangeBugFix(page) {
        await elementWatcher.exists('nav-component > div.nav');
        let headerName = null;
        if(page.type === 'action') {
            await skillCache.ready;
            headerName = skillCache.byId[page.skill].name;
        } else if(page.type === 'automation') {
            headerName = 'House';
        } else if(page.type === 'structure') {
            headerName = 'House';
        } else {
            headerName = page.type;
            headerName = headerName.charAt(0).toUpperCase() + headerName.slice(1);
        }
        $('header-component div.wrapper > div.title').text(headerName);
    }

    const styles = `
        :root {
            --background-color: ${colorMapper('componentRegular')};
            --border-color: ${colorMapper('componentLight')};
            --darker-color: ${colorMapper('componentDark')};
        }
        .customMenuHeader {
            height: 56px;
            display: flex;
            align-items: center;
            padding: 0 24px;
            color: #aaa;
            font-size: .875rem;
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
            border-bottom: 1px solid var(--border-color);
            background-color: var(--background-color);
        }
        .customMenuHeaderText {
            flex: 1;
        }
        .customMenuButton {
            border: none;
            background: transparent;
            font-family: inherit;
            font-size: inherit;
            line-height: 1.5;
            font-weight: inherit;
            color: inherit;
            resize: none;
            text-transform: inherit;
            letter-spacing: inherit;
            cursor: pointer;
            height: 56px;
            display: flex;
            align-items: center;
            padding: 0 24px;
            border-bottom: 1px solid var(--border-color);
            width: 100%;
            text-align: left;
            position: relative;
            background-color: var(--background-color);
        }
        .customMenuButtonImage {
            max-width: 100%;
            max-height: 100%;
            height: 32px;
            width: 32px;
        }
        .customMenuButtonText {
            margin-left: var(--margin);
            flex: 1;
        }
        .customGroups {
            display: flex;
            gap: var(--gap);
            flex-wrap: wrap;
        }
        .customGroup {
            flex: 1;
            min-width: 360px;
        }
        .customActiveLink {
            background-color: var(--darker-color);
        }
    `;

    initialise();

    return exports
}
);
// Promise
window.moduleRegistry.add('Promise', () => {

    class Deferred {
        promise;
        resolve;
        reject;
        isResolved = false;
        constructor() {
            this.promise = new Promise((resolve, reject)=> {
                this.resolve = resolve;
                this.reject = reject;
            }).then(result => {
                this.isResolved = true;
                return result;
            }).catch(error => {
                if(error) {
                    console.warn(error);
                }
                throw error;
            });
        }
    }

    class Delayed extends Deferred {
        constructor(timeout) {
            super();
            const timeoutReference = window.setTimeout(() => {
                this.resolve();
            }, timeout);
            this.promise.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Expiring extends Deferred {
        constructor(timeout) {
            super();
            const timeoutReference = window.setTimeout(() => {
                this.reject(`Timed out after ${timeout} ms`);
            }, timeout);
            this.promise.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Checking extends Expiring {
        #checker;
        constructor(checker, interval, timeout) {
            super(timeout);
            this.#checker = checker;
            this.#check();
            const intervalReference = window.setInterval(this.#check.bind(this), interval);
            this.promise.finally(() => {
                window.clearInterval(intervalReference)
            });
        }
        #check() {
            const checkResult = this.#checker();
            if(!checkResult) {
                return;
            }
            this.resolve(checkResult);
        }
    }

    return {
        Deferred,
        Delayed,
        Expiring,
        Checking
    };

}
);
// request
window.moduleRegistry.add('request', (auth) => {

    const authenticated = auth.ready;

    const exports = makeRequest;

    let CURRENT_REQUEST = null;

    async function makeRequest(url, body) {
        await authenticated;
        await throttle();
        const headers = auth.getHeaders();
        const method = body ? 'POST' : 'GET';
        try {
            if(body) {
                body = JSON.stringify(body);
            }
            CURRENT_REQUEST = fetch(`${window.PANCAKE_ROOT}/${url}`, {method, headers, body});
            const fetchResponse = await CURRENT_REQUEST;
            if(fetchResponse.status !== 200) {
                console.error(await fetchResponse.text());
                return;
            }
            try {
                const contentType = fetchResponse.headers.get('Content-Type');
                if(contentType.startsWith('text/plain')) {
                    return await fetchResponse.text();
                } else if(contentType.startsWith('application/json')) {
                    return await fetchResponse.json();
                } else {
                    console.error(`Unknown content type : ${contentType}`);
                }
            } catch(e) {
                if(body) {
                    return 'OK';
                }
            }
        } catch(e) {
            console.error(e);
        }
    }

    async function throttle() {
        if(!CURRENT_REQUEST) {
            CURRENT_REQUEST = Promise.resolve();
        }
        while(CURRENT_REQUEST) {
            const waitingOn = CURRENT_REQUEST;
            try {
                await CURRENT_REQUEST;
            } catch(e) { }
            if(CURRENT_REQUEST === null) {
                CURRENT_REQUEST = Promise.resolve();
                continue;
            }
            if(CURRENT_REQUEST === waitingOn) {
                CURRENT_REQUEST = null;
            }
        }
    }

    // alphabetical

    makeRequest.getConfigurations = () => makeRequest('configuration');
    makeRequest.saveConfiguration = (key, value) => makeRequest('configuration', {[key]: value});

    makeRequest.getActionEstimation = (skill, action) => makeRequest(`estimation/action?skill=${skill}&action=${action}`);
    makeRequest.getAutomationEstimation = (action) => makeRequest(`estimation/automation?id=${action}`);

    makeRequest.getGuildMembers = () => makeRequest('guild/members');
    makeRequest.registerGuildQuest = (itemId, amount) => makeRequest('guild/quest/register', {itemId, amount});
    makeRequest.getGuildQuestStats = () => makeRequest('guild/quest/stats');
    makeRequest.unregisterGuildQuest = (itemId) => makeRequest('guild/quest/unregister', {itemId});

    makeRequest.getLeaderboardGuildRanks = () => makeRequest('leaderboard/ranks/guild');

    makeRequest.listActions = () => makeRequest('list/action');
    makeRequest.listItems = () => makeRequest('list/item');
    makeRequest.listItemAttributes = () => makeRequest('list/itemAttributes');
    makeRequest.listRecipes = () => makeRequest('list/recipe');
    makeRequest.listSkills = () => makeRequest('list/skills');

    makeRequest.getMarketConversion = () => makeRequest('market/conversions');
    makeRequest.getMarketFilters = () => makeRequest('market/filters');
    makeRequest.saveMarketFilter = (filter) => makeRequest('market/filters', filter);
    makeRequest.removeMarketFilter = (id) => makeRequest(`market/filters/${id}/remove`);

    makeRequest.saveWebhook = (webhook) => makeRequest('notification/webhook', webhook);

    makeRequest.handleInterceptedRequest = (interceptedRequest) => makeRequest('request', interceptedRequest);

    makeRequest.getChangelogs = () => makeRequest('settings/changelog');
    makeRequest.getVersion = () => makeRequest('settings/version');

    return exports;

}
);
// skillCache
window.moduleRegistry.add('skillCache', (auth, request, Promise) => {

    const authenticated = auth.ready;
    const isReady = new Promise.Deferred();

    const exports = {
        ready: isReady.promise,
        list: [],
        byId: null,
        byName: null,
    };

    async function initialise() {
        await authenticated;
        const skills = await request.listSkills();
        exports.byId = {};
        exports.byName = {};
        for(const skill of skills) {
            exports.list.push(skill);
            exports.byId[skill.id] = skill;
            exports.byName[skill.name] = skill;
        }
        isReady.resolve();
    }

    initialise();

    return exports;

}
);
// toast
window.moduleRegistry.add('toast', (util, elementCreator) => {

    const exports = {
        create
    };

    function initialise() {
        elementCreator.addStyles(styles);
    }

    // text, time, image
    async function create(config) {
        config.time ||= 2000;
        config.image ||= 'https://ironwoodrpg.com/assets/misc/quests.png';
        const notificationId = `customNotification_${Date.now()}`
        const notificationDiv =
            $('<div/>')
                .addClass('customNotification')
                .attr('id', notificationId)
                .append(
                    $('<div/>')
                        .addClass('customNotificationImageDiv')
                        .append(
                            $('<img/>')
                                .addClass('customNotificationImage')
                                .attr('src', config.image)
                        )
                )
                .append(
                    $('<div/>')
                        .addClass('customNotificationDetails')
                        .html(config.text)
                );
        $('div.notifications').append(notificationDiv);
        await util.sleep(config.time);
        $(`#${notificationId}`).fadeOut('slow', () => {
            $(`#${notificationId}`).remove();
        });
    }

    const styles = `
        .customNotification {
            padding: 8px 16px 8px 12px;
            border-radius: 4px;
            backdrop-filter: blur(8px);
            background: rgba(255,255,255,.15);
            box-shadow: 0 8px 16px -4px #00000080;
            display: flex;
            align-items: center;
            min-height: 48px;
            margin-top: 12px;
            pointer-events: all;
        }
        .customNotificationImageDiv {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
        }
        .customNotificationImage {
            filter: drop-shadow(0px 8px 4px rgba(0,0,0,.1));
            image-rendering: auto;
        }
        .customNotificationDetails {
            margin-left: 8px;
            text-align: center;
        }
    `;

    initialise();

    return exports;
}
);
// userCache
window.moduleRegistry.add('userCache', (events, itemCache, Promise, util) => {

    const registerPageHandler = events.register.bind(null, 'page');
    const registerXhrHandler = events.register.bind(null, 'xhr');
    const emitEvent = events.emit.bind(null, 'userCache');
    const isReady = new Promise.Deferred();

    const exp = {};
    const inventory = {};
    const equipment = {};
    const action = {
        actionId: null,
        skillId: null,
        amount: null,
        maxAmount: null
    };
    const automations = {};
    let currentPage = null;

    const exports = {
        ready: isReady.promise,
        exp,
        inventory,
        equipment,
        action,
        automations
    };

    function initialise() {
        registerPageHandler(handlePage);
        registerXhrHandler(handleXhr);

        window.setInterval(update, 1000);
    }

    function handlePage(page) {
        currentPage = page;
        update();
    }

    async function handleXhr(xhr) {
        if(xhr.url.endsWith('/getUser')) {
            await handleGetUser(xhr.response);
            isReady.resolve();
        }
        if(xhr.url.endsWith('/startAction')) {
            handleStartAction(xhr.response);
        }
        if(xhr.url.endsWith('/stopAction')) {
            handleStopAction();
        }
        if(xhr.url.endsWith('/startAutomation')) {
            handleStartAutomation();
        }
    }

    async function handleGetUser(response) {
        await itemCache.ready;
        // exp
        const newExp = Object.entries(response.user.skills)
                .map(a => ({id:a[0],exp:a[1].exp}))
                .reduce((a,v) => Object.assign(a,{[v.id]:v.exp}), {});
        Object.assign(exp, newExp);
        // inventory
        const newInventory = Object.values(response.user.inventory)
            .reduce((a,v) => Object.assign(a,{[v.id]:v.amount}), {});
        newInventory[-1] = response.user.compost;
        newInventory[2] = response.user.charcoal;
        Object.assign(inventory, newInventory);
        // equipment
        const newEquipment = Object.values(response.user.equipment)
            .filter(a => a)
            .map(a => {
                if(a.uses) {
                    const duration = itemCache.byId[a.id]?.attributes?.DURATION || 1;
                    a.amount += a.uses / duration;
                }
                return a;
            })
            .reduce((a,v) => Object.assign(a,{[v.id]:v.amount}), {});
        Object.assign(equipment, newEquipment);
        // action
        if(!response.user.action) {
            action.actionId = null;
            action.skillId = null;
            action.amount = null;
        } else {
            action.actionId = +response.user.action.actionId;
            action.skillId = +response.user.action.skillId;
            action.amount = 0;
        }
    }

    function handleStartAction(response) {
        action.actionId = +response.actionId;
        action.skillId = +response.skillId;
        action.amount = 0;
        action.maxAmount = response.amount;
    }

    function handleStopAction() {
        action.actionId = null;
        action.skillId = null;
        action.amount = null;
        action.maxAmount = null;
    }

    function handleStartAutomation(response) {
        automations[+response.automationId] = {
            amount: 0,
            maxAmount: response.amount
        }
    }

    async function update() {
        await itemCache.ready;
        if(!currentPage) {
            return;
        }
        let updated = false;
        if(currentPage.type === 'action') {
            updated |= updateAction(); // bitwise OR because of lazy evaluation
        }
        if(currentPage.type === 'equipment') {
            updated |= updateEquipment(); // bitwise OR because of lazy evaluation
        }
        if(currentPage.type === 'automation') {
            updated |= updateAutomation(); // bitwise OR because of lazy evaluation
        }
        if(updated) {
            emitEvent();
        }
    }

    function updateAction() {
        let updated = false;
        $('skill-page .card').each((i,element) => {
            const header = $(element).find('.header').text();
            if(header === 'Materials') {
                $(element).find('.row').each((j,row) => {
                    updated |= extractItem(row, inventory); // bitwise OR because of lazy evaluation
                });
            } else if(header === 'Consumables') {
                $(element).find('.row').each((j,row) => {
                    updated |= extractItem(row, equipment); // bitwise OR because of lazy evaluation
                });
            } else if(header === 'Stats') {
                $(element).find('.row').each((j,row) => {
                    const text = $(row).find('.name').text();
                    if(text.startsWith('Total ') && text.endsWith(' XP')) {
                        let expValue = $(row).find('.value').text().split(' ')[0];
                        expValue = util.parseNumber(expValue);
                        updated |= exp[currentPage.skill] !== expValue; // bitwise OR because of lazy evaluation
                        exp[currentPage.skill] = expValue;
                    }
                });
            } else if(header.startsWith('Loot')) {
                const amount = $(element).find('.header .amount').text();
                let newActionAmountValue = null;
                let newActionMaxAmountValue = null;
                if(amount) {
                    newActionAmountValue = util.parseNumber(amount.split(' / ')[0]);
                    newActionMaxAmountValue = util.parseNumber(amount.split(' / ')[1]);
                }
                updated |= action.amount !== newActionAmountValue; // bitwise OR because of lazy evaluation
                updated |= action.maxAmount !== newActionMaxAmountValue; // bitwise OR because of lazy evaluation
                action.amount = newActionAmountValue;
                action.maxAmount = newActionMaxAmountValue;
            }
        });
        return updated;
    }

    function updateEquipment() {
        let updated = false;
        $('equipment-component .card:nth-child(4) .item').each((i,element) => {
            updated |= extractItem(element, equipment); // bitwise OR because of lazy evaluation
        });
        return updated;
    }

    function updateAutomation() {
        let updated = false;
        $('produce-component .card').each((i,element) => {
            const header = $(element).find('.header').text();
            if(header === 'Materials') {
                $(element).find('.row').each((j,row) => {
                    updated |= extractItem(row, inventory); // bitwise OR because of lazy evaluation
                });
            } else if(header.startsWith('Loot')) {
                const amount = $(element).find('.header .amount').text();
                let newAutomationAmountValue = null;
                let newAutomationMaxAmountValue = null;
                if(amount) {
                    newAutomationAmountValue = util.parseNumber(amount.split(' / ')[0]);
                    newAutomationMaxAmountValue = util.parseNumber(amount.split(' / ')[1]);
                }
                updated |= automations[currentPage.action]?.amount !== newAutomationAmountValue; // bitwise OR because of lazy evaluation
                updated |= automations[currentPage.action]?.maxAmount !== newAutomationMaxAmountValue; // bitwise OR because of lazy evaluation
                automations[currentPage.action] = {
                    amount: newAutomationAmountValue,
                    maxAmount: newAutomationMaxAmountValue
                }
            }
        });
        return updated;
    }

    function extractItem(element, target) {
        element = $(element);
        const name = element.find('.name').text();
        if(!name) {
            return false;
        }
        const item = itemCache.byName[name];
        if(!item) {
            console.warn(`Could not find item with name [${name}]`);
            return false;
        }
        let amount = element.find('.amount, .value').text();
        if(!amount) {
            return false;
        }
        if(amount.includes(' / ')) {
            amount = amount.split(' / ')[0];
        }
        amount = util.parseNumber(amount);
        let uses = element.find('.uses, .use').text();
        if(uses) {
            amount += util.parseNumber(uses);
        }
        const updated = target[item.id] !== amount;
        target[item.id] = amount;
        return updated;
    }

    initialise();

    return exports;

}
);
// util
window.moduleRegistry.add('util', () => {

    const exports = {
        levelToExp,
        expToLevel,
        expToCurrentExp,
        expToNextLevel,
        expToNextTier,
        formatNumber,
        parseNumber,
        secondsToDuration,
        parseDuration,
        divmod,
        sleep,
        goToPage
    };

    function levelToExp(level) {
        if(level === 1) {
            return 0;
        }
        return Math.floor(Math.pow(level, 3.5) * 6 / 5);
    }

    function expToLevel(exp) {
        let level = Math.pow((exp + 1) * 5 / 6, 1 / 3.5);
        level = Math.floor(level);
        level = Math.max(1, level);
        return level;
    }

    function expToCurrentExp(exp) {
        const level = expToLevel(exp);
        return exp - levelToExp(level);
    }

    function expToNextLevel(exp) {
        const level = expToLevel(exp);
        return levelToExp(level + 1) - exp;
    }

    function expToNextTier(exp) {
        const level = expToLevel(exp);
        let target = 10;
        while(target <= level) {
            target += 15;
        }
        return levelToExp(target) - exp;
    }

    function formatNumber(number) {
        return number.toLocaleString(undefined, {maximumFractionDigits:2});
    }

    function parseNumber(text) {
        if(!text) {
            return 0;
        }
        text = text.replaceAll(/,/g, '');
        let multiplier = 1;
        if(text.endsWith('%')) {
            multiplier = 1 / 100;
        }
        if(text.endsWith('K')) {
            multiplier = 1_000;
        }
        if(text.endsWith('M')) {
            multiplier = 1_000_000;
        }
        return (parseFloat(text) || 0) * multiplier;
    }

    function secondsToDuration(seconds) {
        seconds = Math.floor(seconds);
        if(seconds > 60 * 60 * 24 * 100) {
            // > 100 days
            return 'A very long time';
        }

        var [minutes, seconds] = divmod(seconds, 60);
        var [hours, minutes] = divmod(minutes, 60);
        var [days, hours] = divmod(hours, 24);

        seconds = `${seconds}`.padStart(2, '0');
        minutes = `${minutes}`.padStart(2, '0');
        hours = `${hours}`.padStart(2, '0');
        days = `${days}`.padStart(2, '0');

        let result = '';
        if(result || +days) {
            result += `${days}d `;
        }
        if(result || +hours) {
            result += `${hours}h `;
        }
        if(result || +minutes) {
            result += `${minutes}m `;
        }
        if(result || +seconds) {
            result += `${seconds}s`;
        }

        return result;
    }

    function parseDuration(duration) {
        const parts = duration.split(' ');
        let seconds = 0;
        for(const part of parts) {
            const value = parseFloat(part);
            if(part.endsWith('m')) {
                seconds += value * 60;
            } else if(part.endsWith('h')) {
                seconds += value * 60 * 60;
            } else if(part.endsWith('d')) {
                seconds += value * 60 * 60 * 24;
            } else {
                console.warn(`Unexpected duration being parsed : ${part}`);
            }
        }
        return seconds;
    }

    function divmod(x, y) {
        return [Math.floor(x / y), x % y];
    }

    function goToPage(page) {
        window.history.pushState({}, '', page);
        window.history.pushState({}, '', page);
        window.history.back();
    }

    async function sleep(millis) {
        await new Promise(r => window.setTimeout(r, millis));
    }

    return exports;

}
);
// webhooks
window.moduleRegistry.add('webhooks', (request, configuration) => {

    const exports = {
        register: register
    }

    function register(name, text, type) {
        const webhook = {
            type: type,
            enabled: false,
            url: ''
        };
        const handler = handleConfigStateChange.bind(null, webhook);
        configuration.registerCheckbox({
            category: 'Webhooks',
            key: `${name}-enabled`,
            name: `${text} webhook enabled`,
            default: false,
            handler: handler
        });
        configuration.registerInput({
            category: 'Webhooks',
            key: name,
            name: `${text} webhook URL`,
            default: '',
            inputType: 'text',
            handler: handler
        });
    }

    function handleConfigStateChange(webhook, state, name, initial) {
        if(name.endsWith('-enabled')) {
            webhook.enabled = state;
        } else {
            webhook.url = state;
        }
        if(!initial) {
            request.saveWebhook(webhook);
        }
    }

    return exports;

}
);
// authToast
window.moduleRegistry.add('authToast', (auth, toast) => {

    async function initialise() {
        await auth.ready;
        toast.create({
            text: 'Pancake-Scripts initialised!',
            image: 'https://img.icons8.com/?size=48&id=1ODJ62iG96gX&format=png'
        });
    }

    initialise();

}
);
// changelog
window.moduleRegistry.add('changelog', (Promise, pages, components, request, util, configuration) => {

    const PAGE_NAME = 'Plugin changelog';
    const loaded = new Promise.Deferred();

    let changelogs = null;

    async function initialise() {
        await pages.register({
            category: 'Skills',
            after: 'Changelog',
            name: PAGE_NAME,
            image: 'https://ironwoodrpg.com/assets/misc/changelog.png',
            render: renderPage
        });
        configuration.registerCheckbox({
            category: 'Pages',
            key: 'changelog-enabled',
            name: 'Changelog',
            default: true,
            handler: handleConfigStateChange
        });
        load();
    }

    function handleConfigStateChange(state, name) {
        if(state) {
            pages.show(PAGE_NAME);
        } else {
            pages.hide(PAGE_NAME);
        }
    }

    async function load() {
        changelogs = await request.getChangelogs();
        loaded.resolve();
    }

    async function renderPage() {
        await loaded.promise;
        const header = components.search(componentBlueprint, 'header');
        const list = components.search(componentBlueprint, 'list');
        for(const index in changelogs) {
            componentBlueprint.componentId = `changelogComponent_${index}`;
            header.title = changelogs[index].title;
            header.textRight = new Date(changelogs[index].time).toLocaleDateString();
            list.entries = changelogs[index].entries;
            components.addComponent(componentBlueprint);
        }
    }

    const componentBlueprint = {
        componentId: 'changelogComponent',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                id: 'header',
                type: 'header',
                title: '',
                textRight: ''
            },{
                id: 'list',
                type: 'list',
                entries: []
            }]
        }]
    };

    initialise();
}
);
// configurationPage
window.moduleRegistry.add('configurationPage', (pages, components, elementWatcher, configuration, auth, elementCreator) => {

    const PAGE_NAME = 'Configuration';
    const blueprints = [];

    async function initialise() {
        await auth.ready;
        await pages.register({
            category: 'Misc',
            name: PAGE_NAME,
            image: 'https://cdn-icons-png.flaticon.com/512/3953/3953226.png',
            columns: '2',
            render: renderPage
        });
        elementCreator.addStyles(styles);
        await generateBlueprint();
        pages.show(PAGE_NAME);
    }

    async function generateBlueprint() {
        await configuration.ready;
        const categories = {};
        for(const item of configuration.items) {
            if(!categories[item.category]) {
                categories[item.category] = {
                    name: item.category,
                    items: []
                }
            }
            categories[item.category].items.push(item);
        }
        let column = 1;
        for(const category in categories) {
            column = 1 - column;
            const rows = [{
                type: 'header',
                title: category,
                centered: true
            }];
            rows.push(...categories[category].items.flatMap(createRows));
            blueprints.push({
                componentId: `configurationComponent_${category}`,
                dependsOn: 'custom-page',
                parent: `.column${column}`,
                selectedTabIndex: 0,
                tabs: [{
                    rows: rows
                }]
            });
        }
    }

    function createRows(item) {
        switch(item.type) {
            case 'checkbox': return createRows_Checkbox(item);
            case 'input': return createRows_Input(item);
            case 'dropdown': return createRows_Dropdown(item);
            case 'json': break;
            default: throw `Unknown configuration type : ${item.type}`;
        }
    }

    function createRows_Checkbox(item) {
        return [{
            type: 'checkbox',
            text: item.name,
            checked: item.value,
            delay: 500,
            action: (value) => {
                item.handler(value);
                pages.requestRender(PAGE_NAME);
            }
        }]
    }

    function createRows_Input(item) {
        const value = item.value || item.default;
        return [{
            type: 'item',
            name: item.name
        },{
            type: 'input',
            name: item.name,
            value: value,
            inputType: item.inputType,
            delay: 500,
            action: (value) => {
                item.handler(value);
            }
        }]
    }

    function createRows_Dropdown(item) {
        const value = item.value || item.default;
        const options = item.options.map(option => ({
            text: option,
            value: option,
            selected: option === value
        }));
        return [{
            type: 'item',
            name: item.name
        },{
            type: 'dropdown',
            options: options,
            delay: 500,
            action: (value) => {
                item.handler(value);
            }
        }]
    }

    async function renderPage() {
        for(const blueprint of blueprints) {
            components.addComponent(blueprint);
        }
    }

    const styles = `
        .modifiedHeight {
            height: 28px;
        }
    `;

    initialise();
}
);
// dataTransmitter
window.moduleRegistry.add('dataTransmitter', (auth, request, events) => {

    function initialise() {
        events.register('xhr', handleXhr);
    }

    async function handleXhr(xhr) {
        if(xhr.status !== 200) {
            return;
        }
        let response = xhr.response;
        if(Array.isArray(response)) {
            response = {
                value: response
            };
        }
        if(xhr.url.endsWith('getUser')) {
            const name = response.user.displayName;
            const password = new Date(response.user.createdAt).getTime();
            auth.register(name, password);
        }
        await request.handleInterceptedRequest({
            url: xhr.url,
            status: xhr.status,
            payload: JSON.stringify(xhr.request),
            response: JSON.stringify(response)
        });
    }

    initialise();

}
);
// estimations
window.moduleRegistry.add('estimations', (events, components, util) => {

    const registerEstimationHandler = events.register.bind(null, 'estimation');
    const addComponent = components.addComponent;
    const removeComponent = components.removeComponent;
    const searchComponent = components.search;

    function initialise() {
        registerEstimationHandler(handleEstimationData);
    }

    function handleEstimationData(estimation) {
        if(!estimation) {
            removeComponent(componentBlueprint);
            return;
        }

        if(estimation.type === 'AUTOMATION') {
            componentBlueprint.dependsOn = 'home-page';
            componentBlueprint.parent = 'produce-component';
        } else {
            componentBlueprint.dependsOn = 'skill-page';
            componentBlueprint.parent = 'actions-component';
        }

        searchComponent(componentBlueprint, 'overviewSpeed').value
            = util.formatNumber(estimation.speed) + ' s';
        searchComponent(componentBlueprint, 'overviewExp').hidden
            = estimation.exp === 0;
        searchComponent(componentBlueprint, 'overviewExp').value
            = util.formatNumber(estimation.exp);
        searchComponent(componentBlueprint, 'overviewSurvivalChance').hidden
            = estimation.type === 'ACTIVITY' || estimation.type === 'AUTOMATION';
        searchComponent(componentBlueprint, 'overviewSurvivalChance').value
            = util.formatNumber(estimation.survivalChance * 100) + ' %';
        searchComponent(componentBlueprint, 'overviewFinishedTime').value
            = util.secondsToDuration(estimation.secondsLeft);
        searchComponent(componentBlueprint, 'overviewLevelTime').hidden
            = estimation.exp === 0;
        searchComponent(componentBlueprint, 'overviewLevelTime').value
            = util.secondsToDuration(estimation.secondsToNextlevel);
        searchComponent(componentBlueprint, 'overviewTierTime').hidden
            = estimation.exp === 0;
        searchComponent(componentBlueprint, 'overviewTierTime').value
            = util.secondsToDuration(estimation.secondsToNextTier);
        searchComponent(componentBlueprint, 'overviewGoldLoot').hidden
            = estimation.goldLoot === 0;
        searchComponent(componentBlueprint, 'overviewGoldLoot').value
            = util.formatNumber(estimation.goldLoot);
        searchComponent(componentBlueprint, 'overviewGoldMaterials').hidden
            = estimation.goldMaterials === 0;
        searchComponent(componentBlueprint, 'overviewGoldMaterials').value
            = util.formatNumber(estimation.goldMaterials);
        searchComponent(componentBlueprint, 'overviewGoldEquipments').hidden
            = estimation.goldEquipments === 0;
        searchComponent(componentBlueprint, 'overviewGoldEquipments').value
            = util.formatNumber(estimation.goldEquipments);
        searchComponent(componentBlueprint, 'overviewGoldTotal').hidden
            = estimation.goldTotal === 0;
        searchComponent(componentBlueprint, 'overviewGoldTotal').value
            = util.formatNumber(estimation.goldTotal);
        searchComponent(componentBlueprint, 'tabTime').hidden
            = (estimation.materials.length + estimation.equipments.length) === 0;

        const dropRows = searchComponent(componentBlueprint, 'dropRows');
        const materialRows = searchComponent(componentBlueprint, 'materialRows');
        const timeRows = searchComponent(componentBlueprint, 'timeRows');
        dropRows.rows = [];
        materialRows.rows = [];
        timeRows.rows = [];
        for(const drop of estimation.loot) {
            dropRows.rows.push({
                type: 'item',
                image: `/assets/${drop.item?.image}`,
                imagePixelated: true,
                name: drop.item?.name,
                value: util.formatNumber(drop.amount) + ' / hour'
            });
        }
        for(const material of estimation.materials) {
            materialRows.rows.push({
                type: 'item',
                image: `/assets/${material.item?.image}`,
                imagePixelated: true,
                name: material.item?.name,
                value: util.formatNumber(material.amount) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${material.item?.image}`,
                imagePixelated: true,
                name: `${material.item?.name} [${util.formatNumber(material.stored)}]`,
                value: util.secondsToDuration(material.secondsLeft)
            });
        }
        for(const equipment of estimation.equipments) {
            materialRows.rows.push({
                type: 'item',
                image: `/assets/${equipment.item?.image}`,
                imagePixelated: true,
                name: equipment.item?.name,
                value: util.formatNumber(equipment.amount) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${equipment.item?.image}`,
                imagePixelated: true,
                name: `${equipment.item?.name} [${util.formatNumber(equipment.stored)}]`,
                value: util.secondsToDuration(equipment.secondsLeft)
            });
        }

        addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId: 'estimationComponent',
        dependsOn: 'skill-page',
        parent: 'actions-component',
        selectedTabIndex: 0,
        tabs: [{
            title: 'Overview',
            rows: [{
                type: 'item',
                id: 'overviewSpeed',
                name: 'Time per action',
                image: 'https://cdn-icons-png.flaticon.com/512/3563/3563395.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewExp',
                name: 'Exp/hour',
                image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewSurvivalChance',
                name: 'Survival chance',
                image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewFinishedTime',
                name: 'Finished',
                image: 'https://cdn-icons-png.flaticon.com/512/1505/1505471.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewLevelTime',
                name: 'Level up',
                image: 'https://cdn-icons-png.flaticon.com/512/4614/4614145.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewTierTime',
                name: 'Tier up',
                image: 'https://cdn-icons-png.flaticon.com/512/4789/4789514.png',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldLoot',
                name: 'Gold/hour (loot)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028024.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldMaterials',
                name: 'Gold/hour (materials)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldEquipments',
                name: 'Gold/hour (equipments)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'overviewGoldTotal',
                name: 'Gold/hour (total)',
                image: 'https://cdn-icons-png.flaticon.com/512/11937/11937869.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            }]
        },{
            title: 'Items',
            rows: [{
                type: 'header',
                title: 'Produced'
            },{
                type: 'segment',
                id: 'dropRows',
                rows: []
            },{
                type: 'header',
                title: 'Consumed'
            },{
                type: 'segment',
                id: 'materialRows',
                rows: []
            }]
        },{
            title: 'Time',
            id: 'tabTime',
            rows: [{
                type: 'segment',
                id: 'timeRows',
                rows: []
            }]
        }]
    };

    initialise();

}
);
// guildQuestTracking
window.moduleRegistry.add('guildQuestTracking', (request, configuration, events, components) => {

    let enabled = false;
    let registrationAmount = 0;
    let selectedItem;
    let questsData;
    let combinedData;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Other',
            key: 'guild-quest-tracking',
            name: 'Guild quest tracking',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('xhr', handleXhr);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    async function handleXhr(xhr) {
        if(!enabled) {
            return;
        }
        if(xhr.url.endsWith('/createGuildQuests')) {
            await refresh();
            handleQuestOverviewButtonClick();
        }
        if(xhr.url.endsWith('/giveGuildQuestItems')) {
            refresh(selectedItem);
        }
    }

    async function refresh(item) {
        await fetchData();
        listenNavigateAway();
        injectButtons();
        if(item) {
            showForItem(item);
        }
    }

    async function fetchData() {
        questsData = await request.getGuildQuestStats();
        combinedData = {
            complete: true,
            image: 'items/coin-stack.png',
            registrations: [],
            performers: [],
            contributions: questsData.flatMap(a => a.contributions)
        };
    }

    function listenNavigateAway() {
        $('.tracker + .card > button').click(function() {
            components.removeComponent(componentBlueprint);
        });
    }

    function injectButtons() {
        const rows = $('.row > .image').parent();
        rows.find('.customQuestButton').remove();
        for(const row of rows) {
            const itemName = $(row).find('> .name').text();
            const questData = questsData.find(a => a.name === itemName);
            const count = questData.complete ? '-' : questData.registrations.length + questData.performers.length;
            const element = $(`<button class='customQuestButton'><img src='https://cdn-icons-png.flaticon.com/512/6514/6514927.png' style='width:24px;height:24px;margin-left:12px'><span style='min-width:1.5rem'>${count}</span></button>`);
            element.click(handleQuestButtonClick.bind(null, itemName));
            $(row).find('> .plus').after(element);
        }

        const header = $('.header > .amount').parent();
        header.find('.customQuestButton').remove();
        const element = $(`<button class='customQuestButton'><img src='https://cdn-icons-png.flaticon.com/512/6514/6514927.png' style='width:24px;height:24px;margin-left:12px'></button>`);
        element.click(handleQuestOverviewButtonClick);
        header.append(element);
    }

    function handleQuestButtonClick(item, event) {
        event.stopPropagation();
        selectedItem = item;
        showForItem(item);
    }

    function handleQuestOverviewButtonClick() {
        showComponent(combinedData);
    }

    function showForItem(item) {
        registrationAmount = 0;
        const questData = questsData.find(a => a.name === item);
        showComponent(questData);
    }

    function showComponent(questData) {
        componentBlueprint.selectedTabIndex = 0;
        const registeredSegment = components.search(componentBlueprint, 'registeredSegment');
        const performingSegment = components.search(componentBlueprint, 'performingSegment');
        registeredSegment.hidden = questData.complete;
        performingSegment.hidden = questData.complete;
        components.search(componentBlueprint, 'registeredHeader').image = `/assets/${questData.image}`;
        components.search(componentBlueprint, 'performingHeader').image = `/assets/${questData.image}`;
        components.search(componentBlueprint, 'contributionsHeader').image = `/assets/${questData.image}`;
        components.search(componentBlueprint, 'registerTab').hidden = questData.complete;
        components.search(componentBlueprint, 'registeredRowsSegment').rows = questData.registrations.map(registration => ({
            type: 'item',
            name: registration.name,
            value: registration.amount,
            image: '/assets/misc/quests.png',
            imagePixelated: true
        }));
        components.search(componentBlueprint, 'performingRowsSegment').rows = questData.performers.map(performer => ({
            type: 'item',
            name: performer.name,
            image: `/assets/${questData.image}`,
            imagePixelated: true
        }));
        components.search(componentBlueprint, 'contributionsRowsSegment').rows = questData.contributions.map(contribution => ({
            type: 'item',
            name: contribution.name,
            value: `${contribution.amount} (${new Date(contribution.time).toLocaleTimeString()})`,
            image: `/assets/${contribution.image}`,
            imagePixelated: true
        }));
        const registered = !!questData.registrations.find(a => a.name === questData.requester);
        const registerButton = components.search(componentBlueprint, 'registerButton');
        const unregisterButton = components.search(componentBlueprint, 'unregisterButton');
        registerButton.disabled = !!registered;
        unregisterButton.disabled = !registered;
        registerButton.action = register.bind(null,questData);
        unregisterButton.action = unregister.bind(null,questData);
        components.addComponent(componentBlueprint);
    }

    function setRegistrationAmount(value) {
        registrationAmount = +value;
    }

    async function register(questData) {
        if(!registrationAmount) {
            return;
        }
        await request.registerGuildQuest(questData.itemId, registrationAmount);
        refresh(questData.name);
    }

    async function unregister(questData) {
        await request.unregisterGuildQuest(questData.itemId);
        refresh(questData.name);
    }

    const componentBlueprint = {
        componentId : 'guildQuestComponent',
        dependsOn: 'guild-page',
        parent : 'guild-component > .groups > .group:last-child',
        selectedTabIndex : 0,
        tabs : [{
            id: 'statusTab',
            title : 'Status',
            rows: [{
                type: 'segment',
                id: 'registeredSegment',
                hidden: false,
                rows: [{
                    type: 'header',
                    id: 'registeredHeader',
                    title: 'Registered',
                    centered: true,
                    image: '',
                    imagePixelated: true
                }, {
                    type: 'segment',
                    id: 'registeredRowsSegment',
                    rows: []
                }]
            }, {
                type: 'segment',
                id: 'performingSegment',
                hidden: false,
                rows: [{
                    type: 'header',
                    id: 'performingHeader',
                    title: 'Currently performing',
                    centered: true,
                    image: '',
                    imagePixelated: true
                }, {
                    type: 'segment',
                    id: 'performingRowsSegment',
                    rows: []
                }]
            }, {
                type: 'segment',
                id: 'contributionsSegment',
                rows: [{
                    type: 'header',
                    id: 'contributionsHeader',
                    title: 'Contributions',
                    centered: true,
                    image: '',
                    imagePixelated: true
                }, {
                    type: 'segment',
                    id: 'contributionsRowsSegment',
                    rows: []
                }]
            }]
        }, {
            id: 'registerTab',
            title : 'Register',
            hidden: false,
            rows: [{
                type : 'input',
                name : 'Amount',
                action: setRegistrationAmount
            },{
                type : 'buttons',
                buttons: [{
                    id: 'registerButton',
                    text: 'Register',
                    disabled: true,
                    color: 'primary'
                },{
                    id: 'unregisterButton',
                    text: 'Unregister',
                    disabled: true,
                    color: 'warning'
                }]
            }]
        }]
    };

    initialise();

}
);
// guildSorts
window.moduleRegistry.add('guildSorts', (events, elementWatcher, util, elementCreator) => {

    function initialise() {
        elementCreator.addStyles(styles);
        events.register('page', handlePage);
    }

    async function handlePage(page) {
        if(page.type === 'guild') {
            await elementWatcher.exists('.card > .row');
            await addAdditionGuildSortButtons();
            setupGuildMenuButtons();
        }
        if(page.type === 'market') {
            // TODO for another script?
        }
    }

    function setupGuildMenuButtons() {
        $(`button > div.name:contains('Members')`).parent().on('click', async function () {
            await util.sleep(50);
            await addAdditionGuildSortButtons();
        });
    }

    async function addAdditionGuildSortButtons() {
        await elementWatcher.exists('div.sort');
        const orginalButtonGroup = $('div.sort').find('div.container');

        // rename daily to daily xp
        $(`button:contains('Daily')`).text('Daily XP');
        // fix text on 2 lines
        $('div.sort').find('button').addClass('overrideFlex');
        // attach clear custom to game own sorts
        $('div.sort').find('button').on('click', function() {
            clearCustomActiveButtons()
        });

        const customButtonGroup = $('<div/>')
            .addClass('customButtonGroup')
            .addClass('alignButtonGroupLeft')
            .attr('id', 'guildSortButtonGroup')
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByLevel')
                    .text('Level')
                    .click(() => { sortByLevel(); })
            )
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByIdle')
                    .text('Idle')
                    .click(() => { sortByIdle(); })
            )
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByTotalXP')
                    .text('Total XP')
                    .click(() => { sortByXp(); })
            );

        customButtonGroup.insertAfter(orginalButtonGroup);
    }

    function clearCustomActiveButtons() {
        $('.customButtonGroupButton').removeClass('custom-sort-active');
    }

    function clearActiveButtons() {
        $('div.sort').find('button').removeClass('sort-active');
    }

    function sortByXp() {
        $(`button:contains('Date')`).trigger('click');
        
        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByTotalXP').addClass('custom-sort-active');

        const parent = $('div.sort').parent();
        sortElements({
            elements: parent.find('button.row'),
            extractor: a => util.parseNumber($(a).find('div.amount').text()),
            sorter: (a,b) => b-a,
            target: parent
        });
    }

    function sortByIdle() {
        // make sure the last contributed time is visible
        if(
            !$(`div.sort button:contains('Date')`).hasClass('sort-active') &&
            !$(`button:contains('Daily XP')`).hasClass('sort-active')
        ) {
            $(`button:contains('Date')`).trigger('click');
        }

        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByIdle').addClass('custom-sort-active');

        const parent = $('div.sort').parent();
        sortElements({
            elements: parent.find('button.row'),
            extractor: a => util.parseDuration($(a).find('div.time').text()),
            sorter: (a,b) => b-a,
            target: parent
        });
    }

    function sortByLevel() {
        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByLevel').addClass('custom-sort-active');

        const parent = $('div.sort').parent();
        sortElements({
            elements: parent.find('button.row'),
            extractor: a => util.parseNumber($(a).find('div.level').text().replace('Lv. ', '')),
            sorter: (a,b) => b-a,
            target: parent
        });
    }

    // sorts a list of `elements` according to the extracted property from `extractor`,
    // sorts them using `sorter`, and appends them to the `target`
    // elements is a jquery list
    // target is a jquery element
    // { elements, target, extractor, sorter }
    function sortElements(config) {
        const list = config.elements.get().map(element => ({
            element,
            value: config.extractor(element)
        }));
        list.sort((a,b) => config.sorter(a.value, b.value));
        for(const item of list) {
            config.target.append(item.element);
        }
    }

    const styles = `
        .alignButtonGroupLeft {
            margin-right: auto;
            margin-left: 8px;
        }
        .customButtonGroup {
            display: flex;
            align-items: center;
            border-radius: 4px;
            box-shadow: 0 1px 2px #0003;
            border: 1px solid #263849;
            overflow: hidden;
        }
        .customButtonGroupButton {
            padding: 4px var(--gap);
            flex: none !important;
            text-align: center;
            justify-content: center;
            background-color: #061a2e;
        }
        .customButtonGroupButton:not(:first-of-type) {
            border-left: 1px solid #263849;
        }
        .overrideFlex {
            flex: none !important
        }
        .custom-sort-active {
            background-color: #0d2234;
        }
    `;

    initialise();
}
);
// idleBeep
window.moduleRegistry.add('idleBeep', (configuration, events, util) => {

    const audio = new Audio('data:audio/mpeg;base64,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');
    const sleepAmount = 2000;
    let enabled = false;
    let started = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Other',
            key: 'idle-beep-enabled',
            name: 'Idle beep',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('xhr', handleXhr);
    }

    function handleConfigStateChange(state, name) {
        enabled = state;
    }

    async function handleXhr(xhr) {
        if(!enabled) {
            return;
        }
        if(xhr.url.endsWith('startAction')) {
            started = true;
        }
        if(xhr.url.endsWith('stopAction')) {
            started = false;
            console.debug(`Triggering beep in ${sleepAmount}ms`);
            await util.sleep(sleepAmount);
            beep();
        }
    }

    function beep() {
        if(!started) {
            audio.play();
        }
    }

    initialise();

}
);
// itemHover
window.moduleRegistry.add('itemHover', (auth, configuration, itemCache, util) => {

    let enabled = false;
    let entered = false;
    let element;
    const converters = {
        SPEED: a => a/2,
        DURATION: a => util.secondsToDuration(a/10)
    }

    async function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'item-hover',
            name: 'Item hover info',
            default: true,
            handler: handleConfigStateChange
        });
        await setup();
        $(document).on('mouseenter', 'div.image > img', handleMouseEnter);
        $(document).on('mouseleave', 'div.image > img', handleMouseLeave);
        $(document).on('click', 'div.image > img', handleMouseLeave);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleMouseEnter(event) {
        if(!enabled || entered || !itemCache.byId) {
            return;
        }
        entered = true;
        const name = $(event.relatedTarget).find('.name').text();
        const nameMatch = itemCache.byName[name];
        if(nameMatch) {
            return show(nameMatch);
        }

        const parts = event.target.src.split('/');
        const lastPart = parts[parts.length-1];
        const imageMatch = itemCache.byImage[lastPart];
        if(imageMatch) {
            return show(imageMatch);
        }
    }

    function handleMouseLeave(event) {
        if(!enabled || !itemCache.byId) {
            return;
        }
        entered = false;
        hide();
    }

    function show(item) {
        element.find('.image').attr('src', `/assets/${item.image}`);
        element.find('.name').text(item.name);
        for(const attribute of itemCache.attributes) {
            let value = item.attributes[attribute.technicalName];
            if(converters[attribute.technicalName]) {
                value = converters[attribute.technicalName](value);
            }
            updateRow(attribute.technicalName, value);
        }
        element.show();
    }

    function updateRow(name, value) {
        if(!value) {
            element.find(`.${name}-row`).hide();
        } else {
            element.find(`.${name}`).text(value);
            element.find(`.${name}-row`).show();
        }
    }

    function hide() {
        element.hide();
    }

    async function setup() {
        await itemCache.ready;
        const attributesHtml = itemCache.attributes
            .map(a => `<div class='${a.technicalName}-row'><img src='${a.image}'/><span>${a.name}</span><span class='${a.technicalName}'/></div>`)
            .join('');
        $('head').append(`
            <style>
                #custom-item-hover {
                    position: fixed;
                    right: .5em;
                    top: .5em;
                    display: flex;
                    font-family: Jost,Helvetica Neue,Arial,sans-serif;
                    flex-direction: column;
                    white-space: nowrap;
                    z-index: 1;
                    background-color: black;
                    padding: .4rem;
                    border: 1px solid #3e3e3e;
                    border-radius: .4em;
                    gap: .4em;
                }
                #custom-item-hover > div {
                    display: flex;
                    gap: .4em;
                }
                #custom-item-hover > div > *:last-child {
                    margin-left: auto;
                }
                #custom-item-hover img {
                    width: 24px;
                    height: 24px;
                }
            </style>
        `);
        element = $(`
            <div id='custom-item-hover' style='display:none'>
                <div>
                    <img class='image'/>
                    <span class='name'/>
                </div>
                ${attributesHtml}
            </div>
        `);
        $('body').append(element);
    }

    initialise();

}
);
// marketFilter
window.moduleRegistry.add('marketFilter', (request, configuration, events, components, elementWatcher, Promise, util) => {

    let enabled = false;
    let conversionsByType = {};
    let savedFilters = [];
    let currentFilter = {
        listingType: 'SELL',
        type: 'None',
        amount: 0,
        key: 'SELL-None'
    };
    let listUpdatePromiseWrapper = null;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'market-filter',
            name: 'Market filter',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('xhr', handleXhr);

        $(document).on('mouseenter mouseleave click', '.saveFilterHoverTrigger', function(e) {
            switch(e.type) {
                case 'mouseenter':
                    if(currentFilter.type === 'None') {
                        return $('.saveFilterHover.search').addClass('greenOutline');
                    }
                    return $('.saveFilterHover:not(.search)').addClass('greenOutline');
                case 'mouseleave':
                case 'click':
                    return $('.saveFilterHover').removeClass('greenOutline');
            }
        });

        $(document).on('input', 'market-listings-component .search > input', clearFilter);
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(1)', async function() {
            currentFilter.listingType = 'SELL';
            showComponent();
            await applyFilter(currentFilter);
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(2)', async function() {
            currentFilter.listingType = 'BUY';
            showComponent();
            await applyFilter(currentFilter);
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(3)', async function() {
            await clearFilter();
            hideComponent();
        });

        window.$('head').append($(`
            <style>
                .greenOutline {
                    outline: 2px solid rgb(83, 189, 115) !important;
                }
            </style>
        `));
    }

    function handleConfigStateChange(state) {
        enabled = state;
        if(!enabled) {
            hideComponent();
        }
    }

    function handleXhr(xhr) {
        if(!enabled) {
            return;
        }
        if(!xhr.url.endsWith('getMarketItems')) {
            return;
        }
        update();
    }

    async function update() {
        const listingsContainer = $('market-listings-component .card')[0];
        if(!listingsContainer) {
            return;
        }
        const conversions = await request.getMarketConversion();
        conversionsByType = {};
        for(const conversion of conversions) {
            const typeKey = `${conversion.listingType}-${conversion.type}`;
            if(!conversionsByType[typeKey]) {
                conversionsByType[typeKey] = [];
            }
            conversion.key = `${conversion.name}-${conversion.price}`;
            conversionsByType[typeKey].push(conversion);
        }
        for(const type in conversionsByType) {
            if(type.startsWith('SELL-')) {
                conversionsByType[type].sort((a,b) => a.ratio - b.ratio);
            } else {
                conversionsByType[type].sort((a,b) => b.ratio - a.ratio);
            }
        }

        savedFilters = await request.getMarketFilters();

        $('market-listings-component .search').addClass('saveFilterHover');

        try {
            await elementWatcher.childAddedContinuous('market-listings-component .card', () => {
                if(listUpdatePromiseWrapper) {
                    listUpdatePromiseWrapper.resolve();
                    listUpdatePromiseWrapper = null;
                }
            })
        } catch(error) {
            console.warn(`Could probably not detect the market listing component, cause : ${error}`);
            return;
        }

        await clearFilter();
    }

    async function applyFilter(filter) {
        Object.assign(currentFilter, {search:null}, filter);
        currentFilter.key = `${currentFilter.listingType}-${currentFilter.type}`;
        if(currentFilter.type && currentFilter.type !== 'None') {
            await clearSearch();
        }
        syncListingsView();
    }

    async function clearSearch() {
        if(!$('market-listings-component .search > input').val()) {
            return;
        }
        listUpdatePromiseWrapper = new Promise.Expiring(5000);
        $('market-listings-component .search > .clear-button').click();
        return listUpdatePromiseWrapper.promise;
    }

    function syncListingsView() {
        const elements = $('market-listings-component .search ~ button').map(function(index,reference) {
            reference = $(reference);
            return {
                name: reference.find('.name').text(),
                price: util.parseNumber(reference.find('.cost').text()),
                reference: reference
            };
        }).toArray();
        for(const element of elements) {
            element.key = `${element.name}-${element.price}`;
        }
        if(currentFilter.search) {
            for(const element of elements) {
                element.reference.find('.ratio').remove();
                element.reference.show();
            }
            const searchReference = $('market-listings-component .search > input');
            searchReference.val(currentFilter.search);
            searchReference[0].dispatchEvent(new Event('input'));
            return;
        }
        let conversions = conversionsByType[currentFilter.key];
        if(!conversions) {
            for(const element of elements) {
                element.reference.find('.ratio').remove();
                element.reference.show();
            }
            return;
        }
        if(currentFilter.amount) {
            conversions = conversions.slice(0, currentFilter.amount);
        }
        const conversionsByKey = {};
        for(const conversion of conversions) {
            conversionsByKey[conversion.key] = conversion;
        }
        for(const element of elements) {
            element.reference.find('.ratio').remove();
            const match = conversionsByKey[element.key];
            if(match) {
                element.reference.show();
                element.reference.find('.amount').after(`<div class='ratio'>(${match.ratio.toFixed(2)})</div>`);
            } else {
                element.reference.hide();
            }
        }
    }

    async function clearFilter() {
        await applyFilter({
            type: 'None',
            amount: 0
        });
        syncCustomView();
    }

    async function saveFilter() {
        let filter = structuredClone(currentFilter);
        if(currentFilter.type === 'None') {
            filter.search = $('market-listings-component .search > input').val();
            if(!filter.search) {
                return;
            }
        }
        filter = await request.saveMarketFilter(filter);
        savedFilters.push(filter);
        componentBlueprint.selectedTabIndex = 0;
        syncCustomView();
    }

    async function removeFilter(filter) {
        await request.removeMarketFilter(filter.id);
        savedFilters = savedFilters.filter(a => a.id !== filter.id);
        syncCustomView();
    }

    function syncCustomView() {
        for(const option of components.search(componentBlueprint, 'filterDropdown').options) {
            option.selected = option.value === currentFilter.type;
        }
        components.search(componentBlueprint, 'amountInput').value = currentFilter.amount;
        components.search(componentBlueprint, 'savedFiltersTab').hidden = !savedFilters.length;
        if(!savedFilters.length) {
            componentBlueprint.selectedTabIndex = 1;
        }
        const savedFiltersSegment = components.search(componentBlueprint, 'savedFiltersSegment');
        savedFiltersSegment.rows = [];
        for(const savedFilter of savedFilters) {
            let text = `Type : ${savedFilter.type}`;
            if(savedFilter.amount) {
                text = `Type : ${savedFilter.amount} x ${savedFilter.type}`;
            }
            if(savedFilter.search) {
                text = `Search : ${savedFilter.search}`;
            }
            savedFiltersSegment.rows.push({
                type: 'buttons',
                buttons: [{
                    text: text,
                    size: 3,
                    color: 'primary',
                    action: async function() {
                        await applyFilter(savedFilter);
                        syncCustomView();
                    }
                },{
                    text: 'Remove',
                    color: 'danger',
                    action: removeFilter.bind(null,savedFilter)
                }]
            });
        }
        showComponent();
    }

    function hideComponent() {
        components.removeComponent(componentBlueprint);
    }

    function showComponent() {
        componentBlueprint.prepend = screen.width < 750;
        components.addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId : 'marketFilterComponent',
        dependsOn: 'market-page',
        parent : 'market-listings-component > .groups > :last-child',
        prepend: false,
        selectedTabIndex : 0,
        tabs : [{
            id: 'savedFiltersTab',
            title : 'Saved filters',
            hidden: true,
            rows: [{
                type: 'segment',
                id: 'savedFiltersSegment',
                rows: []
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Clear filter',
                    color: 'warning',
                    action: async function() {
                        await clearFilter();
                        await clearSearch();
                    }
                }]
            }]
        }, {
            title : 'Filter',
            rows: [{
                type: 'dropdown',
                id: 'filterDropdown',
                action: type => applyFilter({type}),
                class: 'saveFilterHover',
                options: [{
                    text: 'None',
                    value: 'None',
                    selected: false
                }, {
                    text: 'Food',
                    value: 'Food',
                    selected: false
                }, {
                    text: 'Charcoal',
                    value: 'Charcoal',
                    selected: false
                }, {
                    text: 'Compost',
                    value: 'Compost',
                    selected: false
                }]
            }, {
                type: 'input',
                id: 'amountInput',
                name: 'Amount',
                value: '',
                inputType: 'number',
                action: amount => applyFilter({amount:+amount}),
                class: 'saveFilterHover'
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Save filter',
                    action: saveFilter,
                    color: 'success',
                    class: 'saveFilterHoverTrigger'
                }]
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Clear filter',
                    color: 'warning',
                    action: async function() {
                        await clearFilter();
                        await clearSearch();
                    }
                }]
            }]
        }]
    };

    initialise();

}
);
// recipeClickthrough
window.moduleRegistry.add('recipeClickthrough', (request, configuration, util) => {

    let enabled = false;
    let recipeCacheByName;
    let recipeCacheByImage;
    let element;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'recipe-click',
            name: 'Recipe clickthrough',
            default: true,
            handler: handleConfigStateChange
        });
        $(document).on('click', 'div.image > img', handleClick);
    }

    function handleConfigStateChange(state) {
        enabled = state;
        setupRecipeCache();
    }

    async function setupRecipeCache() {
        if(!enabled || recipeCacheByName) {
            return;
        }
        recipeCacheByName = {};
        recipeCacheByImage = {};
        const recipes = await request.listRecipes();
        for(const recipe of recipes) {
            if(!recipeCacheByName[recipe.name]) {
                recipeCacheByName[recipe.name] = recipe;
            }
            const lastPart = recipe.image.split('/').at(-1);
            if(!recipeCacheByImage[lastPart]) {
                recipeCacheByImage[lastPart] = recipe;
            }
        }
    }

    function handleClick(event) {
        if(!enabled || !recipeCacheByName) {
            return;
        }
        if($(event.currentTarget).closest('button').length) {
            return;
        }
        event.stopPropagation();
        const name = $(event.relatedTarget).find('.name').text();
        const nameMatch = recipeCacheByName[name];
        if(nameMatch) {
            return followRecipe(nameMatch);
        }

        const parts = event.target.src.split('/');
        const lastPart = parts[parts.length-1];
        const imageMatch = recipeCacheByImage[lastPart];
        if(imageMatch) {
            return followRecipe(imageMatch);
        }
    }

    function followRecipe(recipe) {
        util.goToPage(recipe.url);
    }

    initialise();

}
);
// skillOverviewPage
window.moduleRegistry.add('skillOverviewPage', (pages, components, elementWatcher, skillCache, userCache, events, util, configuration) => {

    const registerUserCacheHandler = events.register.bind(null, 'userCache');

    const PAGE_NAME = 'Skill overview';
    const SKILL_COUNT = 13;
    const MAX_LEVEL = 100;
    const MAX_TOTAL_LEVEL = SKILL_COUNT * MAX_LEVEL;
    const MAX_TOTAL_EXP = SKILL_COUNT * util.levelToExp(MAX_LEVEL);

    let skillProperties = null;
    let skillTotalLevel = null;
    let skillTotalExp = null;

    async function initialise() {
        registerUserCacheHandler(handleUserCache);
        await pages.register({
            category: 'Skills',
            name: PAGE_NAME,
            image: 'https://cdn-icons-png.flaticon.com/128/1160/1160329.png',
            columns: '2',
            render: renderPage
        });
        configuration.registerCheckbox({
            category: 'Pages',
            key: 'skill-overview-enabled',
            name: 'Skill Overview',
            default: true,
            handler: handleConfigStateChange
        });

        await setupSkillProperties();
        await handleUserCache();
    }

    async function setupSkillProperties() {
        await skillCache.ready;
        await userCache.ready;
        skillProperties = [];
        const skillIds = Object.keys(userCache.exp);
        for(const id of skillIds) {
            if(!skillCache.byId[id]) {
                continue;
            }
            skillProperties.push({
                id: id,
                name: skillCache.byId[id].name,
                image: skillCache.byId[id].image,
                color: skillCache.byId[id].color,
                defaultActionId: skillCache.byId[id].defaultActionId,
                maxLevel: MAX_LEVEL,
                showExp: true,
                showLevel: true
            });
        }
        skillProperties.push(skillTotalLevel = {
            id: skillCache.byName['Total-level'].id,
            name: 'Total Level',
            image: skillCache.byName['Total-level'].image,
            color: skillCache.byName['Total-level'].color,
            maxLevel: MAX_TOTAL_LEVEL,
            showExp: false,
            showLevel: true
        });
        skillProperties.push(skillTotalExp = {
            id: skillCache.byName['Total-exp'].id,
            name: 'Total Exp',
            image: skillCache.byName['Total-exp'].image,
            color: skillCache.byName['Total-exp'].color,
            maxLevel: MAX_TOTAL_EXP,
            showExp: true,
            showLevel: false
        });
    }

    function handleConfigStateChange(state, name) {
        if(state) {
            pages.show(PAGE_NAME);
        } else {
            pages.hide(PAGE_NAME);
        }
    }

    async function handleUserCache() {
        if(!skillProperties) {
            return;
        }
        await userCache.ready;

        let totalExp = 0;
        let totalLevel = 0;
        for(const skill of skillProperties) {
            if(skill.id <= 0) {
                continue;
            }
            let exp = userCache.exp[skill.id];
            skill.exp = util.expToCurrentExp(exp);
            skill.level = util.expToLevel(exp);
            skill.expToLevel = util.expToNextLevel(exp);
            totalExp += Math.min(exp, 12_000_000);
            totalLevel += Math.min(skill.level, 100);
        }

        skillTotalExp.exp = totalExp;
        skillTotalExp.level = totalExp;
        skillTotalExp.expToLevel = MAX_TOTAL_EXP - totalExp;
        skillTotalLevel.exp = totalLevel;
        skillTotalLevel.level = totalLevel;
        skillTotalLevel.expToLevel = MAX_TOTAL_LEVEL - totalLevel;

        pages.requestRender(PAGE_NAME);
    }

    async function renderPage() {
        if(!skillProperties) {
            return;
        }
        await elementWatcher.exists(componentBlueprint.dependsOn);

        let column = 0;

        for(const skill of skillProperties) {
            componentBlueprint.componentId = 'skillOverviewComponent_' + skill.name;
            componentBlueprint.parent = '.column' + column;
            if(skill.defaultActionId) {
                componentBlueprint.onClick = util.goToPage.bind(null, `/skill/${skill.id}/action/${skill.defaultActionId}`);
            } else {
                delete componentBlueprint.onClick;
            }
            column = 1 - column; // alternate columns

            const skillHeader = components.search(componentBlueprint, 'skillHeader');
            skillHeader.title = skill.name;
            skillHeader.image = `/assets/${skill.image}`;
            if(skill.showLevel) {
                skillHeader.textRight = `Lv. ${skill.level} <span style='color: #aaa'>/ ${skill.maxLevel}</span>`;
            } else {
                skillHeader.textRight = '';
            }


            const skillProgress = components.search(componentBlueprint, 'skillProgress');
            if(skill.showExp) {
                skillProgress.progressText = `${util.formatNumber(skill.exp)} / ${util.formatNumber(skill.exp + skill.expToLevel)} XP`;
            } else {
                skillProgress.progressText = '';
            }
            skillProgress.progressPercent = Math.floor(skill.exp / (skill.exp + skill.expToLevel) * 100);
            skillProgress.color = skill.color;

            components.addComponent(componentBlueprint);
        }
    }

    const componentBlueprint = {
        componentId: 'skillOverviewComponent',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [
            {
                title: 'Skillname',
                rows: [
                    {
                        id: 'skillHeader',
                        type: 'header',
                        title: 'Forging',
                        image: '/assets/misc/merchant.png',
                        textRight: `Lv. 69 <span style='color: #aaa'>/ 420</span>`
                    },
                    {
                        id: 'skillProgress',
                        type: 'progress',
                        progressText: '301,313 / 309,469 XP',
                        progressPercent: '97'
                    }
                ]
            },
        ]
    };

    initialise();
}
);
// syncWarningPage
window.moduleRegistry.add('syncWarningPage', (auth, pages, components, util) => {

    const PAGE_NAME = 'Plugin not synced';
    const STARTED = new Date().getTime();

    async function initialise() {
        await addSyncedPage();
        const intervalReference = window.setInterval(pages.requestRender.bind(null, PAGE_NAME), 1000);
        await auth.ready;
        clearInterval(intervalReference);
        removeSyncedPage();
    }

    async function addSyncedPage() {
        await pages.register({
            category: 'Character',
            name: PAGE_NAME,
            image: 'https://cdn-icons-png.flaticon.com/512/6119/6119820.png',
            columns: 3,
            render: renderPage
        });
        pages.show(PAGE_NAME);
    }

    function removeSyncedPage() {
        pages.hide(PAGE_NAME);
    }

    function renderPage() {
        const millisElapsed = new Date().getTime() - STARTED;
        const timer = util.secondsToDuration(60 * 15 - millisElapsed/1000);
        const texts = [
            'For the Pancake-Scripts plugin to work correctly, it needs to be up and running as fast as possible after the page loaded.',
            'If you see this message, it was not fast enough, and you may need to wait up to 15 minutes for the plugin to work correctly.',
            'If you used the plugin succesfully before, and this is the first time you see this message, it may just be a one-off issue, and you can try refreshing your page.',
            'Some things you can do to make the plugin load faster next time:',
            '* Place the script at the top of all of your scripts. They are evaluated in order.',
            '* Double check that "@run-at" is set to "document-start"',
            'Estimated time until the next authentication check-in : ' + timer,
            'If you still see this after the above timer runs out, feel free to contact @pancake.lord on Discord'
        ];

        for(const index in texts) {
            componentBlueprint.componentId = 'authWarningComponent_' + index;
            components.search(componentBlueprint, 'infoField').name = texts[index];
            components.addComponent(componentBlueprint);
        }
    }

    const componentBlueprint = {
        componentId: 'authWarningComponent',
        dependsOn: 'custom-page',
        parent: '.column1',
        selectedTabIndex: 0,
        tabs: [
            {
                title: 'Info',
                rows: [
                    {
                        id: 'infoField',
                        type: 'item',
                        name: ''
                    }
                ]
            },
        ]
    };

    initialise();

}
);
// ui
window.moduleRegistry.add('ui', (configuration) => {

    const id = crypto.randomUUID();
    const sections = [
        //'inventory-page',
        'equipment-page',
        'home-page',
        'merchant-page',
        'market-page',
        'daily-quest-page',
        'quest-shop-page',
        'skill-page',
        'upgrade-page',
        'leaderboards-page',
        'changelog-page',
        'settings-page',
        'guild-page'
    ].join(', ');
    const selector = `:is(${sections})`;
    let gap

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'ui-changes',
            name: 'UI changes',
            default: false,
            handler: handleConfigStateChange
        });
    }

    function handleConfigStateChange(state) {
        if(state) {
            add();
        } else {
            remove();
        }
    }

    function add() {
        document.documentElement.style.setProperty('--gap', '8px');
        const element = $(`
            <style>
                ${selector} :not(.multi-row) > :is(
                    button.item,
                    button.row,
                    button.socket-button,
                    button.level-button,
                    div.item,
                    div.row
                ) {
                    padding: 2px 6px !important;
                    min-height: 0 !important;
                    min-width: 0 !important;
                }

                ${selector} :not(.multi-row) > :is(
                    button.item div.image,
                    button.row div.image,
                    div.item div.image,
                    div.item div.placeholder-image,
                    div.row div.image
                ) {
                    height: 32px !important;
                    width: 32px !important;
                    min-height: 0 !important;
                    min-width: 0 !important;
                }

                action-component div.body >  div.image,
                produce-component div.body > div.image,
                daily-quest-page div.body > div.image {
                    height: 48px !important;
                    width: 48px !important;
                }

                div.progress div.body {
                    padding: 8px !important;
                }

                action-component div.bars {
                    padding: 0 !important;
                }

                equipment-component button {
                    padding: 0 !important;
                }

                inventory-page .items {
                    grid-gap: 0 !important;
                }

                div.scroll.custom-scrollbar .header,
                div.scroll.custom-scrollbar button {
                    height: 28px !important;
                }

                div.scroll.custom-scrollbar img {
                    height: 16px !important;
                    width: 16px !important;
                }

                .scroll {
                    overflow-y: auto !important;
                }
                .scroll {
                    -ms-overflow-style: none;  /* Internet Explorer 10+ */
                    scrollbar-width: none;  /* Firefox */
                }
                .scroll::-webkit-scrollbar {
                    display: none;  /* Safari and Chrome */
                }
            </style>
        `).attr('id', id);
        window.$('head').append(element);
    }

    function remove() {
        document.documentElement.style.removeProperty('--gap');
        $(`#${id}`).remove();
    }

    initialise();

}
);
// versionWarning
window.moduleRegistry.add('versionWarning', (events, request, toast) => {

    function initialise() {
        events.register('xhr', handleXhr);
    }

    async function handleXhr(xhr) {
        if(!xhr.url.endsWith('/getUser')) {
            return;
        }
        const version = await request.getVersion();
        if(!window.PANCAKE_VERSION || version === window.PANCAKE_VERSION) {
            return;
        }
        toast.create({
            text: `<a href='https://greasyfork.org/en/scripts/475356-ironwood-rpg-pancake-scripts' target='_blank'>Consider updating Pancake-Scripts to ${version}!<br>Click here to go to GreasyFork</a`,
            image: 'https://img.icons8.com/?size=48&id=iAqIpjeFjcYz&format=png',
            time: 5000
        });
    }

    initialise();

}
);
// webhooksRegistry
window.moduleRegistry.add('webhooksRegistry', (webhooks) => {

    function initialise() {
        webhooks.register('webhook-update', 'Update', 'UPDATE');
        webhooks.register('webhook-guild', 'Guild', 'GUILD');
    }

    initialise();

}
);
window.moduleRegistry.build();
