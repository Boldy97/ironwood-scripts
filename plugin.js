// ==UserScript==
// @name         Ironwood RPG - Pancake-Scripts
// @namespace    http://tampermonkey.net/
// @version      4.2.1
// @description  A collection of scripts to enhance Ironwood RPG - https://github.com/Boldy97/ironwood-scripts
// @author       Pancake
// @match        https://ironwoodrpg.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ironwoodrpg.com
// @grant        none
// @require      https://code.jquery.com/jquery-3.6.4.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.js
// ==/UserScript==

window.PANCAKE_ROOT = 'https://iwrpg.vectordungeon.com';
window.PANCAKE_VERSION = '4.2.1';
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
    }

    function get(name) {
        return modules[name] || null;
    }

    async function build() {
        for(const module of Object.values(modules)) {
            await buildModule(module);
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

    async function buildModule(module, partial, chain) {
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
            const built = await buildModule(dependency.module, partial, chain);
            if(!built) {
                return false;
            }
        }

        const parameters = module.dependencies.map(a => a.module?.reference);
        try {
            module.reference = await module.initialiser.apply(null, parameters);
        } catch(e) {
            console.error(`Failed building ${module.name}`, e);
            return false;
        }
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
window.moduleRegistry.add('components', (elementWatcher, colorMapper, elementCreator, localDatabase, Promise) => {

    const exports = {
        addComponent,
        removeComponent,
        search
    };

    const initialised = new Promise.Expiring(2000);
    const STORE_NAME = 'component-tabs';
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
    let selectedTabs = null;

    async function initialise() {
        elementCreator.addStyles(styles);
        selectedTabs = await localDatabase.getAllEntries(STORE_NAME);
        initialised.resolve(exports);
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
        const selectedTabMatch = selectedTabs.find(a => a.key === blueprint.componentId);
        if(selectedTabMatch) {
            blueprint.selectedTabIndex = selectedTabMatch.value;
            selectedTabs = selectedTabs.filter(a => a.key !== blueprint.componentId);
        }
        const theTabs = createTab(blueprint);
        component.append(theTabs);

        // PAGE
        const selectedTabBlueprint = blueprint.tabs[blueprint.selectedTabIndex] || blueprint.tabs[0];
        selectedTabBlueprint.rows.forEach((rowBlueprint, index) => {
            component.append(createRow(rowBlueprint));
        });

        const existing = $(`#${blueprint.componentId}`);
        if(existing.length) {
            existing.replaceWith(component);
        } else if(blueprint.prepend) {
            $(blueprint.parent).prepend(component);
        } else {
            $(blueprint.parent).append(component);
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
        const parentRow = $('<div/>').addClass('customRow');
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
                        if(inputBlueprint.action) {
                            inputBlueprint.action(inputBlueprint.value);
                        }
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
        const parentRow = $('<div/>').addClass('customRow');
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
        const parentRow = $('<div/>').addClass('customRow');
        const select = $('<select/>')
            .addClass('myItemSelect')
            .addClass(selectBlueprint.class || '')
            .change(inputDelay(function(e) {
                for(const option of selectBlueprint.options) {
                    option.selected = this.value === option.value;
                }
                if(selectBlueprint.action) {
                    selectBlueprint.action(this.value);
                }
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
                                if(checkboxBlueprint.action) {
                                    checkboxBlueprint.action(checkboxBlueprint.checked);
                                }
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
        localDatabase.saveEntry(STORE_NAME, {
            key: blueprint.componentId,
            value: index
        });
        selectedTabs = selectedTabs.filter(a => a.key !== blueprint.componentId);
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
            /*padding: 5px 12px 5px 6px;*/
            min-height: 0px;
            min-width: 0px;
            gap: var(--margin);
            padding: calc(var(--gap) / 2) var(--gap);
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

    return initialised;

}
);
// configuration
window.moduleRegistry.add('configuration', (Promise, configurationStore) => {

    const exports = {
        registerCheckbox,
        registerInput,
        registerDropdown,
        registerJson,
        items: []
    };

    const configs = configurationStore.getConfigs();

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
        let initialValue;
        if(item.key in configs) {
            initialValue = configs[item.key];
        } else {
            initialValue = item.default;
        }
        item.handler(initialValue, true);
        exports.items.push(item);
        return item;
    }

    async function save(item, value) {
        if(item.type === 'toggle') {
            value = !!value;
        }
        if(item.type === 'input' || item.type === 'json') {
            value = JSON.stringify(value);
        }
        await configurationStore.save(item.key, value);
    }

    function validate(item, keys) {
        for(const key of keys) {
            if(!(key in item)) {
                throw `Missing ${key} while registering a configuration item`;
            }
        }
    }

    return exports;

}
);
// Distribution
window.moduleRegistry.add('Distribution', () => {

    class Distribution {

        #map = new Map();

        constructor(initial) {
            if(initial) {
                this.add(initial, 1);
            }
        }

        add(value, probability) {
            if(this.#map.has(value)) {
                this.#map.set(value, this.#map.get(value) + probability);
            } else {
                this.#map.set(value, probability);
            }
        }

        addDistribution(other, weight) {
            other.#map.forEach((probability, value) => {
                this.add(value, probability * weight);
            });
        }

        convolution(other, multiplier) {
            const old = this.#map;
            this.#map = new Map();
            old.forEach((probability, value) => {
                other.#map.forEach((probability2, value2) => {
                    this.add(multiplier(value, value2), probability * probability2);
                });
            });
        }

        convolutionWithGenerator(generator, multiplier) {
            const result = new Distribution();
            this.#map.forEach((probability, value) => {
                const other = generator(value);
                other.#map.forEach((probability2, value2) => {
                    result.add(multiplier(value, value2), probability * probability2);
                });
            });
            return result;
        }

        count() {
            return this.#map.size;
        }

        average() {
            let result = 0;
            this.#map.forEach((probability, value) => {
                result += value * probability;
            });
            return result;
        }

        sum() {
            let result = 0;
            this.#map.forEach(probability => {
                result += probability;
            });
            return result;
        }

        min() {
            return Array.from(this.#map, ([k, v]) => k).reduce((a,b) => Math.min(a,b), Infinity);
        }

        max() {
            return Array.from(this.#map, ([k, v]) => k).reduce((a,b) => Math.max(a,b), -Infinity);
        }

        variance() {
            let result = 0;
            const average = this.average();
            this.#map.forEach((probability, value) => {
                const dist = average - value;
                result += dist * dist * probability;
            });
            return result;
        }

        normalize() {
            const sum = this.sum();
            this.#map = new Map(Array.from(this.#map, ([k, v]) => [k, v / sum]));
        }

        expectedRollsUntill(limit) {
            const x = (this.count() - 1) / 2.0;
            const y = x * (x + 1) * (2 * x + 1) / 6;
            const z = 2*y / this.variance();
            const average = this.average();
            const a = y + average * (average - 1) * z / 2;
            const b = z * average * average;
            return limit / average + a / b;
        }

        clone() {
            const result = new Distribution();
            result.#map = new Map(this.#map);
            return result;
        }

        getLeftTail(rolls, cutoff) {
            const mean = rolls * this.average();
            const variance = rolls * this.variance();
            const stdev = Math.sqrt(variance);
            return Distribution.cdf(cutoff, mean, stdev);
        }

        getRightTail(rolls, cutoff) {
            return 1 - this.getLeftTail(rolls, cutoff);
        }

        getRange(rolls, left, right) {
            return 1 - this.getLeftTail(rolls, left) - this.getRightTail(rolls, right);
        }

        getMeanLeftTail(rolls, cutoff) {
            return this.getMeanRange(rolls, -Infinity, cutoff);
        }

        getMeanRightTail(rolls, cutoff) {
            return this.getMeanRange(rolls, cutoff, Infinity);
        }

        getMeanRange(rolls, left, right) {
            const mean = rolls * this.average();
            const variance = rolls * this.variance();
            const stdev = Math.sqrt(variance);
            const alpha = (left - mean) / stdev;
            const beta = (right - mean) / stdev;
            const c = Distribution.pdf(beta) - Distribution.pdf(alpha);
            const d = Distribution.cdf(beta, 0, 1) - Distribution.cdf(alpha, 0, 1);
            if(!c || !d) {
                return (left + right) / 2;
            }
            return mean - stdev * c / d;
        }

        toChart(other) {
            if(other) {
                const min = Math.min(this.min(), other.min());
                const max = Math.max(this.max(), other.max());
                for(let i=min;i<=max;i++) {
                    if(!this.#map.has(i)) {
                        this.#map.set(i, 0);
                    }
                }
            }
            const result = Array.from(this.#map, ([k, v]) => ({x:k,y:v}));
            result.sort((a,b) => a.x - b.x);
            return result;
        }

        redistribute(value, exceptions) {
            // redistributes this single value across all others, except the exceptions
            const probability = this.#map.get(value);
            if(!probability) {
                return;
            }
            this.#map.delete(value);

            let sum = 0;
            this.#map.forEach((p, v) => {
                if(!exceptions.includes(v)) {
                    sum += p;
                }
            });
            this.#map.forEach((p, v) => {
                if(!exceptions.includes(v)) {
                    this.#map.set(v, p + probability*p/sum);
                }
            });
        }

    };

    Distribution.getRandomChance = function(probability) {
        const result = new Distribution();
        result.add(true, probability);
        result.add(false, 1-probability);
        return result;
    };

    // probability density function -> probability mass function
    Distribution.getRandomOutcomeFloored = function(min, max) {
        const result = new Distribution();
        const rangeMult = 1 / (max - min);
        for(let value=Math.floor(min); value<max; value++) {
            let lower = value;
            let upper = value + 1;
            if(lower < min) {
                lower = min;
            }
            if(upper > max) {
                upper = max;
            }
            result.add(value, (upper - lower) * rangeMult);
        }
        return result;
    };

    Distribution.getRandomOutcomeRounded = function(min, max) {
        return Distribution.getRandomOutcomeFloored(min + 0.5, max + 0.5);
    }

    // Cumulative Distribution Function
    // https://stackoverflow.com/a/59217784
    Distribution.cdf = function(value, mean, std) {
        const z = (value - mean) / std;
        const t = 1 / (1 + .2315419 * Math.abs(z));
        const d =.3989423 * Math.exp( -z * z / 2);
        let prob = d * t * (.3193815 + t * ( -.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        if(z > 0 ) {
            prob = 1 - prob;
        }
        return prob
    };

    Distribution.pdf = function(zScore) {
        return (Math.E ** (-zScore*zScore/2)) / Math.sqrt(2 * Math.PI);
    };

    return Distribution;

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
        childAddedContinuous,
        idle
    }

    const $ = window.$;

    async function exists(selector, delay, timeout, inverted) {
        delay = delay !== undefined ? delay : 10;
        timeout = timeout !== undefined ? timeout : 5000;
        const promiseWrapper = new Promise.Checking(() => {
            let result = $(selector)[0];
            return inverted ? !result : result;
        }, delay, timeout);
        return promiseWrapper;
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

        return promiseWrapper;
    }

    async function childAddedContinuous(selector, callback) {
        const parent = await exists(selector);
        const observer = new MutationObserver(function(mutations, observer) {
            if(mutations.find(a => a.addedNodes?.length)) {
                callback();
            }
        });
        observer.observe(parent, { childList: true });
    }

    async function idle() {
        const promise = new Promise.Expiring(1000);
        window.requestIdleCallback(() => {
            promise.resolve();
        });
        return promise;
    }

    return exports;

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
        registerInterceptorUrlChange();
        events.emit('url', window.location.href);
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
// itemUtil
window.moduleRegistry.add('itemUtil', (util, itemCache) => {

    const exports = {
        extractItem
    };

    function extractItem(element, target, ignoreMissing) {
        element = $(element);
        const name = element.find('.name').text();
        let item = itemCache.byName[name];
        if(!item) {
            const src = element.find('img').attr('src');
            if(src) {
                const image = src.split('/').at(-1);
                item = itemCache.byImage[image];
            }
        }
        if(!item) {
            if(!ignoreMissing) {
                console.warn(`Could not find item with name [${name}]`);
            }
            return false;
        }
        let amount = 1;
        let amountElements = element.find('.amount, .value');
        if(amountElements.length) {
            amount = amountElements.text();
            if(!amount) {
                return false;
            }
            if(amount.includes(' / ')) {
                amount = amount.split(' / ')[0];
            }
            amount = util.parseNumber(amount);
        }
        let uses = element.find('.uses, .use').text();
        if(uses && !uses.endsWith('HP')) {
            amount += util.parseNumber(uses);
        }
        target[item.id] = (target[item.id] || 0) + amount;
        return item;
    }

    return exports;

}
);
// localDatabase
window.moduleRegistry.add('localDatabase', (Promise) => {

    const exports = {
        getAllEntries,
        saveEntry,
        removeEntry
    };

    const initialised = new Promise.Expiring(2000);
    let database = null;

    const databaseName = 'PancakeScripts';

    function initialise() {
        const request = window.indexedDB.open(databaseName, 4);
        request.onsuccess = function(event) {
            database = this.result;
            initialised.resolve(exports);
        };
        request.onerror = function(event) {
            console.error(`Failed creating IndexedDB : ${event.target.errorCode}`);
        };
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if(event.oldVersion <= 0) {
                console.debug('Creating IndexedDB');
                db
                    .createObjectStore('settings', { keyPath: 'key' })
                    .createIndex('key', 'key', { unique: true });
            }
            if(event.oldVersion <= 1) {
                db
                    .createObjectStore('sync-tracking', { keyPath: 'key' })
                    .createIndex('key', 'key', { unique: true });
            }
            if(event.oldVersion <= 2) {
                db
                    .createObjectStore('market-filters', { keyPath: 'key' })
                    .createIndex('key', 'key', { unique: true });
            }
            if(event.oldVersion <= 3) {
                db
                    .createObjectStore('component-tabs', { keyPath: 'key' })
                    .createIndex('key', 'key', { unique: true });
            }
        };
    }

    async function getAllEntries(storeName) {
        const result = new Promise.Expiring(1000);
        const entries = [];
        const store = database.transaction(storeName, 'readonly').objectStore(storeName);
        const request = store.openCursor();
        request.onsuccess = function(event) {
            const cursor = event.target.result;
            if(cursor) {
                entries.push(cursor.value);
                cursor.continue();
            } else {
                result.resolve(entries);
            }
        };
        request.onerror = function(event) {
            result.reject(event.error);
        };
        return result;
    }

    async function saveEntry(storeName, entry) {
        const result = new Promise.Expiring(1000);
        const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
        const request = store.put(entry);
        request.onsuccess = function(event) {
            result.resolve();
        };
        request.onerror = function(event) {
            result.reject(event.error);
        };
        return result;
    }

    async function removeEntry(storeName, key) {
        const result = new Promise.Expiring(1000);
        const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = function(event) {
            result.resolve();
        };
        request.onerror = function(event) {
            result.reject(event.error);
        };
        return result;
    }

    initialise();

    return initialised;

}
);
// pageDetector
window.moduleRegistry.add('pageDetector', (events, elementWatcher, util) => {

    const registerUrlHandler = events.register.bind(null, 'url');
    const emitEvent = events.emit.bind(null, 'page');

    async function initialise() {
        registerUrlHandler(util.debounce(handleUrl, 200));
    }

    async function handleUrl(url) {
        let result = null;
        const parts = url.split('/');
        if(url.includes('/skill/') && url.includes('/action/')) {
            result = {
                type: 'action',
                skill: +parts[parts.length-3],
                action: +parts[parts.length-1]
            };
        } else if(url.includes('house/build')) {
            result = {
                type: 'structure',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/enhance')) {
            result = {
                type: 'enhancement',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/produce')) {
            result = {
                type: 'automation',
                structure: +parts[parts.length-2],
                action: +parts[parts.length-1]
            };
        } else {
            result = {
                type: parts.pop()
            };
        }
        await elementWatcher.idle();
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
        hide,
        open: visitPage
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
                .click(() => visitPage(page.name))
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

    async function visitPage(name) {
        const page = pages.find(p => p.name === name);
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
            headerName = skillCache.byId[page.skill].displayName;
        } else if(page.type === 'structure') {
            headerName = 'House';
        } else if(page.type === 'enhancement') {
            headerName = 'House';
        } else if(page.type === 'automation') {
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
        #promise;
        resolve;
        reject;
        constructor() {
            this.#promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            }).catch(error => {
                if(error) {
                    console.warn(error);
                }
                throw error;
            });
        }

        then() {
            this.#promise.then.apply(this.#promise, arguments);
            return this;
        }

        catch() {
            this.#promise.catch.apply(this.#promise, arguments);
            return this;
        }

        finally() {
            this.#promise.finally.apply(this.#promise, arguments);
            return this;
        }
    }

    class Delayed extends Deferred {
        constructor(timeout) {
            super();
            const timeoutReference = window.setTimeout(() => {
                this.resolve();
            }, timeout);
            this.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Expiring extends Deferred {
        constructor(timeout) {
            super();
            if(timeout <= 0) {
                return;
            }
            const timeoutReference = window.setTimeout(() => {
                this.reject(`Timed out after ${timeout} ms`);
            }, timeout);
            this.finally(() => {
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
            this.finally(() => {
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
window.moduleRegistry.add('request', () => {

    async function request(url, body, headers) {
        if(!headers) {
            headers = {};
        }
        headers['Content-Type'] = 'application/json';
        const method = body ? 'POST' : 'GET';
        try {
            if(body) {
                body = JSON.stringify(body);
            }
            const fetchResponse = await fetch(`${window.PANCAKE_ROOT}/${url}`, {method, headers, body});
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

    // alphabetical

    request.listActions = () => request('public/list/action');
    request.listDrops = () => request('public/list/drop');
    request.listItems = () => request('public/list/item');
    request.listItemAttributes = () => request('public/list/itemAttribute');
    request.listIngredients = () => request('public/list/ingredient');
    request.listMonsters = () => request('public/list/monster');
    request.listRecipes = () => request('public/list/recipe');
    request.listSkills = () => request('public/list/skill');
    request.listStructures = () => request('public/list/structure');

    request.getChangelogs = () => request('public/settings/changelog');
    request.getVersion = () => request('public/settings/version');

    return request;

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
        const notificationId = `customNotification_${Math.floor(Date.now() * Math.random())}`
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
// util
window.moduleRegistry.add('util', () => {

    const exports = {
        levelToExp,
        expToLevel,
        expToCurrentExp,
        expToNextLevel,
        expToNextTier,
        tierToLevel,
        formatNumber,
        parseNumber,
        secondsToDuration,
        parseDuration,
        divmod,
        sleep,
        goToPage,
        compareObjects,
        debounce
    };

    function levelToExp(level) {
        if(level === 1) {
            return 0;
        }
        if(level <= 100) {
            return Math.floor(Math.pow(level, 3.5) * 6 / 5);
        }
        return Math.floor(12_000_000 + 829_554 * Math.pow(level - 100, 1.5379561415));
    }

    function expToLevel(exp) {
        if(exp <= 0) {
            return 1;
        }
        if(exp <= 12_000_000) {
            return Math.floor(Math.pow((exp + 1) / 1.2, 1 / 3.5));
        }
        return 100 + Math.floor(Math.pow((exp + 1 - 12_000_000) / 829554, 1 / 1.5379561415));
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

    function tierToLevel(tier) {
        if(tier <= 1) {
            return tier;
        }
        return tier * 15 - 20;
    }

    function formatNumber(number) {
        let digits = 2;
        if(number < .1 && number > -.1) {
            digits = 3;
        }
        if(number < .01 && number > -.01) {
            digits = 4;
        }
        return number.toLocaleString(undefined, {maximumFractionDigits:digits});
    }

    function parseNumber(text) {
        if(!text) {
            return 0;
        }
        const regexMatch = /\d+.*/.exec(text);
        if(!regexMatch) {
            return 0;
        }
        text = regexMatch[0];
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
        result += `${seconds}s`;

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

    function compareObjects(object1, object2) {
        const keys1 = Object.keys(object1);
        const keys2 = Object.keys(object2);
        if(keys1.length !== keys2.length) {
            return false;
        }
        keys1.sort();
        keys2.sort();
        for(let i=0;i<keys1.length;i++) {
            if(keys1[i] !== keys2[i]) {
                return false;
            }
            if(object1[keys1[i]] !== object2[keys2[i]]) {
                return false;
            }
        }
        return true;
    }

    function debounce(callback, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => {
                callback(...args);
            }, delay);
        }
    }

    return exports;

}
);
// enhancementsReader
window.moduleRegistry.add('enhancementsReader', (events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-enhancements');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'enhancement' && $('home-page .categories .category-active').text() === 'Enhance') {
            readEnhancementsScreen();
        }
    }

    function readEnhancementsScreen() {
        const enhancements = {};
        $('home-page .categories + .card button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const level = util.parseNumber(element.find('.level').text());
            enhancements[name] = level;
        });
        emitEvent({
            type: 'full',
            value: enhancements
        });
    }

    initialise();

}
);
// equipmentReader
window.moduleRegistry.add('equipmentReader', (events, itemCache, util, itemUtil) => {

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'equipment') {
            readEquipmentScreen();
        }
        if(page.type === 'action') {
            readActionScreen();
        }
    }

    function readEquipmentScreen() {
        const equipment = {};
        const activeTab = $('equipment-page .categories button[disabled]').text().toLowerCase();
        $('equipment-page .header + .items > .item > .description').parent().each((i,element) => {
            itemUtil.extractItem(element, equipment);
        });
        events.emit(`reader-equipment-${activeTab}`, {
            type: 'full',
            value: equipment
        });
    }

    function readActionScreen() {
        const equipment = {};
        $('skill-page .header > .name:contains("Consumables")').closest('.card').find('button > .name:not(.placeholder)').parent().each((i,element) => {
            itemUtil.extractItem(element, equipment);
        });
        events.emit('reader-equipment-equipment', {
            type: 'partial',
            value: equipment
        });
    }

    initialise();

}
);
// expReader
window.moduleRegistry.add('expReader', (events, skillCache, util) => {

    const emitEvent = events.emit.bind(null, 'reader-exp');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'action') {
            readActionScreen(page.skill);
        }
        readSidebar();
    }

    function readActionScreen(id) {
        const text = $('skill-page .header > .name:contains("Stats")')
            .closest('.card')
            .find('.row > .name:contains("Total"):contains("XP")')
            .closest('.row')
            .find('.value')
            .text();
        const exp = util.parseNumber(text);
        emitEvent([{ id, exp }]);
    }

    function readSidebar() {
        const levels = [];
        $('nav-component button.skill').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const id = skillCache.byName[name].id;
            const level = +(/\d+/.exec(element.find('.level').text())?.[0]);
            const exp = util.levelToExp(level);
            levels.push({ id, exp });
        });
        emitEvent(levels);
    }

    initialise();

}
);
// guildStructuresReader
window.moduleRegistry.add('guildStructuresReader', (events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-structures-guild');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'guild' && $('guild-page .tracker + div button.row-active').text() === 'Buildings') {
            readGuildStructuresScreen();
        }
    }

    function readGuildStructuresScreen() {
        const structures = {};
        $('guild-page .card').first().find('button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const level = util.parseNumber(element.find('.amount').text());
            structures[name] = level;
        });
        emitEvent({
            type: 'full',
            value: structures
        });
    }

    initialise();

}
);
// inventoryReader
window.moduleRegistry.add('inventoryReader', (events, itemCache, util, itemUtil) => {

    const emitEvent = events.emit.bind(null, 'reader-inventory');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'inventory') {
            readInventoryScreen();
        }
        if(page.type === 'action') {
            readActionScreen();
        }
    }

    function readInventoryScreen() {
        const inventory = {};
        $('inventory-page .items > .item').each((i,element) => {
            itemUtil.extractItem(element, inventory, true);
        });
        emitEvent({
            type: 'full',
            value: inventory
        });
    }

    function readActionScreen() {
        const inventory = {};
        $('skill-page .header > .name:contains("Materials")').closest('.card').find('.row').each((i,element) => {
            itemUtil.extractItem(element, inventory);
        });
        emitEvent({
            type: 'partial',
            value: inventory
        });
    }

    initialise();

}
);
// marketReader
window.moduleRegistry.add('marketReader', (events, elementWatcher, itemCache, util) => {

    const emitEvent = events.emit.bind(null, 'reader-market');
    let inProgress = false;

    const exports = {
        trigger: update
    };

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 10000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'market') {
            readMarketScreen();
        }
    }

    async function readMarketScreen() {
        if(inProgress) {
            return;
        }
        try {
            inProgress = true;
            const selectedTab = $('market-listings-component .card > .tabs > button.tab-active').text().toLowerCase();
            const type = selectedTab === 'orders' ? 'BUY' : selectedTab === 'listings' ? 'OWN' : 'SELL';
            await elementWatcher.exists('market-listings-component .search ~ button', undefined, 10000);
            if($('market-listings-component .search > input').val()) {
                return;
            }
            const listings = [];
            $('market-listings-component .search ~ button').each((i,element) => {
                element = $(element);
                const name = element.find('.name').text();
                const item = itemCache.byName[name];
                if(!item) {
                    return;
                }
                const amount = util.parseNumber(element.find('.amount').text());
                const price = util.parseNumber(element.find('.cost').text());
                const listingType = type !== 'OWN' ? type : element.find('.tag').length ? 'BUY' : 'SELL';
                const isOwn = !!element.attr('disabled');
                listings.push({
                    type: listingType,
                    item: item.id,
                    amount,
                    price,
                    isOwn,
                    element
                });
            });
            emitEvent({
                type,
                listings,
            });
        } catch(e) {
            console.error('error in market reader', e);
            return;
        } finally {
            inProgress = false;
        }
    }

    initialise();

    return exports;

}
);
// structuresReader
window.moduleRegistry.add('structuresReader', (events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-structures');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'structure' && $('home-page .categories .category-active').text() === 'Build') {
            readStructuresScreen();
        }
    }

    function readStructuresScreen() {
        const structures = {};
        $('home-page .categories + .card button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const level = util.parseNumber(element.find('.level').text());
            structures[name] = level;
        });
        emitEvent({
            type: 'full',
            value: structures
        });
    }

    initialise();

}
);
// variousReader
window.moduleRegistry.add('variousReader', (events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-various');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        const various = {};
        if(page.type === 'action') {
            readActionScreen(various, page.skill);
        }
        emitEvent(various);
    }

    function readActionScreen(various, skillId) {
        const amountText = $('skill-page .header > .name:contains("Loot")').parent().find('.amount').text();
        const amountValue = !amountText ? null : util.parseNumber(amountText.split(' / ')[1]) - util.parseNumber(amountText.split(' / ')[0]);
        various.maxAmount = {
            [skillId]: amountValue
        };
    }

    initialise();

}
);
// authToast
window.moduleRegistry.add('authToast', (toast) => {

    function initialise() {
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
        await loaded;
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
window.moduleRegistry.add('configurationPage', (pages, components, elementWatcher, configuration, elementCreator) => {

    const PAGE_NAME = 'Configuration';

    async function initialise() {
        await pages.register({
            category: 'Misc',
            after: 'Settings',
            name: PAGE_NAME,
            image: 'https://cdn-icons-png.flaticon.com/512/3953/3953226.png',
            columns: '2',
            render: renderPage
        });
        elementCreator.addStyles(styles);
        pages.show(PAGE_NAME);
    }

    function generateBlueprint() {
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
        const blueprints = [];
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
        return blueprints;
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

    function renderPage() {
        const blueprints = generateBlueprint();
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
// estimator
window.moduleRegistry.add('estimator', (configuration, events, skillCache, actionCache, itemCache, estimatorAction, estimatorOutskirts, estimatorActivity, estimatorCombat, components, util, statsStore) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'estimations',
            name: 'Estimations',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('state-stats', update);
        $(document).on('click', '.close', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update() {
        if(!enabled) {
            return;
        }
        const page = events.getLast('page');
        const stats = events.getLast('state-stats');
        if(!page || !stats || page.type !== 'action') {
            return;
        }
        const estimation = get(page.skill, page.action);
        if(estimation) {
            enrichTimings(estimation);
            enrichValues(estimation);
            render(estimation);
        }
    }

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        if(action.type === 'OUTSKIRTS') {
            return estimatorOutskirts.get(skillId, actionId);
        } else if(skill.type === 'Gathering' || skill.type === 'Crafting') {
            return estimatorActivity.get(skillId, actionId);
        } else if(skill.type === 'Combat') {
            return estimatorCombat.get(skillId, actionId);
        }
    }

    function enrichTimings(estimation) {
        const inventory = Object.entries(estimation.ingredients).map(([id,amount]) => ({
            id,
            stored: statsStore.getInventoryItem(id),
            secondsLeft: statsStore.getInventoryItem(id) * 3600 / amount
        })).reduce((a,b) => (a[b.id] = b, a), {});
        const equipment = Object.entries(estimation.equipments).map(([id,amount]) => ({
            id,
            stored: statsStore.getEquipmentItem(id),
            secondsLeft: statsStore.getEquipmentItem(id) * 3600 / amount
        })).reduce((a,b) => (a[b.id] = b, a), {});
        let maxAmount = statsStore.get('MAX_AMOUNT', estimation.skill);
        maxAmount = {
            value: maxAmount,
            secondsLeft: estimation.productionSpeed / 10 * (maxAmount || Infinity)
        };
        const levelState = statsStore.getLevel(estimation.skill);
        estimation.timings = {
            inventory,
            equipment,
            maxAmount,
            finished: Math.min(maxAmount.secondsLeft, ...Object.values(inventory).concat(Object.values(equipment)).map(a => a.secondsLeft)),
            level: util.expToNextLevel(levelState.exp) * 3600 / estimation.exp,
            tier: levelState.level === 100 ? 0 : util.expToNextTier(levelState.exp) * 3600 / estimation.exp,
        };
    }

    function enrichValues(estimation) {
        estimation.values = {
            drop: getSellPrice(estimation.drops),
            ingredient: getSellPrice(estimation.ingredients),
            equipment: getSellPrice(estimation.equipments),
            net: 0
        };
        estimation.values.net = estimation.values.drop - estimation.values.ingredient - estimation.values.equipment;
    }

    function getSellPrice(object) {
        return Object.entries(object)
            .map(a => a[1] * itemCache.byId[a[0]].attributes.SELL_PRICE)
            .filter(a => a)
            .reduce((a,b) => a+b, 0);
    }

    function render(estimation) {
        components.search(componentBlueprint, 'speed').value
            = util.formatNumber(estimation.speed/10) + ' s';
        components.search(componentBlueprint, 'exp').hidden
            = estimation.exp === 0;
        components.search(componentBlueprint, 'exp').value
            = util.formatNumber(estimation.exp);
        components.search(componentBlueprint, 'survivalChance').hidden
            = estimation.type === 'ACTIVITY';
        components.search(componentBlueprint, 'survivalChance').value
            = util.formatNumber(estimation.survivalChance * 100) + ' %';
        components.search(componentBlueprint, 'finishedTime').value
            = util.secondsToDuration(estimation.timings.finished);
        components.search(componentBlueprint, 'levelTime').hidden
            = estimation.exp === 0 || estimation.timings.level === 0;
        components.search(componentBlueprint, 'levelTime').value
            = util.secondsToDuration(estimation.timings.level);
        components.search(componentBlueprint, 'tierTime').hidden
            = estimation.exp === 0 || estimation.timings.tier === 0;
        components.search(componentBlueprint, 'tierTime').value
            = util.secondsToDuration(estimation.timings.tier);
        components.search(componentBlueprint, 'dropValue').hidden
            = estimation.values.drop === 0;
        components.search(componentBlueprint, 'dropValue').value
            = util.formatNumber(estimation.values.drop);
        components.search(componentBlueprint, 'ingredientValue').hidden
            = estimation.values.ingredient === 0;
        components.search(componentBlueprint, 'ingredientValue').value
            = util.formatNumber(estimation.values.ingredient);
        components.search(componentBlueprint, 'equipmentValue').hidden
            = estimation.values.equipment === 0;
        components.search(componentBlueprint, 'equipmentValue').value
            = util.formatNumber(estimation.values.equipment);
        components.search(componentBlueprint, 'netValue').hidden
            = estimation.values.net === 0;
        components.search(componentBlueprint, 'netValue').value
            = util.formatNumber(estimation.values.net);
        components.search(componentBlueprint, 'tabTime').hidden
            = (estimation.timings.inventory.length + estimation.timings.equipment.length) === 0;

        const dropRows = components.search(componentBlueprint, 'dropRows');
        const ingredientRows = components.search(componentBlueprint, 'ingredientRows');
        const timeRows = components.search(componentBlueprint, 'timeRows');
        dropRows.rows = [];
        ingredientRows.rows = [];
        timeRows.rows = [];
        if(estimation.timings.maxAmount.value) {
            timeRows.rows.push({
                type: 'item',
                image: 'https://img.icons8.com/?size=48&id=1HQMXezy5LeT&format=png',
                imageFilter: 'invert(100%)',
                name: `Max amount [${util.formatNumber(estimation.timings.maxAmount.value)}]`,
                value: util.secondsToDuration(estimation.timings.maxAmount.secondsLeft)
            });
        }
        for(const id in estimation.drops) {
            const item = itemCache.byId[id];
            dropRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                value: util.formatNumber(estimation.drops[id]) + ' / hour'
            });
        }
        for(const id in estimation.ingredients) {
            const item = itemCache.byId[id];
            const timing = estimation.timings.inventory[id];
            ingredientRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                value: util.formatNumber(estimation.ingredients[id]) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: `${item.name} [${util.formatNumber(timing.stored)}]`,
                value: util.secondsToDuration(timing.secondsLeft)
            });
        }
        for(const id in estimation.equipments) {
            const item = itemCache.byId[id];
            const timing = estimation.timings.equipment[id];
            ingredientRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                value: util.formatNumber(estimation.equipments[id]) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: `${item.name} [${util.formatNumber(timing.stored)}]`,
                value: util.secondsToDuration(timing.secondsLeft)
            });
        }

        components.addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId: 'estimatorComponent',
        dependsOn: 'skill-page',
        parent: 'actions-component',
        selectedTabIndex: 0,
        tabs: [{
            title: 'Overview',
            rows: [{
                type: 'item',
                id: 'speed',
                name: 'Time per action',
                image: 'https://cdn-icons-png.flaticon.com/512/3563/3563395.png',
                value: ''
            },{
                type: 'item',
                id: 'exp',
                name: 'Exp/hour',
                image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
                value: ''
            },{
                type: 'item',
                id: 'survivalChance',
                name: 'Survival chance',
                image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
                value: ''
            },{
                type: 'item',
                id: 'finishedTime',
                name: 'Finished',
                image: 'https://cdn-icons-png.flaticon.com/512/1505/1505471.png',
                value: ''
            },{
                type: 'item',
                id: 'levelTime',
                name: 'Level up',
                image: 'https://cdn-icons-png.flaticon.com/512/4614/4614145.png',
                value: ''
            },{
                type: 'item',
                id: 'tierTime',
                name: 'Tier up',
                image: 'https://cdn-icons-png.flaticon.com/512/4789/4789514.png',
                value: ''
            },{
                type: 'item',
                id: 'dropValue',
                name: 'Gold/hour (loot)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028024.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'ingredientValue',
                name: 'Gold/hour (materials)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'equipmentValue',
                name: 'Gold/hour (equipments)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'netValue',
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
                id: 'ingredientRows',
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
// estimatorAction
window.moduleRegistry.add('estimatorAction', (dropCache, actionCache, ingredientCache, skillCache, itemCache, statsStore) => {

    const LOOPS_PER_HOUR = 10 * 60 * 60; // 1 second = 10 loops
    const LOOPS_PER_FOOD = 150;

    const exports = {
        LOOPS_PER_HOUR,
        LOOPS_PER_FOOD,
        getDrops,
        getIngredients,
        getEquipmentUses
    };

    function getDrops(skillId, actionId, isCombat, multiplier = 1) {
        const drops = dropCache.byAction[actionId];
        if(!drops) {
            return [];
        }
        const hasFailDrops = !!drops.find(a => a.type === 'FAILED');
        const hasMonsterDrops = !!drops.find(a => a.type === 'MONSTER');
        const successChance = hasFailDrops ? getSuccessChance(skillId, actionId) / 100 : 1;
        return drops.map(drop => {
            let amount = (1 + drop.amount) / 2 * multiplier * drop.chance;
            if(drop.type !== 'MONSTER' && isCombat && hasMonsterDrops) {
                amount = 0;
            } else if(drop.type === 'MONSTER' && !isCombat) {
                amount = 0;
            } else if(drop.type === 'FAILED') {
                amount *= 1 - successChance;
            } else {
                amount *= successChance;
            }
            if(amount) {
                return {
                    id: drop.item,
                    amount
                };
            }
        })
        .filter(a => a)
        .map(a => {
            const mapFindChance = statsStore.get('MAP_FIND_CHANCE', skillId) / 100;
            if(!mapFindChance || !itemCache.specialIds.map.includes(a.id)) {
                return a;
            }
            a.amount *= 1 + mapFindChance;
            return a;
        })
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getSuccessChance(skillId, actionId) {
        const action = actionCache.byId[actionId];
        const level = statsStore.getLevel(skillId).level;
        return Math.min(95, 80 + level - action.level) + Math.floor(level / 20);
    }

    function getIngredients(actionId, multiplier = 1) {
        const ingredients = ingredientCache.byAction[actionId];
        if(!ingredients) {
            return [];
        }
        return ingredients.map(ingredient => ({
            id: ingredient.item,
            amount: ingredient.amount * multiplier
        }))
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getEquipmentUses(skillId, actionId, isCombat = false, foodPerHour = 0) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const result = {};
        const potionMultiplier = 1 + statsStore.get('DECREASED_POTION_DURATION') / 100;
        if(isCombat) {
            if(action.type !== 'OUTSKIRTS') {
                // combat potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.potionCombat)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
            if(action.type === 'DUNGEON') {
                // dungeon map
                statsStore.getManyEquipmentItems(itemCache.specialIds.map)
                    .forEach(a => result[a.id] = 3 / 24);
            }
            if(foodPerHour && action.type !== 'OUTSKIRTS' && statsStore.get('HEAL')) {
                // active food
                statsStore.getManyEquipmentItems(itemCache.specialIds.food)
                    .forEach(a => result[a.id] = foodPerHour);
            }
            if(statsStore.getAttackStyle() === 'Ranged') {
                // ammo
                const attacksPerHour = LOOPS_PER_HOUR / 5 / statsStore.get('ATTACK_SPEED');
                const ammoPerHour = attacksPerHour * (1 - statsStore.get('AMMO_PRESERVATION_CHANCE') / 100);
                statsStore.getManyEquipmentItems(itemCache.specialIds.arrow)
                    .forEach(a => result[a.id] = ammoPerHour);
            }
        } else {
            if(skill.type === 'Gathering') {
                // gathering potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.potionGathering)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
            if(skill.type === 'Crafting') {
                // crafting potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.potionCrafting)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
        }
        if(statsStore.get('PASSIVE_FOOD_CONSUMPTION') && statsStore.get('HEAL')) {
            // passive food
            statsStore.getManyEquipmentItems(itemCache.specialIds.food)
                .forEach(a => result[a.id] = (result[a.id] || 0) + statsStore.get('PASSIVE_FOOD_CONSUMPTION') * 3600 / 5 / statsStore.get('HEAL'));
        }
        return result;
    }

    return exports;

}
);
// estimatorActivity
window.moduleRegistry.add('estimatorActivity', (skillCache, actionCache, estimatorAction, statsStore, itemCache, dropCache) => {

    const exports = {
        get
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const speed = getSpeed(skill.technicalName, action);
        const actionCount = estimatorAction.LOOPS_PER_HOUR / speed;
        const actualActionCount = actionCount * (1 + statsStore.get('EFFICIENCY', skill.technicalName) / 100);
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP', skill.technicalName) / 100);
        const ingredientCount = actualActionCount * (1 - statsStore.get('PRESERVATION', skill.technicalName) / 100);
        const exp = actualActionCount * action.exp * (1 + statsStore.get('DOUBLE_EXP', skill.technicalName) / 100);
        const drops = estimatorAction.getDrops(skillId, actionId, false, dropCount);
        const ingredients = estimatorAction.getIngredients(actionId, ingredientCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId);

        let statLowerTierChance;
        if(skill.type === 'Gathering' && (statLowerTierChance = statsStore.get('LOWER_TIER_CHANCE', skill.technicalName) / 100)) {
            for(const item in drops) {
                const mappings = dropCache.lowerGatherMappings[item];
                if(mappings) {
                    for(const other of mappings) {
                        drops[other] = (drops[other] || 0) + statLowerTierChance * drops[item] / mappings.length;
                    }
                    drops[item] *= 1 - statLowerTierChance;
                }
            }
        }

        let statMerchantSellChance;
        if(skill.type === 'Crafting' && (statMerchantSellChance = statsStore.get('MERCHANT_SELL_CHANCE', skill.technicalName) / 100)) {
            for(const item in drops) {
                drops[itemCache.specialIds.coins] = (drops[itemCache.specialIds.coins] || 0) + 2 * statMerchantSellChance * drops[item] * itemCache.byId[item].attributes.SELL_PRICE;
                drops[item] *= 1 - statMerchantSellChance;
            }
        }

        return {
            type: 'ACTIVITY',
            skill: skillId,
            speed,
            productionSpeed: speed * actionCount / dropCount,
            exp,
            drops,
            ingredients,
            equipments
        };
    }

    function getSpeed(skillName, action) {
        const speedBonus = statsStore.get('SKILL_SPEED', skillName);
        return Math.round(action.speed * 1000 / (100 + speedBonus)) + 1;
    }

    return exports;

}
);
// estimatorCombat
window.moduleRegistry.add('estimatorCombat', (skillCache, actionCache, monsterCache, itemCache, dropCache, statsStore, Distribution, estimatorAction) => {

    const exports = {
        get,
        getDamageDistributions,
        getSurvivalChance
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const monsterIds = action.monster ? [action.monster] : action.monsterGroup;
        const playerStats = getPlayerStats();
        const sampleMonsterStats = getMonsterStats(monsterIds[Math.floor(monsterIds.length / 2)]);
        playerStats.damage_ = new Distribution();
        sampleMonsterStats.damage_ = new Distribution();
        for(const monsterId of monsterIds) {
            const monsterStats = getMonsterStats(monsterId);
            let damage_ = getInternalDamageDistribution(playerStats, monsterStats, monsterIds.length > 1);
            const weight = damage_.expectedRollsUntill(monsterStats.health);
            playerStats.damage_.addDistribution(damage_, weight);
            damage_ = getInternalDamageDistribution(monsterStats, playerStats, monsterIds.length > 1);
            sampleMonsterStats.damage_.addDistribution(damage_, weight);
        }
        playerStats.damage_.normalize();
        sampleMonsterStats.damage_.normalize();

        const loopsPerKill = playerStats.attackSpeed * playerStats.damage_.expectedRollsUntill(sampleMonsterStats.health) * 10 + 5;
        const actionCount = estimatorAction.LOOPS_PER_HOUR / loopsPerKill;
        const efficiency = 1 + statsStore.get('EFFICIENCY', skill.technicalName) / 100;
        const actualActionCount = actionCount * efficiency;
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP', skill.technicalName) / 100);
        const attacksReceivedPerHour = estimatorAction.LOOPS_PER_HOUR / 10 / sampleMonsterStats.attackSpeed;
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT') / 100);
        const damagePerHour = attacksReceivedPerHour * sampleMonsterStats.damage_.average();
        const foodPerHour = damagePerHour / healPerFood * (1 - statsStore.get('FOOD_PRESERVATION_CHANCE') / 100);

        let exp = estimatorAction.LOOPS_PER_HOUR * action.exp / 1000;
        exp *= efficiency;
        exp *= 1 + statsStore.get('DOUBLE_EXP', skill.technicalName) / 100;
        exp *= 1 + statsStore.get('COMBAT_EXP', skill.technicalName) / 100;
        const drops = estimatorAction.getDrops(skillId, actionId, true, dropCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId, true, foodPerHour);
        const survivalChance = getSurvivalChance(playerStats, sampleMonsterStats, loopsPerKill);

        let statCoinSnatch;
        if(statCoinSnatch = statsStore.get('COIN_SNATCH')) {
            const attacksPerHour = estimatorAction.LOOPS_PER_HOUR / 10 / playerStats.attackSpeed;
            const coinsPerHour = (statCoinSnatch + 1) / 2 * attacksPerHour;
            drops[itemCache.specialIds.coins] = (drops[itemCache.specialIds.coins] || 0) + coinsPerHour;
        }

        let statCarveChance = 0.1;
        if(action.type !== 'OUTSKIRTS' && (statCarveChance = statsStore.get('CARVE_CHANCE') / 100)) {
            const boneDrop = dropCache.byAction[actionId].find(a => a.chance === 1);
            const boneDropCount = drops[boneDrop.item];
            const coinDrop = dropCache.byAction[actionId].find(a => a.item === itemCache.specialIds.coins);
            const averageAmount = (1 + coinDrop.amount) / 2;
            drops[itemCache.specialIds.coins] -= statCarveChance * coinDrop.chance * averageAmount / 2 * boneDropCount;
            const mappings = dropCache.boneCarveMappings[boneDrop.item];
            for(const other of mappings) {
                drops[other] = (drops[other] || 0) + statCarveChance * coinDrop.chance * boneDropCount / mappings.length;
            }
        }

        return {
            type: 'COMBAT',
            skill: skillId,
            speed: loopsPerKill,
            productionSpeed: loopsPerKill * actionCount / dropCount,
            exp,
            drops,
            ingredients: {},
            equipments,
            player: playerStats,
            monster: sampleMonsterStats,
            survivalChance
        };
    }

    function getPlayerStats() {
        const attackStyle = statsStore.getAttackStyle();
        const attackSkill = skillCache.byTechnicalName[attackStyle];
        const attackLevel = statsStore.getLevel(attackSkill.id).level;
        const defenseLevel = statsStore.getLevel(8).level;
        return {
            isPlayer: true,
            attackStyle,
            attackSpeed: statsStore.get('ATTACK_SPEED'),
            damage: statsStore.get('DAMAGE'),
            armour: statsStore.get('ARMOUR'),
            health: statsStore.get('HEALTH'),
            blockChance: statsStore.get('BLOCK_CHANCE')/100,
            critChance: statsStore.get('CRIT_CHANCE')/100,
            stunChance: statsStore.get('STUN_CHANCE')/100,
            parryChance: statsStore.get('PARRY_CHANCE')/100,
            bleedChance: statsStore.get('BLEED_CHANCE')/100,
            damageRange: (75 + statsStore.get('DAMAGE_RANGE'))/100,
            dungeonDamage: 1 + statsStore.get('DUNGEON_DAMAGE')/100,
            attackLevel,
            defenseLevel
        };
    }

    function getMonsterStats(monsterId) {
        const monster = monsterCache.byId[monsterId];
        return {
            isPlayer: false,
            attackStyle: monster.attackStyle,
            attackSpeed: monster.speed,
            damage: monster.attack,
            armour: monster.armour,
            health: monster.health,
            blockChance: 0,
            critChance: 0,
            stunChance: 0,
            parryChance: 0,
            bleedChance: 0,
            damageRange: 0.75,
            dungeonDamage: 1,
            attackLevel: monster.level,
            defenseLevel: monster.level
        };
    }

    function getInternalDamageDistribution(attacker, defender, isDungeon) {
        let damage = attacker.damage;
        damage *= getDamageTriangleModifier(attacker, defender);
        damage *= getDamageScalingRatio(attacker, defender);
        damage *= getDamageArmourRatio(attacker, defender);
        damage *= !isDungeon ? 1 : attacker.dungeonDamage;

        const maxDamage_ = new Distribution(damage);
        // crit
        if(attacker.critChance) {
            maxDamage_.convolution(
                Distribution.getRandomChance(attacker.critChance),
                (dmg, crit) => dmg * (crit ? 1.5 : 1)
            );
        }
        // damage range
        const result = maxDamage_.convolutionWithGenerator(
            dmg => Distribution.getRandomOutcomeRounded(dmg * attacker.damageRange, dmg),
            (dmg, randomDamage) => randomDamage
        );
        // block
        if(defender.blockChance) {
            result.convolution(
                Distribution.getRandomChance(defender.blockChance),
                (dmg, blocked) => blocked ? 0 : dmg
            );
        }
        // stun
        if(defender.stunChance) {
            let stunChance = defender.stunChance;
            // only when defender accurate
            stunChance *= getAccuracy(defender, attacker);
            // can also happen on defender parries
            stunChance *= 1 + defender.parryChance;
            // modifier based on speed
            stunChance *= attacker.attackSpeed / defender.attackSpeed;
            // convert to actual stunned percentage
            const stunnedPercentage = stunChance * 2.5 / attacker.attackSpeed;
            result.convolution(
                Distribution.getRandomChance(stunnedPercentage),
                (dmg, stunned) => stunned ? 0 : dmg
            );
        }
        // accuracy
        const accuracy = getAccuracy(attacker, defender);
        result.convolution(
            Distribution.getRandomChance(accuracy),
            (dmg, accurate) => accurate ? dmg : 0
        );
        // === special effects ===
        const intermediateClone_ = result.clone();
        // parry attacker - deal back 25% of a regular attack
        if(attacker.parryChance) {
            let parryChance = attacker.parryChance;
            if(attacker.attackSpeed < defender.attackSpeed) {
                parryChance *= attacker.attackSpeed / defender.attackSpeed;
            }
            const parried_ = intermediateClone_.clone();
            parried_.convolution(
                Distribution.getRandomChance(parryChance),
                (dmg, parried) => parried ? Math.round(dmg/4.0) : 0
            );
            result.convolution(
                parried_,
                (dmg, extra) => dmg + extra
            );
            if(attacker.attackSpeed > defender.attackSpeed) {
                // we can parry multiple times during one turn
                parryChance *= (attacker.attackSpeed - defender.attackSpeed) / attacker.attackSpeed;
                parried_.convolution(
                    Distribution.getRandomChance(parryChance),
                    (dmg, parried) => parried ? dmg : 0
                );
                result.convolution(
                    parried_,
                    (dmg, extra) => dmg + extra
                );
            }
        }
        // parry defender - deal 50% of a regular attack
        if(defender.parryChance) {
            result.convolution(
                Distribution.getRandomChance(defender.parryChance),
                (dmg, parried) => parried ? Math.round(dmg/2) : dmg
            );
        }
        // bleed - 50% of damage over 3 seconds (assuming to be within one attack round)
        if(attacker.bleedChance) {
            const bleed_ = intermediateClone_.clone();
            bleed_.convolution(
                Distribution.getRandomChance(attacker.bleedChance),
                (dmg, bleed) => bleed ? 5 * Math.round(dmg/10) : 0
            );
            result.convolution(
                bleed_,
                (dmg, extra) => dmg + extra
            );
        }
        return result;
    }

    function getDamageTriangleModifier(attacker, defender) {
        if(!attacker.attackStyle || !defender.attackStyle) {
            return 1.0;
        }
        if(attacker.attackStyle === defender.attackStyle) {
            return 1.0;
        }
        if(attacker.attackStyle === 'OneHanded' && defender.attackStyle === 'Ranged') {
            return 1.1;
        }
        if(attacker.attackStyle === 'Ranged' && defender.attackStyle === 'TwoHanded') {
            return 1.1;
        }
        if(attacker.attackStyle === 'TwoHanded' && defender.attackStyle === 'OneHanded') {
            return 1.1;
        }
        return 0.9;
    }

    function getDamageScalingRatio(attacker, defender) {
        const ratio = attacker.attackLevel / defender.defenseLevel;
        if(attacker.isPlayer) {
            return Math.min(1, ratio);
        }
        return Math.max(1, ratio);
    }

    function getDamageArmourRatio(attacker, defender) {
        if(!defender.armour) {
            return 1;
        }
        const scale = 25 + Math.min(70, (defender.armour - 25) * 50 / 105);
        return (100 - scale) / 100;
    }

    function getAccuracy(attacker, defender) {
        let accuracy = 75 + (attacker.attackLevel - defender.defenseLevel) / 2.0;
        accuracy = Math.max(60, accuracy);
        accuracy = Math.min(90, accuracy);
        return accuracy / 100;
    }

    function getDamageDistributions(monsterId) {
        const playerStats = getPlayerStats();
        const monsterStats = getMonsterStats(monsterId);
        const playerDamage_ = getInternalDamageDistribution(playerStats, monsterStats);
        const monsterDamage_ = getInternalDamageDistribution(monsterStats, playerStats);
        playerDamage_.normalize();
        monsterDamage_.normalize();
        return [playerDamage_, monsterDamage_];
    }

    function getSurvivalChance(player, monster, loopsPerFight, fights = 10, applyCringeMultiplier = false) {
        const loopsPerAttack = monster.attackSpeed * 10;
        let attacksPerFight = loopsPerFight / loopsPerAttack;
        if(fights === 1 && applyCringeMultiplier) {
            const playerLoopsPerAttack = player.attackSpeed * 10;
            const playerAttacksPerFight = loopsPerFight / playerLoopsPerAttack;
            const cringeMultiplier = Math.min(1.4, Math.max(1, 1.4 - playerAttacksPerFight / 50));
            attacksPerFight *= cringeMultiplier;
        }
        const foodPerAttack = loopsPerAttack / estimatorAction.LOOPS_PER_FOOD;
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT') / 100);
        const healPerAttack = Math.round(healPerFood * foodPerAttack);
        const healPerFight = healPerAttack * attacksPerFight;
        let deathChance = 0;
        let scenarioChance = 1;
        let health = player.health;
        for(let i=0;i<fights;i++) {
            const currentDeathChance = monster.damage_.getRightTail(attacksPerFight, health + healPerFight);
            deathChance += currentDeathChance * scenarioChance;
            scenarioChance *= 1 - currentDeathChance;
            const damage = monster.damage_.getMeanRange(attacksPerFight, healPerFight, health + healPerFight);
            health -= damage - healPerFight;
            if(isNaN(health) || health === Infinity || health === -Infinity) {
                // TODO NaN / Infinity result from above?
                break;
            }
        }
        const cringeCutoff = 0.10;
        if(fights === 1 && !applyCringeMultiplier && deathChance < cringeCutoff) {
            const other = getSurvivalChance(player, monster, loopsPerFight, fights, true);
            const avg = (1 - deathChance + other) / 2;
            if(avg > 1 - cringeCutoff / 2) {
                return avg;
            }
        }
        return 1 - deathChance;
    }

    return exports;

}
);
// estimatorOutskirts
window.moduleRegistry.add('estimatorOutskirts', (actionCache, itemCache, statsStore, estimatorActivity, estimatorCombat) => {

    const exports = {
        get
    };

    function get(skillId, actionId) {
        try {
            const action = actionCache.byId[actionId];
            const excludedItemIds = itemCache.specialIds.food.concat(itemCache.specialIds.potionCombat);
            statsStore.update(new Set(excludedItemIds));

            const activityEstimation = estimatorActivity.get(skillId, actionId);
            const combatEstimation = estimatorCombat.get(skillId, actionId);
            const monsterChance = (1000 - action.outskirtsMonsterChance) / 1000;

            // Axioms:
            // combatRatio = 1 - activityRatio
            // activityLoops = totalLoops * activityRatio
            // combatLoops = totalLoops * combatRatio
            // fights = combatLoops / combatSpeed
            // actions = activityLoops / activitySpeed
            // encounterChance = fights / (fights + actions)
            const combatRatio = combatEstimation.speed / (activityEstimation.speed * (1 / monsterChance + combatEstimation.speed / activityEstimation.speed - 1));
            const activityRatio = 1 - combatRatio;

            const survivalChance = estimatorCombat.getSurvivalChance(combatEstimation.player, combatEstimation.monster, combatEstimation.speed, 1);

            const exp = activityEstimation.exp * activityRatio;
            const drops = {};
            merge(drops, activityEstimation.drops, activityRatio);
            merge(drops, combatEstimation.drops, combatRatio);
            const ingredients = {};
            merge(ingredients, activityEstimation.ingredients, activityRatio);
            merge(ingredients, combatEstimation.ingredients, combatRatio);
            const equipments = {};
            merge(equipments, activityEstimation.equipments, activityRatio);
            merge(equipments, combatEstimation.equipments, combatRatio);

            return {
                type: 'OUTSKIRTS',
                skill: skillId,
                speed: activityEstimation.speed,
                productionSpeed: activityEstimation.productionSpeed,
                exp,
                drops,
                ingredients,
                equipments,
                player: combatEstimation.player,
                monster: combatEstimation.monster,
                survivalChance
            };
        } finally {
            statsStore.update(new Set());
        }
    }

    function merge(target, source, ratio) {
        for(const key in source) {
            target[key] = (target[key] || 0) + source[key] * ratio;
        }
    }

    return exports;



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
window.moduleRegistry.add('itemHover', (configuration, itemCache, util) => {

    let enabled = false;
    let entered = false;
    let element;
    const converters = {
        SPEED: a => a/2,
        DURATION: a => util.secondsToDuration(a/10)
    }

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'item-hover',
            name: 'Item hover info',
            default: true,
            handler: handleConfigStateChange
        });
        setup();
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
            if(value && converters[attribute.technicalName]) {
                value = converters[attribute.technicalName](value);
            }
            if(value && Number.isInteger(value)) {
                value = util.formatNumber(value);
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

    function setup() {
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
                    image-rendering: auto;
                }
                #custom-item-hover img.pixelated {
                    image-rendering: pixelated;
                }
            </style>
        `);
        element = $(`
            <div id='custom-item-hover' style='display:none'>
                <div>
                    <img class='image pixelated'/>
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
// marketCompetition
window.moduleRegistry.add('marketCompetition', (configuration, events, toast, util, elementCreator, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'market-competition',
            name: 'Market competition indicator',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('state-market', handleMarketData);
        elementCreator.addStyles(styles);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleMarketData(marketData) {
        if(!enabled || marketData.lastType !== 'OWN') {
            return;
        }
        const page = events.getLast('page');
        if(page.type !== 'market') {
            return;
        }
        showToasts(marketData);
        showCircles(marketData);
    }

    function showToasts(marketData) {
        if(!marketData.SELL) {
            toast.create({
                text: 'Missing "Buy" listing data for the competition checker'
            });
        }
        if(!marketData.BUY) {
            toast.create({
                text: 'Missing "Orders" listing data for the competition checker'
            });
        }
    }

    function showCircles(marketData) {
        $('.market-competition').remove();
        for(const listing of marketData.OWN) {
            if(!marketData[listing.type]) {
                continue;
            }
            const matching = marketData[listing.type].filter(a => !a.isOwn && a.item === listing.item);
            const same = matching.filter(a => a.price === listing.price);
            const better = matching.filter(a =>
                (listing.type === 'SELL' && a.price < listing.price) ||
                (listing.type === 'BUY' && a.price > listing.price)
            );
            if(!same.length && !better.length) {
                continue;
            }
            const color = better.length ? 'danger' : 'warning';
            const text = better.concat(same)
                    .map(a => `${util.formatNumber(a.amount)} @ ${util.formatNumber(a.price)}`)
                    .join(' / ');
            listing.element.find('.cost').before(`<div class='market-competition market-competition-${color}' title='${text}'></div>`);
        }
    }

    const styles = `
        .market-competition {
            width: 16px;
            height: 16px;
            border-radius: 50%;
        }

        .market-competition-warning {
            background-color: ${colorMapper('warning')}
        }

        .market-competition-danger {
            background-color: ${colorMapper('danger')}
        }
    `;

    initialise();

}
);
// marketFilter
window.moduleRegistry.add('marketFilter', (configuration, localDatabase, events, components, elementWatcher, Promise, itemCache, dropCache, marketReader, elementCreator) => {

    const STORE_NAME = 'market-filters';
    const TYPE_TO_ITEM = {
        'Food': itemCache.byName['Health'].id,
        'Charcoal': itemCache.byName['Charcoal'].id,
        'Compost': itemCache.byName['Compost'].id,
        'Arcane Powder': itemCache.byName['Arcane Powder'].id,
    };
    let savedFilters = [];
    let enabled = false;
    let currentFilter = {
        type: 'None',
        amount: 0,
        key: 'SELL-None'
    };
    let pageInitialised = false;
    let listingsUpdatePromise = null;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'market-filter',
            name: 'Market filter',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('state-market', update);

        savedFilters = await localDatabase.getAllEntries(STORE_NAME);

        // detect elements changing

        // clear filters when searching yourself
        $(document).on('click', 'market-listings-component .search > .clear-button', clearFilter);
        $(document).on('input', 'market-listings-component .search > input', clearFilter);

        // Buy tab -> trigger update
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(1)', function() {
            showComponent();
            marketReader.trigger();
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(2)', function() {
            showComponent();
            marketReader.trigger();
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(3)', function() {
            hideComponent();
            marketReader.trigger();
        });

        elementCreator.addStyles(`
            .greenOutline {
                outline: 2px solid rgb(83, 189, 115) !important;
            }
        `);

        // on save hover, highlight saved fields
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
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update() {
        if(!enabled) {
            return;
        }
        if(events.getLast('page')?.type !== 'market') {
            pageInitialised = false;
            return;
        }
        initialisePage();
        $('market-listings-component .search').addClass('saveFilterHover');
        syncListingsView();
    }

    async function initialisePage() {
        if(pageInitialised) {
            return;
        }
        clearFilter();
        try {
            await elementWatcher.childAddedContinuous('market-listings-component .card', () => {
                if(listingsUpdatePromise) {
                    listingsUpdatePromise.resolve();
                    listingsUpdatePromise = null;
                }
            });
            pageInitialised = true;
        } catch(error) {
            console.warn(`Could probably not detect the market listing component, cause : ${error}`);
        }
    }

    async function clearFilter() {
        await applyFilter({
            type: 'None',
            amount: 0
        });
        syncCustomView();
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
        listingsUpdatePromise = new Promise.Expiring(5000);
        setSearch('');
        await listingsUpdatePromise;
        marketReader.trigger();
    }

    function setSearch(value) {
        const searchReference = $('market-listings-component .search > input');
        searchReference.val(value);
        searchReference[0].dispatchEvent(new Event('input'));
    }

    async function saveFilter() {
        let filter = structuredClone(currentFilter);
        if(currentFilter.type === 'None') {
            filter.search = $('market-listings-component .search > input').val();
            if(!filter.search) {
                return;
            }
        }
        if(filter.search) {
            filter.key = `SEARCH-${filter.search}`;
        } else {
            filter.key = `${filter.type}-${filter.amount}`;
        }
        if(!savedFilters.find(a => a.key === filter.key)) {
            localDatabase.saveEntry(STORE_NAME, filter);
            savedFilters.push(filter);
        }
        componentBlueprint.selectedTabIndex = 0;
        syncCustomView();
    }

    async function removeFilter(filter) {
        localDatabase.removeEntry(STORE_NAME, filter.key);
        savedFilters = savedFilters.filter(a => a.key !== filter.key);
        syncCustomView();
    }

    function syncListingsView() {
        const marketData = events.getLast('state-market');
        if(!marketData) {
            return;
        }
        // do nothing on own listings tab
        if(marketData.lastType === 'OWN') {
            resetListingsView(marketData);
            return;
        }
        // search
        if(currentFilter.search) {
            resetListingsView(marketData);
            setSearch(currentFilter.search);
            return;
        }
        // no type
        if(currentFilter.type === 'None') {
            resetListingsView(marketData);
            return;
        }
        // type
        const itemId = TYPE_TO_ITEM[currentFilter.type];
        const conversionsByItem = dropCache.conversionMappings[itemId].reduce((a,b) => (a[b.from] = b, a), {});
        let matchingListings = marketData.last.filter(listing => listing.item in conversionsByItem);
        for(const listing of matchingListings) {
            listing.ratio = listing.price / conversionsByItem[listing.item].amount;
        }
        matchingListings.sort((a,b) => (a.type === 'BUY' ? 1 : -1) * (b.ratio - a.ratio));
        if(currentFilter.amount) {
            matchingListings = matchingListings.slice(0, currentFilter.amount);
        }
        for(const listing of marketData.last) {
            if(matchingListings.includes(listing)) {
                listing.element.show();
                if(!listing.element.find('.ratio').length) {
                    listing.element.find('.amount').after(`<div class='ratio'>(${listing.ratio.toFixed(2)})</div>`);
                }
            } else {
                listing.element.hide();
            }
        }
    }

    function resetListingsView(marketData) {
        for(const element of marketData.last.map(a => a.element)) {
            element.find('.ratio').remove();
            element.show();
        }
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
                }, {
                    text: 'Arcane Powder',
                    value: 'Arcane Powder',
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
window.moduleRegistry.add('recipeClickthrough', (recipeCache, configuration, util) => {

    let enabled = false;

    function initialise() {
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
    }

    function handleClick(event) {
        if(!enabled) {
            return;
        }
        if($(event.currentTarget).closest('button').length) {
            return;
        }
        event.stopPropagation();
        const name = $(event.relatedTarget).find('.name').text();
        const nameMatch = recipeCache.byName[name];
        if(nameMatch) {
            return followRecipe(nameMatch);
        }

        const parts = event.target.src.split('/');
        const lastPart = parts[parts.length-1];
        const imageMatch = recipeCache.byImage[lastPart];
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
// syncTracker
window.moduleRegistry.add('syncTracker', (events, localDatabase, pages, components, util, toast, elementWatcher) => {

    const STORE_NAME = 'sync-tracking';
    const PAGE_NAME = 'Sync State';
    const TOAST_SUCCESS_TIME = 1000*60*5; // 5 minutes
    const TOAST_WARN_TIME = 1000*60*60*24*3; // 3 days
    const TOAST_REWARN_TIME = 1000*60*60*4; // 4 hours

    const sources = {
        inventory: {
            name: 'Inventory',
            event: 'reader-inventory',
            page: 'inventory'
        },
        'equipment-equipment': {
            name: 'Equipment',
            event: 'reader-equipment-equipment',
            page: 'equipment'
        },
        'equipment-runes': {
            name: 'Runes',
            event: 'reader-equipment-runes',
            page: 'equipment',
            element: 'equipment-page .categories button:contains("Runes")'
        },
        'equipment-tomes': {
            name: 'Tomes',
            event: 'reader-equipment-tomes',
            page: 'equipment',
            element: 'equipment-page .categories button:contains("Tomes")'
        },
        structures: {
            name: 'Buildings',
            event: 'reader-structures',
            page: 'house/build/2'
        },
        enhancements: {
            name: 'Building enhancements',
            event: 'reader-enhancements',
            page: 'house/enhance/2'
        },
        'structures-guild': {
            name: 'Guild buildings',
            event: 'reader-structures-guild',
            page: 'guild',
            element: 'guild-page button:contains("Buildings")'
        }
    };

    let autoVisiting = false;

    async function initialise() {
        await loadSavedData();
        for(const key of Object.keys(sources)) {
            events.register(sources[key].event, handleReader.bind(null, key));
        }
        await pages.register({
            category: 'Misc',
            name: PAGE_NAME,
            image: 'https://img.icons8.com/?size=48&id=1ODJ62iG96gX&format=png',
            columns: '3',
            render: renderPage
        });
        pages.show(PAGE_NAME);
        setInterval(update, 1000);
    }

    async function loadSavedData() {
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        for(const entry of entries) {
            if(!sources[entry.key]) {
                continue;
            }
            sources[entry.key].lastSeen = entry.value.time;
            events.emit(`reader-${entry.key}`, {
                type: 'cache',
                value: entry.value.value
            });
        }
    }

    function handleReader(key, event) {
        if(event.type !== 'full') {
            return;
        }
        const time = Date.now();
        let newData = false;
        if(!sources[key].lastSeen || sources[key].lastSeen + TOAST_SUCCESS_TIME < time) {
            newData = true;
        }
        sources[key].lastSeen = time;
        sources[key].notified = false;
        localDatabase.saveEntry(STORE_NAME, {
            key: key,
            value: {
                time,
                value: event.value
            }
        });
        if(newData) {
            toast.create({
                text: `${sources[key].name} synced`,
                image: 'https://img.icons8.com/?size=48&id=1ODJ62iG96gX&format=png'
            });
            if(autoVisiting) {
                triggerAutoVisitor();
            }
        }
    }

    function update() {
        pages.requestRender(PAGE_NAME);
        const time = Date.now();
        for(const source of Object.values(sources)) {
            if(source.lastSeen && source.lastSeen + TOAST_WARN_TIME >= time) {
                continue;
            }
            if(source.notified && source.notified + TOAST_REWARN_TIME >= time) {
                continue;
            }
            toast.create({
                text: `${source.name} needs a sync`,
                image: 'https://img.icons8.com/?size=48&id=1ODJ62iG96gX&format=png',
                time: 5000
            });
            source.notified = time;
        }
    }

    async function visit(source) {
        if(!source.page) {
            return;
        }
        util.goToPage(source.page);
        if(source.element) {
            await elementWatcher.exists(source.element);
            $(source.element).click();
        }
    }

    function startAutoVisiting() {
        autoVisiting = true;
        triggerAutoVisitor();
    }

    const stopAutoVisiting = util.debounce(function() {
        autoVisiting = false;
        pages.open(PAGE_NAME);
        toast.create({
            text: `Auto sync finished`,
            image: 'https://img.icons8.com/?size=48&id=1ODJ62iG96gX&format=png'
        });
    }, 1500);

    function triggerAutoVisitor() {
        try {
            const time = Date.now();
            for(const source of Object.values(sources)) {
                let secondsAgo = (time - source.lastSeen) / 1000;
                if(source.page && (!source.lastSeen || secondsAgo >= 60*60)) {
                    visit(source);
                    return;
                }
            }
        } finally {
            stopAutoVisiting();
        }
    }

    function renderPage() {
        components.addComponent(autoVisitBlueprint);
        const header = components.search(sourceBlueprint, 'header');
        const item = components.search(sourceBlueprint, 'item');
        const buttons = components.search(sourceBlueprint, 'buttons');
        const time = Date.now();
        for(const source of Object.values(sources)) {
            sourceBlueprint.componentId = `syncTrackerSourceComponent_${source.name}`;
            header.title = source.name;
            let secondsAgo = (time - source.lastSeen) / 1000;
            if(!secondsAgo) {
                secondsAgo = Number.MAX_VALUE;
            }
            item.value = util.secondsToDuration(secondsAgo);
            buttons.hidden = secondsAgo < 60*60;
            buttons.buttons[0].action = visit.bind(null, source);
            components.addComponent(sourceBlueprint);
        }
    }

    const autoVisitBlueprint = {
        componentId: 'syncTrackerAutoVisitComponent',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [
            {
                rows: [
                    {
                        type: 'buttons',
                        buttons: [
                            {
                                text: 'Auto sync',
                                color: 'primary',
                                action: startAutoVisiting
                            }
                        ]
                    }
                ]
            }
        ]
    };

    const sourceBlueprint = {
        componentId: 'syncTrackerSourceComponent',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [
            {
                rows: [
                    {
                        type: 'header',
                        id: 'header',
                        title: '',
                        centered: true
                    }, {
                        type: 'item',
                        id: 'item',
                        name: 'Last detected',
                        value: ''
                    }, {
                        type: 'buttons',
                        id: 'buttons',
                        buttons: [
                            {
                                text: 'Visit',
                                color: 'danger',
                                action: undefined
                            }
                        ]
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
        'challenges-page',
        'changelog-page',
        'daily-quest-page',
        'equipment-page',
        'guild-page',
        'home-page',
        'leaderboards-page',
        'market-page',
        'merchant-page',
        'quests-page',
        'settings-page',
        'skill-page',
        'upgrade-page'
    ].join(', ');
    const selector = `:is(${sections})`;
    let gap

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'ui-changes',
            name: 'UI changes',
            default: true,
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

                ${selector} div.lock {
                    height: unset !important;
                    padding: 0 !important;
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
window.moduleRegistry.add('versionWarning', (request, toast) => {

    function initialise() {
        setInterval(run, 1000 * 60 * 5);
        run();
    }

    async function run() {
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
// abstractStateStore
window.moduleRegistry.add('abstractStateStore', (events, util) => {

    const SOURCES = [
        'inventory',
        'equipment-runes',
        'equipment-tomes',
        'structures',
        'enhancements',
        'structures-guild'
    ];

    const stateBySource = {};

    function initialise() {
        for(const source of SOURCES) {
            stateBySource[source] = {};
            events.register(`reader-${source}`, handleReader.bind(null, source));
        }
    }

    function handleReader(source, event) {
        let updated = false;
        if(event.type === 'full' || event.type === 'cache') {
            if(util.compareObjects(stateBySource[source], event.value)) {
                return;
            }
            updated = true;
            stateBySource[source] = event.value;
        }
        if(event.type === 'partial') {
            for(const key of Object.keys(event.value)) {
                if(stateBySource[source][key] === event.value[key]) {
                    continue;
                }
                updated = true;
                stateBySource[source][key] = event.value[key];
            }
        }
        if(updated) {
            events.emit(`state-${source}`, stateBySource[source]);
        }
    }

    initialise();

}
);
// configurationStore
window.moduleRegistry.add('configurationStore', (Promise, localConfigurationStore, _remoteConfigurationStore) =>  {

    const initialised = new Promise.Expiring(2000);
    let configs = null;

    const exports = {
        save,
        getConfigs
    };

    const configurationStore = _remoteConfigurationStore || localConfigurationStore;

    async function initialise() {
        configs = await configurationStore.load();
        for(const key in configs) {
            configs[key] = JSON.parse(configs[key]);
        }
        initialised.resolve(exports);
    }

    async function save(key, value) {
        await configurationStore.save(key, value);
        configs[key] = value;
    }

    function getConfigs() {
        return configs;
    }

    initialise();

    return initialised;

}
);
// equipmentStateStore
window.moduleRegistry.add('equipmentStateStore', (events, util, itemCache) => {

    let state = {};

    function initialise() {
        events.register('reader-equipment-equipment', handleEquipmentReader);
    }

    function handleEquipmentReader(event) {
        let updated = false;
        if(event.type === 'full' || event.type === 'cache') {
            if(util.compareObjects(state, event.value)) {
                return;
            }
            updated = true;
            state = event.value;
        }
        if(event.type === 'partial') {
            for(const key of Object.keys(event.value)) {
                if(state[key] === event.value[key]) {
                    continue;
                }
                updated = true;
                // remove items of similar type
                for(const itemType in itemCache.specialIds) {
                    if(Array.isArray(itemCache.specialIds[itemType]) && itemCache.specialIds[itemType].includes(+key)) {
                        for(const itemId of itemCache.specialIds[itemType]) {
                            delete state[itemId];
                        }
                    }
                }
                state[key] = event.value[key];
            }
        }
        if(updated) {
            events.emit('state-equipment-equipment', state);
        }
    }

    initialise();

}
);
// expStateStore
window.moduleRegistry.add('expStateStore', (events, util) => {

    const emitEvent = events.emit.bind(null, 'state-exp');
    const state = {};

    function initialise() {
        events.register('reader-exp', handleExpReader);
    }

    function handleExpReader(event) {
        let updated = false;
        for(const skill of event) {
            if(!state[skill.id]) {
                state[skill.id] = {
                    id: skill.id,
                    exp: 0,
                    level: 1
                };
            }
            if(skill.exp > state[skill.id].exp) {
                updated = true;
                state[skill.id].exp = skill.exp;
                state[skill.id].level = util.expToLevel(skill.exp);
            }
        }
        if(updated) {
            emitEvent(state);
        }
    }

    initialise();

}
);
// localConfigurationStore
window.moduleRegistry.add('localConfigurationStore', (localDatabase) => {

    const exports = {
        load,
        save
    };

    const STORE_NAME = 'settings';

    async function load() {
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        const configurations = {};
        for(const entry of entries) {
            configurations[entry.key] = entry.value;
        }
        return configurations;
    }

    async function save(key, value) {
        await localDatabase.saveEntry(STORE_NAME, {key, value});
    }

    return exports;

}
);
// marketStore
window.moduleRegistry.add('marketStore', (events) => {

    const emitEvent = events.emit.bind(null, 'state-market');
    let state = {};

    function initialise() {
        events.register('page', handlePage);
        events.register('reader-market', handleMarketReader);
    }

    function handlePage(event) {
        if(event.type == 'market') {
            state = {};
        }
    }

    function handleMarketReader(event) {
        state[event.type] = event.listings;
        state.lastType = event.type;
        state.last = event.listings;
        emitEvent(state);
    }

    initialise();

}
);
// statsStore
window.moduleRegistry.add('statsStore', (events, util, skillCache, itemCache, structuresCache, statNameCache) => {

    const emitEvent = events.emit.bind(null, 'state-stats');

    const exports = {
        get,
        getLevel,
        getInventoryItem,
        getEquipmentItem,
        getManyEquipmentItems,
        getAttackStyle,
        update
    };

    let exp = {};
    let inventory = {};
    let tomes = {};
    let equipment = {};
    let runes = {};
    let structures = {};
    let enhancements = {};
    let guildStructures = {};
    let various = {};

    let stats;

    function initialise() {
        let _update = util.debounce(update, 200);
        events.register('state-exp', event => (exp = event, _update()));
        events.register('state-inventory', event => (inventory = event, _update()));
        events.register('state-equipment-tomes', event => (tomes = event, _update()));
        events.register('state-equipment-equipment', event => (equipment = event, _update()));
        events.register('state-equipment-runes', event => (runes = event, _update()));
        events.register('state-structures', event => (structures = event, _update()));
        events.register('state-enhancements', event => (enhancements = event, _update()));
        events.register('state-structures-guild', event => (guildStructures = event, _update()));
        events.register('state-various', event => (various = event, _update()));
    }

    function get(stat, skill) {
        if(!stat) {
            return stats;
        }
        statNameCache.validate(stat);
        let value = 0;
        if(stats && stats.global[stat]) {
            value += stats.global[stat] || 0;
        }
        if(Number.isInteger(skill)) {
            skill = skillCache.byId[skill]?.technicalName;
        }
        if(stats && stats.bySkill[stat] && stats.bySkill[stat][skill]) {
            value += stats.bySkill[stat][skill];
        }
        return value;
    }

    function getLevel(skillId) {
        return exp[skillId] || {
            id: skillId,
            exp: 0,
            level: 1
        };
    }

    function getInventoryItem(itemId) {
        return inventory[itemId] || 0;
    }

    function getEquipmentItem(itemId) {
        return equipment[itemId] || tomes[itemId] || runes[itemId] || 0;
    }

    function getManyEquipmentItems(ids) {
        return ids.map(id => ({
            id,
            amount: getEquipmentItem(id)
        })).filter(a => a.amount);
    }

    function getAttackStyle() {
        return stats.attackStyle;
    }

    function update(excludedItemIds) {
        reset();
        processExp();
        processTomes();
        processEquipment(excludedItemIds);
        processRunes();
        processStructures();
        processEnhancements();
        processGuildStructures();
        processVarious();
        cleanup();
        if(!excludedItemIds) {
            emitEvent(stats);
        }
    }

    function reset() {
        stats = {
            attackStyle: null,
            bySkill: {},
            global: {}
        };
    }

    function processExp() {
        for(const id in exp) {
            const skill = skillCache.byId[id];
            addStats({
                bySkill: {
                    EFFICIENCY : {
                        [skill.technicalName]: 0.25
                    }
                }
            }, exp[id].level, 4);
            if(skill.displayName === 'Ranged') {
                addStats({
                    global: {
                        AMMO_PRESERVATION_CHANCE : 0.5
                    }
                }, exp[id].level, 2);
            }
        }
    }

    // first tomes, then equipments
    // because we need to know the potion effect multiplier first
    function processTomes() {
        for(const id in tomes) {
            const item = itemCache.byId[id];
            if(!item) {
                continue;
            }
            addStats(item.stats);
        }
    }

    function processEquipment(excludedItemIds) {
        let arrow;
        let bow;
        const potionMultiplier = get('INCREASED_POTION_EFFECT');
        for(const id in equipment) {
            if(equipment[id] <= 0) {
                continue;
            }
            if(excludedItemIds && excludedItemIds.has(+id)) {
                continue;
            }
            const item = itemCache.byId[id];
            if(!item) {
                continue;
            }
            if(item.stats.global.ATTACK_SPEED) {
                stats.attackStyle = item.skill;
            }
            if(item.name.endsWith('Arrow')) {
                arrow = item;
                addStats({
                    global: {
                        AMMO_PRESERVATION_CHANCE : -0.5
                    }
                }, util.tierToLevel(item.tier), 2);
                continue;
            }
            if(item.name.endsWith('Bow')) {
                bow = item;
            }
            let multiplier = 1;
            let accuracy = 2;
            if(potionMultiplier && /(Potion|Mix)$/.exec(item.name)) {
                multiplier = 1 + potionMultiplier / 100;
                accuracy = 10;
            }
            if(item.name.endsWith('Rune')) {
                multiplier = equipment[id];
                accuracy = 10;
            }
            addStats(item.stats, multiplier, accuracy);
        }
        if(bow && arrow) {
            addStats(arrow.stats);
        }
    }
    function processRunes() {
        for(const id in runes) {
            const item = itemCache.byId[id];
            if(!item) {
                continue;
            }
            addStats(item.stats, runes[id]);
        }
    }

    function processStructures() {
        for(const name in structures) {
            const structure = structuresCache.byName[name];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, structures[name] + 2/3);
        }
    }

    function processEnhancements() {
        for(const name in enhancements) {
            const structure = structuresCache.byName[name];
            if(!structure) {
                continue;
            }
            addStats(structure.enhance, enhancements[name]);
        }
    }

    function processGuildStructures() {
        for(const name in guildStructures) {
            const structure = structuresCache.byName[name];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, guildStructures[name]);
        }
    }

    function processVarious() {
        if(various.maxAmount) {
            const stats = {
                bySkill: {
                    MAX_AMOUNT: {}
                }
            };
            for(const skillId in various.maxAmount) {
                const skill = skillCache.byId[skillId];
                if(various.maxAmount[skillId]) {
                    stats.bySkill.MAX_AMOUNT[skill.technicalName] = various.maxAmount[skillId];
                }
            }
            addStats(stats);
        }
    }

    function cleanup() {
        // base
        addStats({
            global: {
                HEALTH: 10,
                AMMO_PRESERVATION_CHANCE : 65
            }
        });
        // fallback
        if(!stats.attackStyle) {
            stats.attackStyle = 'OneHanded';
        }
        if(!stats.global.ATTACK_SPEED) {
            stats.global.ATTACK_SPEED = 3;
            stats.attackStyle = '';
        }
        // health percent
        const healthPercent = get('HEALTH_PERCENT');
        if(healthPercent) {
            const health = get('HEALTH');
            addStats({
                global: {
                    HEALTH : Math.floor(healthPercent * health / 100)
                }
            })
        }
        // damage percent
        const damagePercent = get('DAMAGE_PERCENT');
        if(damagePercent) {
            const damage = get('DAMAGE');
            addStats({
                global: {
                    DAMAGE : Math.floor(damagePercent * damage / 100)
                }
            })
        }
        // bonus level efficiency
        if(stats.bySkill['BONUS_LEVEL']) {
            for(const skill in stats.bySkill['BONUS_LEVEL']) {
                addStats({
                    bySkill: {
                        EFFICIENCY: {
                            [skill]: 0.25
                        }
                    }
                }, Math.round(stats.bySkill['BONUS_LEVEL'][skill]), 4);
            }
        }
        // clamping
        if(stats.global['AMMO_PRESERVATION_CHANCE'] < 65) {
            stats.global['AMMO_PRESERVATION_CHANCE'] = 65;
        }
        if(stats.global['AMMO_PRESERVATION_CHANCE'] > 80) {
            stats.global['AMMO_PRESERVATION_CHANCE'] = 80;
        }
    }

    function addStats(newStats, multiplier = 1, accuracy = 1) {
        if(newStats.global) {
            for(const stat in newStats.global) {
                if(!stats.global[stat]) {
                    stats.global[stat] = 0;
                }
                stats.global[stat] += Math.round(accuracy * multiplier * newStats.global[stat]) / accuracy;
            }
        }
        if(newStats.bySkill) {
            for(const stat in newStats.bySkill) {
                if(!stats.bySkill[stat]) {
                    stats.bySkill[stat] = {};
                }
                for(const skill in newStats.bySkill[stat]) {
                    if(!stats.bySkill[stat][skill]) {
                        stats.bySkill[stat][skill] = 0;
                    }
                    stats.bySkill[stat][skill] += Math.round(accuracy * multiplier * newStats.bySkill[stat][skill]) / accuracy;
                }
            }
        }
    }

    initialise();

    return exports;

}
);
// variousStateStore
window.moduleRegistry.add('variousStateStore', (events, skillCache) => {

    const emitEvent = events.emit.bind(null, 'state-various');
    const state = {};

    function initialise() {
        events.register('reader-various', handleReader);
    }

    function handleReader(event) {
        const updated = merge(state, event);
        if(updated) {
            emitEvent(state);
        }
    }

    function merge(target, source) {
        let updated = false;
        for(const key in source) {
            if(!(key in target)) {
                target[key] = source[key];
                updated = true;
                continue;
            }
            if(typeof target[key] === 'object' && typeof source[key] === 'object') {
                updated |= merge(target[key], source[key]);
                continue;
            }
            if(target[key] !== source[key]) {
                target[key] = source[key];
                updated = true;
                continue;
            }
        }
        return updated;
    }

    initialise();

}
);
// actionCache
window.moduleRegistry.add('actionCache', (request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null
    };

    async function initialise() {
        const actions = await request.listActions();
        exports.byId = {};
        exports.byName = {};
        for(const action of actions) {
            exports.list.push(action);
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
);
// dropCache
window.moduleRegistry.add('dropCache', (request, Promise, itemCache, actionCache, skillCache, ingredientCache) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byAction: null,
        byItem: null,
        boneCarveMappings: null,
        lowerGatherMappings: null,
        conversionMappings: null
    };

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
        value: function(selector) {
            return [...new Set(this)];
        }
    });

    async function initialise() {
        const drops = await request.listDrops();
        exports.byAction = {};
        exports.byItem = {};
        for(const drop of drops) {
            exports.list.push(drop);
            if(!exports.byAction[drop.action]) {
                exports.byAction[drop.action] = [];
            }
            exports.byAction[drop.action].push(drop);
            if(!exports.byItem[drop.item]) {
                exports.byItem[drop.item] = [];
            }
            exports.byItem[drop.item].push(drop);
        }
        extractBoneCarvings();
        extractLowerGathers();
        extractConversions();
        initialised.resolve(exports);
    }

    // I'm sorry for what follows
    function extractBoneCarvings() {
        let name;
        exports.boneCarveMappings = exports.list
            // filtering
            .filter(drop => drop.type === 'GUARANTEED')
            .filter(drop => (name = itemCache.byId[drop.item].name, name.endsWith('Bone') || name.endsWith('Fang')))
            .filter(drop => actionCache.byId[drop.action].skill === 'Combat')
            // sort
            .sort((a,b) => actionCache.byId[a.action].level - actionCache.byId[b.action].level)
            // per level
            ._groupBy(drop => actionCache.byId[drop.action].level)
            .map(a => a[0].item)
            .map((item,i,all) => ({
                from: item,
                to: [].concat([all[i-1]]).concat([all[i-2]]).filter(a => a)
            }))
            .reduce((a,b) => (a[b.from] = b.to, a), {});
    }

    function extractLowerGathers() {
        exports.lowerGatherMappings = exports.list
            // filtering
            .filter(drop => drop.type === 'REGULAR')
            .filter(drop => skillCache.byName[actionCache.byId[drop.action].skill].type === 'Gathering')
            // sort
            .sort((a,b) => actionCache.byId[a.action].level - actionCache.byId[b.action].level)
            // per action, the highest chance drop
            ._groupBy(drop => drop.action)
            .map(a => a.reduce((a,b) => a.chance >= b.chance ? a : b))
            // per skill, and for farming,
            ._groupBy(drop => {
                const action = actionCache.byId[drop.action];
                let skill = action.skill
                if(skill === 'Farming') {
                    // add flower or vegetable suffix
                    skill += `-${action.image.split('/')[1].split('-')[0]}`;
                }
                return skill;
            })
            .flatMap(a => a
                ._groupBy(drop => actionCache.byId[drop.action].level)
                .map(b => b.map(drop => drop.item)._distinct())
                .flatMap((b,i,all) => b.map(item => ({
                    from: item,
                    to: [].concat(all[i-1]).concat(all[i-2]).filter(a => a)
                })))
            )
            .reduce((a,b) => (a[b.from] = b.to, a), {});
    }

    function extractConversions() {
        exports.conversionMappings = exports.list
            .filter(a => actionCache.byId[a.action].type === 'CONVERSION')
            .map(drop => ({
                from: ingredientCache.byAction[drop.action][0].item,
                to: drop.item,
                amount: drop.amount
            }))
            ._groupBy(a => a.to)
            .reduce((a,b) => (a[b[0].to] = b, a), {});
    }

    initialise();

    return initialised;

}
);
// ingredientCache
window.moduleRegistry.add('ingredientCache', (request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byAction: null,
        byItem: null
    };

    async function initialise() {
        const ingredients = await request.listIngredients();
        exports.byAction = {};
        exports.byItem = {};
        for(const ingredient of ingredients) {
            if(!exports.byAction[ingredient.action]) {
                exports.byAction[ingredient.action] = [];
            }
            exports.byAction[ingredient.action].push(ingredient);
            if(!exports.byItem[ingredient.item]) {
                exports.byItem[ingredient.item] = [];
            }
            exports.byItem[ingredient.item].push(ingredient);
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
);
// itemCache
window.moduleRegistry.add('itemCache', (request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byImage: null,
        attributes: null,
        specialIds: {
            coins: null,
            food: null,
            arrow: null,
            map: null,
            runeGathering: null,
            potionCombat: null,
            potionGathering: null,
            potionCrafting: null,
        }
    };

    async function initialise() {
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
            if(item.attributes.ATTACK_SPEED) {
                item.attributes.ATTACK_SPEED /= 2;
            }
            for(const stat in item.stats.bySkill) {
                if(item.stats.bySkill[stat].All) {
                    item.stats.global[stat] = item.stats.bySkill[stat].All;
                    delete item.stats.bySkill[stat].All;
                    if(!Object.keys(item.stats.bySkill[stat]).length) {
                        delete item.stats.bySkill[stat];
                    }
                }
            }
        }
        for(const image of Object.keys(exports.byImage)) {
            if(exports.byImage[image].duplicate) {
                delete exports.byImage[image];
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
        exports.specialIds.coins = exports.byName['Coins'].id;
        exports.specialIds.food = exports.list.filter(a => /^Cooked|Pie$/.exec(a.name)).map(a => a.id);
        exports.specialIds.arrow = exports.list.filter(a => /Arrow$/.exec(a.name)).map(a => a.id);
        exports.specialIds.map = exports.list.filter(a => /Map \d+$/.exec(a.name)).map(a => a.id);
        const potions = exports.list.filter(a => /(Potion|Mix)$/.exec(a.name));
        exports.specialIds.potionCombat = potions.filter(a => !a.name.includes('Gather') && !a.name.includes('Craft') && !a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.potionGathering = potions.filter(a => a.name.includes('Gather')).map(a => a.id);
        exports.specialIds.potionCrafting = potions.filter(a => a.name.includes('Craft') || a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.runeGathering = exports.list.filter(a => /(Woodcutting|Mining|Farming|Fishing) Rune$/.exec(a.name)).map(a => a.id);
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
);
// monsterCache
window.moduleRegistry.add('monsterCache', (request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null
    };

    async function initialise() {
        const monsters = await request.listMonsters();
        exports.byId = {};
        exports.byName = {};
        for(const monster of monsters) {
            exports.list.push(monster);
            exports.byId[monster.id] = monster;
            exports.byName[monster.name] = monster;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
);
// recipeCache
window.moduleRegistry.add('recipeCache', (request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byImage: null
    };

    async function initialise() {
        exports.list = await request.listRecipes();
        exports.byId = {};
        exports.byName = {};
        exports.byImage = {};
        for(const recipe of exports.list) {
            if(!exports.byId[recipe.id]) {
                exports.byId[recipe.id] = recipe;
            }
            if(!exports.byName[recipe.name]) {
                exports.byName[recipe.name] = recipe;
            }
            if(!exports.byName[recipe.name]) {
                exports.byName[recipe.name] = recipe;
            }
            const lastPart = recipe.image.split('/').at(-1);
            if(!exports.byImage[lastPart]) {
                exports.byImage[lastPart] = recipe;
            }
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
);
// skillCache
window.moduleRegistry.add('skillCache', (request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byTechnicalName: null,
    };

    async function initialise() {
        const skills = await request.listSkills();
        exports.byId = {};
        exports.byName = {};
        exports.byTechnicalName = {};
        for(const skill of skills) {
            exports.list.push(skill);
            exports.byId[skill.id] = skill;
            exports.byName[skill.displayName] = skill;
            exports.byTechnicalName[skill.technicalName] = skill;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
);
// statNameCache
window.moduleRegistry.add('statNameCache', () => {

    const exports = {
        validate
    };

    const statNames = new Set([
        // ITEM_STAT_ATTRIBUTE
        'AMMO_PRESERVATION_CHANCE',
        'ATTACK_SPEED',
        'BONUS_LEVEL',
        'COIN_SNATCH',
        'COMBAT_EXP',
        'DOUBLE_EXP',
        'DOUBLE_DROP',
        'EFFICIENCY',
        'LOWER_TIER_CHANCE',
        'MERCHANT_SELL_CHANCE',
        'PRESERVATION',
        'SKILL_SPEED',
        // ITEM_ATTRIBUTE
        'ARMOUR',
        'BLEED_CHANCE',
        'BLOCK_CHANCE',
        'CARVE_CHANCE',
        'COIN_SNATCH',
        'COMBAT_EXP',
        'CRIT_CHANCE',
        'DAMAGE',
        'DAMAGE_PERCENT',
        'DAMAGE_RANGE',
        'DECREASED_POTION_DURATION',
        'DUNGEON_DAMAGE',
        'FOOD_EFFECT',
        'FOOD_PRESERVATION_CHANCE',
        'HEAL',
        'HEALTH',
        'HEALTH_PERCENT',
        'INCREASED_POTION_EFFECT',
        'MAP_FIND_CHANCE',
        'PARRY_CHANCE',
        'PASSIVE_FOOD_CONSUMPTION',
        'REVIVE_TIME',
        'STUN_CHANCE',
        // FRONTEND ONLY
        'MAX_AMOUNT'
    ]);

    function validate(name) {
        if(!statNames.has(name)) {
            throw `Unsupported stat usage : ${name}`;
        }
    }

    return exports;

});
// structuresCache
window.moduleRegistry.add('structuresCache', (request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byName: null
    };

    async function initialise() {
        const enrichedStructures = await request.listStructures();
        exports.byName = {};
        for(const enrichedStructure of enrichedStructures) {
            exports.list.push(enrichedStructure);
            exports.byName[enrichedStructure.name] = enrichedStructure;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
);
window.moduleRegistry.build();
