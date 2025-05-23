// ==UserScript==
// @name         Ironwood RPG - Pancake-Scripts
// @namespace    http://tampermonkey.net/
// @version      6.0.0
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
window.PANCAKE_VERSION = '6.0.0';
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

    function build() {
        createTree();
        detectCircularDependencies();
        loadLeafModules();
    }

    function createTree() {
        for(const module of Object.values(modules)) {
            for(const dependency of module.dependencies) {
                dependency.module = modules[dependency.name];
                if(!dependency.module) {
                    if(dependency.optional) {
                        continue;
                    }
                    throw `Unresolved dependency : ${dependency.name}`;
                }
                dependency.module.dependents.push(module);
            }
        }
    }

    function detectCircularDependencies() {
        const visited = new Set();
        for(const module of Object.values(modules)) {
            let chain = visit(module, visited);
            if(chain) {
                chain = chain.slice(chain.indexOf(chain.at(-1)));
                chain = chain.join(' -> ');
                console.error(`Circular dependency in chain : ${chain}`);
                return;
            }
        }
    }

    function visit(module, visited, stack = []) {
        if(!module) {
            return;
        }
        if(stack.includes(module.name)) {
            stack.push(module.name);
            return stack;
        }
        if(visited.has(module.name)) {
            return;
        }
        stack.push(module.name);
        for(const dependency of module.dependencies) {
            const subresult = visit(dependency.module, visited, stack);
            if(subresult) {
                return subresult;
            }
        }
        stack.pop();
        visited.add(module.name);
    }

    function loadLeafModules() {
        for(const module of Object.values(modules)) {
            if(!isMissingDependencies(module)) {
                buildModule(module);
            }
        }
    }

    function createModule(name, initialiser) {
        const dependencies = extractParametersFromFunction(initialiser).map(dependency => ({
                name: dependency.replaceAll('_', ''),
                optional: dependency.startsWith('_'),
                module: null
            }));
        return {
            name,
            initialiser,
            dependencies,
            dependents: []
        };
    }

    async function buildModule(module) {
        if(module.built) {
            return;
        }
        if(isMissingDependencies(module)) {
            return;
        }

        const parameters = module.dependencies.map(a => a.module?.reference);
        try {
            module.reference = await module.initialiser.apply(null, parameters);
        } catch(e) {
            console.error(`Failed building ${module.name}`, e);
            return;
        }
        module.built = true;

        for(const dependent of module.dependents) {
            buildModule(dependent);
        }
    }

    function extractParametersFromFunction(fn) {
        const PARAMETER_NAMES = /([^\s,]+)/g;
        var fnStr = fn.toString();
        var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(PARAMETER_NAMES);
        return result || [];
    }

    function isMissingDependencies(module) {
        for(const dependency of module.dependencies) {
            if(dependency.optional && dependency.module && !dependency.module.built) {
                return true;
            }
            if(!dependency.optional && !dependency.module.built) {
                return true;
            }
        }
        return false;
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
        // custom
        focus: '#fff021',
        // component styling
        componentLight: '#393532',
        componentRegular: '#28211b',
        componentDark: '#211a12',
        componentHover: '#3c2f26',
        componentSelected: '#1c1916'
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
        removeAllComponents,
        search
    };

    const initialised = new Promise.Expiring(2000, 'components');
    const STORE_NAME = 'component-tabs';
    const rowTypeMappings = {
        item: createRow_Item,
        input: createRow_Input,
        itemWithInput: createRow_ItemWithInput,
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

    function removeAllComponents() {
        $('.custom-component').remove();
    }

    async function addComponent(blueprint) {
        if(blueprint?.meta?.focused) {
            return; // delay until no longer having focus
        }
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
                .attr('id', blueprint.componentId)
                .append('<div class="componentStateMessage" style="display: none"></div>');
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
            component.append(createRow(rowBlueprint, blueprint));
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

    function createRow(rowBlueprint, rootBlueprint) {
        if(!rowTypeMappings[rowBlueprint.type]) {
            console.warn(`Skipping unknown row type in blueprint: ${rowBlueprint.type}`, rowBlueprint);
            return;
        }
        if(rowBlueprint.hidden) {
            return;
        }
        return rowTypeMappings[rowBlueprint.type](rowBlueprint, rootBlueprint);
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

    function createRow_Input(inputBlueprint, rootBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        if(inputBlueprint.text) {
            const text = $('<div/>')
                .addClass('myItemInputText')
                .addClass(inputBlueprint.class || '')
                .text(inputBlueprint.text)
                .css('flex', `${inputBlueprint.layout?.split('/')[0] || 1}`);
            if(inputBlueprint.light) {
                text
                    .css('padding', '0')
                    .css('height', 'inherit')
                    .css('color', '#aaa');
            }
            parentRow.append(text);
        }
        const input = $('<input/>')
            .attr('id', inputBlueprint.id)
            .addClass('myItemInput')
            .addClass(inputBlueprint.class || '')
            .attr('type', inputBlueprint.inputType || 'text')
            .attr('placeholder', inputBlueprint.name)
            .attr('value', inputBlueprint.value || '')
            .css('flex', `${inputBlueprint.layout?.split('/')[1] || 1}`)
            .keyup(e => inputBlueprint.value = e.target.value)
            .on('focusin', onInputFocusIn.bind(null, rootBlueprint))
            .on('focusout', onInputFocusOut.bind(null, rootBlueprint, inputBlueprint));
            if(inputBlueprint.light) {
                input
                    .css('padding', '0')
                    .css('height', 'inherit')
                    .css('color', '#aaa');
            }
        parentRow.append(input)
        return parentRow;
    }

    function createRow_ItemWithInput(itemWithInputBlueprint, rootBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');

        if(itemWithInputBlueprint.image) {
            parentRow.append(createImage(itemWithInputBlueprint));
        }

        if(itemWithInputBlueprint?.name) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemName name')
                        .text(itemWithInputBlueprint.name)
                );
        }

        parentRow
            .append(
                $('<input/>')
                    .attr('id', itemWithInputBlueprint.id)
                    .addClass('myItemInput')
                    .addClass(itemWithInputBlueprint.class || '')
                    .attr('type', itemWithInputBlueprint.inputType || 'text')
                    .attr('placeholder', itemWithInputBlueprint.placeholder)
                    .attr('value', itemWithInputBlueprint.inputValue || '')
                    .css('flex', `${itemWithInputBlueprint.layout?.split('/')[1] || 1}`)
                    .css('max-width', '80px')
                    .css('height', 'inherit')
                    .keyup(inputDelay(function(e) {
                        itemWithInputBlueprint.inputValue = e.target.value;
                        if(itemWithInputBlueprint.action) {
                            itemWithInputBlueprint.action(itemWithInputBlueprint.inputValue);
                        }
                    }, itemWithInputBlueprint.delay || 0))
                    .on('focusin', onInputFocusIn.bind(null, rootBlueprint))
                    .on('focusout', onInputFocusOut.bind(null, rootBlueprint))
            )

        parentRow
            .append(
                $('<div/>')
                    .addClass('myItemValue')
                    .text(itemWithInputBlueprint?.extra || '')
            );

        if(itemWithInputBlueprint?.value) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemWorth')
                        .text(itemWithInputBlueprint.value)
                )
        }
        return parentRow;
    }

    function onInputFocusIn(rootBlueprint) {
        if(!rootBlueprint.meta) {
            rootBlueprint.meta = {};
        }
        rootBlueprint.meta.focused = true;
        $(`#${rootBlueprint.componentId}`)
            .find('.componentStateMessage')
            .text('Focused - interrupted updates')
            .show();
    }

    function onInputFocusOut(rootBlueprint, inputBlueprint) {
        if(!rootBlueprint.meta) {
            rootBlueprint.meta = {};
        }
        rootBlueprint.meta.focused = false;
        $(`#${rootBlueprint.componentId}`)
            .find('.componentStateMessage')
            .hide();
        if(inputBlueprint.action) {
            inputBlueprint.action(inputBlueprint.value);
        }
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
            select.append(`<option value='${option.value}' ${option.selected ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}>${option.text}</option>`);
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

    function createRow_Segment(segmentBlueprint, rootBlueprint) {
        if(segmentBlueprint.hidden) {
            return;
        }
        return segmentBlueprint.rows.flatMap(a => createRow(a, rootBlueprint));
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
            position: relative;
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
        .componentStateMessage {
            position: absolute;
            top: .5em;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            font-family: Jost,Helvetica Neue,Arial,sans-serif;
            flex-direction: column;
            white-space: nowrap;
            background-color: black;
            padding: .4rem;
            border: 1px solid #3e3e3e;
            border-radius: .4em;
            gap: .4em;
        }
    `;

    initialise();

    return initialised;

}
);
// configuration
window.moduleRegistry.add('configuration', (configurationStore) => {

    const exports = {
        registerCheckbox,
        registerInput,
        registerDropdown,
        registerButton,
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

    const BUTTON_KEYS = ['category', 'key', 'name', 'handler'];
    function registerButton(item) {
        validate(item, BUTTON_KEYS);
        return register(Object.assign(item, {
            type: 'button'
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
        if(item.type === 'button') {
            return;
        }
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
window.moduleRegistry.add('elementCreator', (colorMapper) => {

    const exports = {
        addStyles,
        getButton,
        getTag
    };

    function initialise() {
        addStyles(styles);
    }

    function addStyles(css) {
        const head = document.getElementsByTagName('head')[0]
        if(!head) {
            console.error('Could not add styles, missing head');
            return;
        }
        const style = document.createElement('style');
        style.innerHTML = css;
        head.appendChild(style);
    }

    function getButton(text, onClick) {
        const element = $(`<button class='myButton'>${text}</button>`)
            .css('background-color', colorMapper('componentRegular'))
            .css('display', 'inline-block')
            .css('padding', '0 5px')
            .css('margin', '0 5px');
        if(onClick) {
            element.click(onClick);
        }
        return element;
    }

    function getTag(text, image, clazz) {
        const element = $(`<div class='custom-element-creator-tag'>${text}</div>`)
            .addClass(clazz);
        if(image) {
            const imageElement = $(`<img src='${image}'/>`);
            element.prepend(imageElement);
        }
        return element;
    }

    const styles = `
        .custom-element-creator-tag {
            border-radius: 4px;
            padding: 0 2px;
            border: 1px solid #263849;
            font-size: 14px;
            color: #aaa;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
            margin: 2px;
        }

        .custom-element-creator-tag > img {
            width: 15px;
            height: 15px;
            filter: brightness(0.9);
            image-rendering: auto;
        }
    `;

    initialise();

    return exports;

}
);
// elementWatcher
window.moduleRegistry.add('elementWatcher', (Promise, polyfill) => {

    const exports = {
        exists,
        childAdded,
        childAddedContinuous,
        idle,
        addRecursiveObserver,
        addReverseRecursiveObserver
    }

    const $ = window.$;

    async function exists(selector, delay = 10, timeout = 5000, inverted = false) {
        const promiseWrapper = new Promise.Checking(() => {
            let result = $(selector)[0];
            return inverted ? !result : result;
        }, delay, timeout, `elementWatcher - exists - ${selector}`);
        return promiseWrapper;
    }

    async function childAdded(selector) {
        const promiseWrapper = new Promise.Expiring(5000, `elementWatcher - childAdded - ${selector}`);

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
        const observer = new MutationObserver(function(mutations) {
            if(mutations.find(a => a.addedNodes?.length)) {
                callback();
            }
        });
        observer.observe(parent, { childList: true });
    }

    async function addRecursiveObserver(callback, ...chain) {
        const root = await exists(chain[0]);
        chain = chain.slice(1);
        _addRecursiveObserver(callback, root, chain, false, true);
    }

    async function addReverseRecursiveObserver(callback, ...chain) {
        const root = await exists(chain[0]);
        chain = chain.slice(1);
        _addRecursiveObserver(callback, root, chain, true, true);
    }

    function _addRecursiveObserver(callback, element, chain, reverse, initial) {
        if(chain.length === 0) {
            if(!(initial && reverse)) {
                callback(element);
            }
        }
        const observer = new MutationObserver(function(mutations) {
            const match = mutations
                .flatMap(a => Array.from(reverse ? a.removedNodes : a.addedNodes))
                .find(a => $(a).is(chain[0]));
            if(match) {
                _addRecursiveObserver(callback, match, chain.slice(1), reverse, false);
            }
        });
        observer.observe(element, { childList: true });
        for(const child of element.children) {
            if($(child).is(chain[0])) {
                _addRecursiveObserver(callback, child, chain.slice(1), reverse, true);
            }
        }
    }

    async function idle() {
        const promise = new Promise.Expiring(1000, 'elementWatcher - idle');
        polyfill.requestIdleCallback(() => {
            promise.resolve();
        });
        return promise;
    }

    return exports;

}
);
// EstimationGenerator
window.moduleRegistry.add('EstimationGenerator', (events, estimator, statsStore, util, skillCache, actionCache, itemCache, structuresCache) => {

    const EVENTS = {
        exp: {
            event: 'state-exp',
            default: skillCache.list.reduce((a,b) => (a[b.id] = {id:b.id,exp:0,level:1}, a), {})
        },
        tomes: {
            event: 'state-equipment-tomes',
            default: {}
        },
        equipment: {
            event: 'state-equipment-equipment',
            default: {}
        },
        runes: {
            event: 'state-equipment-runes',
            default: {}
        },
        structures: {
            event: 'state-structures',
            default: {}
        },
        enchantments: {
            event: 'state-enchantments',
            default: {}
        },
        guild: {
            event: 'state-structures-guild',
            default: {}
        }
    };

    class EstimationGenerator {

        #backup;
        #state;
        #skillId;
        #actionId;

        constructor() {
            this.#backup = {};
            this.#state = {};
            this.reset();
        }

        reset() {
            this.#backup = {};
            this.#state = {};
            this.#skillId = null;
            this.#actionId = null;
            for(const name in EVENTS) {
                this.#state[name] = structuredClone(EVENTS[name].default);
            }
            return this;
        }

        run() {
            this.#populateBackup();
            this.#sendCustomEvents();
            statsStore.update(new Set());
            const estimation = estimator.get(this.#skillId, this.#actionId);
            this.#sendBackupEvents();
            return estimation;
        }

        #populateBackup() {
            this.#backup = {};
            for(const name in EVENTS) {
                this.#backup[name] = events.getLast(EVENTS[name].event);
            }
        }

        #sendCustomEvents() {
            for(const name in this.#state) {
                events.emit(EVENTS[name].event, this.#state[name]);
            }
        }

        #sendBackupEvents() {
            for(const name in this.#backup) {
                events.emit(EVENTS[name].event, this.#backup[name]);
            }
        }

        skill(skill) {
            if(typeof skill === 'string') {
                const match = skillCache.byName[skill];
                if(!match) {
                    throw `Could not find skill ${skill}`;
                }
                skill = match.id;
            }
            this.#skillId = skill;
            return this;
        }

        action(action) {
            if(typeof action === 'string') {
                const match = actionCache.byName[action];
                if(!match) {
                    throw `Could not find action ${action}`;
                }
                action = match.id;
            }
            this.#actionId = action;
            return this;
        }

        level(skill, level, exp = 0) {
            if(typeof skill === 'string') {
                const match = skillCache.byName[skill];
                if(!match) {
                    throw `Could not find skill ${skill}`;
                }
                skill = match.id;
            }
            if(!exp) {
                exp = util.levelToExp(level);
            }
            this.#state.exp[skill] = {
                id: skill,
                exp,
                level
            };
            return this;
        }

        inventory(item, amount) {
            // noop
            return this;
        }

        equipment(item, amount = 1) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${item}`;
                }
                item = match.id;
            }
            this.#state.equipment[item] = amount;
            return this;
        }

        rune(item, amount = 1) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${item}`;
                }
                item = match.id;
            }
            this.#state.runes[item] = amount;
            return this;
        }

        tome(item) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${item}`;
                }
                item = match.id;
            }
            this.#state.tomes[item] = 1;
            return this;
        }

        structure(structure, level) {
            if(typeof structure === 'string') {
                const match = structuresCache.byName[structure];
                if(!match) {
                    throw `Could not find structure ${structure}`;
                }
                structure = match.id;
            }
            this.#state.structures[structure] = level;
            return this;
        }

        enchantment(structure, level) {
            if(typeof structure === 'string') {
                const match = structuresCache.byName[structure];
                if(!match) {
                    throw `Could not find structure ${structure}`;
                }
                structure = match.id;
            }
            this.#state.enchantments[structure] = level;
            return this;
        }

        guild(structure, level) {
            if(typeof structure === 'string') {
                structure = 'Guild ' + structure;
                const match = structuresCache.byName[structure];
                if(!match) {
                    throw `Could not find structure ${structure}`;
                }
                structure = match.id;
            }
            this.#state.guild[structure] = level;
            return this;
        }

        export() {
            return structuredClone(this.#state);
        }

        import(state) {
            this.#state = structuredClone(state);
            return this;
        }

    }

    return EstimationGenerator;

}
);
// events
window.moduleRegistry.add('events', () => {

    const exports = {
        register,
        emit,
        getLast,
        getLastCache
    };

    const handlers = {};
    const lastCache = {};

    function register(name, handler) {
        if(!handlers[name]) {
            handlers[name] = [];
        }
        handlers[name].push(handler);
        if(lastCache[name]) {
            handle(handler, lastCache[name], name);
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
            handle(handler, data, name);
        }
    }

    function handle(handler, data, name) {
        try {
            handler(data, name);
        } catch(e) {
            console.error('Something went wrong', e);
        }
    }

    function getLast(name) {
        return lastCache[name];
    }

    function getLastCache() {
        return lastCache;
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
            events.emit('url', arguments[2]);
        };
        const replaceState = history.replaceState;
        history.replaceState = function() {
            replaceState.apply(history, arguments);
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
        let uses = 0;
        if(amountElements.length) {
            var amountText = amountElements.text();
            if(!amountText) {
                return false;
            }
            if(amountText.includes(' / ')) {
                amountText = amountText.split(' / ')[0];
            }
            amount = util.parseNumber(amountText);
            if(amountText.includes('&')) {
                const usesText = amountText.split('&')[1];
                uses = util.parseNumber(usesText);
            }
        }
        if(!uses) {
            const usesText = element.find('.uses, .use').text();
            if(usesText && !usesText.endsWith('HP')) {
                uses = util.parseNumber(usesText);
            }
        }
        amount += uses;
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

    const initialised = new Promise.Expiring(2000, 'localDatabase');
    let database = null;

    const databaseName = 'PancakeScripts';

    function initialise() {
        const request = window.indexedDB.open(databaseName, 7);
        request.onsuccess = function() {
            database = this.result;
            initialised.resolve(exports);
        };
        request.onerror = function(event) {
            console.error(`Failed creating IndexedDB : ${event.target.errorCode}`);
        };
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if(event.oldVersion <= 0) {
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
            if(event.oldVersion <= 4) {
                db
                    .createObjectStore('various', { keyPath: 'key' })
                    .createIndex('key', 'key', { unique: true });
            }
            if(event.oldVersion <= 5) {
                db
                    .createObjectStore('discord', { keyPath: 'key' })
                    .createIndex('key', 'key', { unique: true });
            }
            if(event.oldVersion <= 6) {
                db
                    .createObjectStore('item-price', { keyPath: 'key' })
                    .createIndex('key', 'key', { unique: true });
            }
        };
    }

    async function getAllEntries(storeName) {
        const result = new Promise.Expiring(1000, 'localDatabase - getAllEntries');
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
        const result = new Promise.Expiring(1000, 'localDatabase - saveEntry');
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
        const result = new Promise.Expiring(1000, 'localDatabase - removeEntry');
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
// logService
window.moduleRegistry.add('logService', () => {

    const exports = {
        error,
        get
    };

    const errors = [];

    function initialise() {
        window.onerror = function(message, url, lineNumber, columnNumber, error) {
            errors.push({
                time: Date.now(),
                message,
                url,
                lineNumber,
                columnNumber,
                error
            });
            return false;
        };
    }

    function error() {
        errors.push({
            time: Date.now(),
            value: [...arguments]
        });
    }

    function get() {
        return errors;
    }

    initialise();

    return exports;

});
// pageDetector
window.moduleRegistry.add('pageDetector', (events, elementWatcher, util) => {

    const emitEvent = events.emit.bind(null, 'page');
    const debouncedUpdate = util.debounce(update, 100);

    async function initialise() {
        events.register('url', debouncedUpdate);
        // taming - right menu
        $(document).on('click', 'taming-page .header:contains("Menu") ~ button', () => debouncedUpdate());
        // taming - expedition page
        $(document).on('click', 'taming-page .header:contains("Expeditions") ~ button', () => debouncedUpdate());
        // taming - expedition selection
        $(document).on('click', 'taming-page .header:contains("Expeditions") > button', () => debouncedUpdate());
        // marks - right menu
        $(document).on('click', 'marks-page .header:contains("Menu") ~ button', () => debouncedUpdate());
        // action - menu
        $(document).on('click', 'skill-page actions-component .filters', () => debouncedUpdate());
        // action - submenu
        $(document).on('click', 'skill-page actions-component .sort > .container', () => debouncedUpdate());
    }

    async function update(url) {
        if(!url) {
            url = events.getLast('url');
        }
        let result = null;
        const parts = url.split('/');
        await elementWatcher.idle();
        if(url.includes('/skill/15')) {
            const menu = $('taming-page .header:contains("Menu") ~ button.row-active .name').text().toLowerCase();
            let tier = 0;
            if(menu === 'expeditions') {
                const level = util.parseNumber($('taming-page .header:contains("Expeditions") ~ button.row-active .level').text());
                tier = util.levelToTier(level);
            }
            result = {
                type: 'taming',
                menu,
                tier
            };
        } else if(url.includes('/marks')) {
            const menu = $('marks-page .header:contains("Menu") ~ button.row-active .name').text().toLowerCase();
            result = {
                type: 'marks',
                menu
            };
        } else if(url.includes('/skill/') && url.includes('/action/')) {
            const menu = $('skill-page actions-component .filters > button[disabled]').text().toLowerCase() || null;
            const submenu = $('skill-page actions-component .sort button[disabled]').text().toLowerCase() || null;
            result = {
                type: 'action',
                skill: +parts[parts.length-3],
                action: +parts[parts.length-1],
                menu,
                submenu
            };
        } else if(url.includes('house/build')) {
            result = {
                type: 'structure',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/enchant')) {
            result = {
                type: 'enchantment',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/automate')) {
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
        if(!page) {
            throw `Unknown page : ${name}`;
        }
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
        await util.goToPage('settings');
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
        } else if(page.type === 'enchantment') {
            headerName = 'House';
        } else if(page.type === 'automation') {
            headerName = 'House';
        } else if(page.type === 'taming') {
            headerName = 'Taming';
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
// petUtil
window.moduleRegistry.add('petUtil', (petCache, petPassiveCache, expeditionCache, itemCache, util, request, Promise) => {

    const STATS_BASE = ['health', 'attack', 'defense'];
    const STATS_SPECIAL = ['meleeAttack', 'meleeDefense', 'rangedAttack', 'rangedDefense', 'magicAttack', 'magicDefense', 'hunger', 'eggFind', 'itemFind'];
    const STATS_ABILITIES = ['bones', 'fish', 'flowers', 'ore', 'veges', 'wood'];
    const IMAGES = {
        health: 'https://cdn-icons-png.flaticon.com/512/2589/2589054.png',
        attack: 'https://img.icons8.com/?size=48&id=16672',
        defense: 'https://img.icons8.com/?size=48&id=I2lKi8lyTaJD',
        itemFind: 'https://img.icons8.com/?size=48&id=M2yQkpBAlIS8',
        eggFind: 'https://img.icons8.com/?size=48&id=Ybx2AvxzyUfH',
        hunger: 'https://img.icons8.com/?size=48&id=AXExnoyylJdK',
        melee: 'https://img.icons8.com/?size=48&id=I2lKi8lyTaJD',
        magic: 'https://img.icons8.com/?size=48&id=CWksSHWEtOtX',
        ranged: 'https://img.icons8.com/?size=48&id=5ndWrWDbTE2Y',
        wood: `/assets/${itemCache.byName['Pine Log'].image}`,
        ore: `/assets/${itemCache.byName['Copper Ore'].image}`,
        veges: `/assets/${itemCache.byName['Potato'].image}`,
        flowers: `/assets/${itemCache.byName['Peony'].image}`,
        fish: `/assets/${itemCache.byName['Raw Cod'].image}`,
        bones: `/assets/${itemCache.byName['Bone'].image}`
    };
    const ROTATION_NAMES = [
        'melee',
        'ranged',
        'magic',
    ];
    const exports = {
        VERSION: 0,
        STATS_BASE,
        STATS_SPECIAL,
        IMAGES,
        petToText,
        textToPet,
        isEncodedPetName,
        petToStats,
        getExpeditionStats
    };

    let SPECIAL_CHAR = '0';
    const VALID_CHARS = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_abcdefghijklmnopqrstuvwxyz{|}'.split('');
    const VALID_CHARS_LENGTH = BigInt(VALID_CHARS.length);
    const OPTIONS = [
        petCache.list.length, // species
        ...Array(3).fill(50), // stats
        ...Array(4).fill(petPassiveCache.list.length+1) // passives, 0 = empty
    ];

    const MILLIS_PER_MINUTE = 1000*60;
    const MILLIS_PER_WEEK = 1000*60*60*24*7;

    const initialised = new Promise.Expiring(2000, 'localDatabase');

    async function initialise() {
        exports.VERSION = +(await request.getPetVersion());
        SPECIAL_CHAR = exports.VERSION + '';
        for(const petPassive of petPassiveCache.list) {
            if(petPassive.name.startsWith('Melee')) {
                petPassive.image = IMAGES.melee;
            } else if(petPassive.name.startsWith('Ranged')) {
                petPassive.image = IMAGES.ranged;
            } else if(petPassive.name.startsWith('Magic')) {
                petPassive.image = IMAGES.magic;
            } else if(petPassive.name.startsWith('Hunger')) {
                petPassive.image = IMAGES.hunger;
            } else if(petPassive.name.startsWith('Egg Find')) {
                petPassive.image = IMAGES.eggFind;
            } else if(petPassive.name.startsWith('Loot Find')) {
                petPassive.image = IMAGES.itemFind;
            } else {
                console.error(`Unmapped pet passive name, please fix : ${petPassive.name}`);
            }
        }
        initialised.resolve(exports);
    }

    function numberToText(number) {
        let text = SPECIAL_CHAR;
        while(number > 0) {
            text += VALID_CHARS[number%VALID_CHARS_LENGTH];
            number /= VALID_CHARS_LENGTH;
        }
        return text;
    }

    function textToNumber(text) {
        let number = 0n;
        text = text.slice(1);
        while(text.length) {
            number *= VALID_CHARS_LENGTH;
            number += BigInt(VALID_CHARS.indexOf(text[text.length-1]));
            text = text.slice(0,-1);
        }
        return number;
    }

    function choicesToNumber(choices, options) {
        if(choices.length !== options.length) {
            throw `Expected lengths to be equal : ${choices.length} and ${options.length}`;
        }
        let number = 0n;
        for(let i=0;i<choices.length;i++) {
            if(choices[i] >= options[i]) {
                throw `${choices[i]} is outside of options range ${options[i]}`;
            }
            number *= BigInt(options[i]);
            number += BigInt(choices[i]);
        }
        return number;
    }

    function numberToChoices(number, options) {
        const choices = [];
        for(let i=options.length-1;i>=0;i--) {
            if(i > 0) {
                choices.unshift(Number(number % BigInt(options[i])));
                number /= BigInt(options[i]);
            } else {
                choices.unshift(Number(number));
            }
        }
        return choices;
    }

    function petToChoices(pet) {
        const passives = pet.passives.map(a => petPassiveCache.idToIndex[a]+1);
        while(passives.length < 4) {
            passives.push(0);
        }
        return [
            petCache.idToIndex[pet.species], // species
            pet.health/2-1,
            pet.attack/2-1,
            pet.defense/2-1,
            ...passives // passives, 0 = empty
        ];
    }

    function choicesToPet(choices, text) {
        return {
            parsed: true,
            species: petCache.list[choices[0]].id,
            name: text,
            health: (choices[1]+1)*2,
            attack: (choices[2]+1)*2,
            defense: (choices[3]+1)*2,
            passives: choices.slice(4).filter(a => a).map(a => petPassiveCache.list[a-1].id)
        };
    }

    function petToText(pet) {
        const choices = petToChoices(pet);
        const number = choicesToNumber(choices, OPTIONS);
        return numberToText(number);
    }

    function textToPet(text) {
        const number = textToNumber(text);
        const choices = numberToChoices(number, OPTIONS);
        return choicesToPet(choices, text);
    }

    function isEncodedPetName(text) {
        return text.startsWith(SPECIAL_CHAR);
    }

    function petToStats(pet) {
        const result = {};
        const passives = pet.passives.map(id => petPassiveCache.byId[id]);
        for(const stat of STATS_BASE) {
            result[stat] = 0;
            let value = (petCache.byId[pet.species].power + pet[stat] / 2 - 10) / 100 * pet.level + 10;
            result[stat] += value;
        }
        for(const stat of STATS_SPECIAL) {
            result[stat] = 0;
            const passive = passives.find(a => a.stats.name === stat);
            if(passive) {
                result[stat] += passive.stats.value;
            }
        }
        for(const ability of STATS_ABILITIES) {
            result[ability] = 0;
        }
        const abilities = petCache.byId[pet.species].abilities;
        for(const ability of abilities) {
            const key = Object.keys(ability)[0];
            result[key] = ability[key];
        }
        for(const key of Object.keys(result)) {
            result[key] = Math.round(result[key]);
        }
        return result;
    }

    function getExpeditionStats(tier) {
        const expedition = expeditionCache.byTier[tier];
        const rotation = getCurrentRotation(expedition.tier);
        const stats = {};
        for(const stat of STATS_BASE) {
            stats[stat] = expedition.power;
        }
        return Object.assign({rotation,stats}, expedition);
    }

    function getCurrentRotation(offset) {
        const now = new Date();
        const date = new Date(now.getTime() + MILLIS_PER_MINUTE * now.getTimezoneOffset());
        const millisPassed = util.startOfWeek(date) - util.startOfWeek(util.startOfYear(date));
        const startOfWeek = util.startOfWeek(date);
        let index = offset + Math.round(millisPassed / MILLIS_PER_WEEK);
        index %= ROTATION_NAMES.length;
        return ROTATION_NAMES[index];
    }

    initialise();

    return initialised;

});
// polyfill
window.moduleRegistry.add('polyfill', () => {

    const exports = {
        requestIdleCallback
    };

    function requestIdleCallback() {
        if(!window.requestIdleCallback) {
            window.requestIdleCallback = function(callback, options) {
                var options = options || {};
                var relaxation = 1;
                var timeout = options.timeout || relaxation;
                var start = performance.now();
                return setTimeout(function () {
                    callback({
                        get didTimeout() {
                            return options.timeout ? false : (performance.now() - start) - relaxation > timeout;
                        },
                        timeRemaining: function () {
                            return Math.max(0, relaxation + (performance.now() - start));
                        },
                    });
                }, relaxation);
            };
        }
        return window.requestIdleCallback(...arguments);
    }

    return exports;

}
);
// Promise
window.moduleRegistry.add('Promise', (logService) => {

    class Deferred {
        #name;
        #promise;
        resolve;
        reject;
        constructor(name) {
            this.#name = name;
            this.#promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            }).then(result => {
                return result;
            }).catch(error => {
                if(error) {
                    console.warn(error);
                    logService.error(`error in ${this.constructor.name} (${this.#name})`, error);
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
        constructor(timeout, name) {
            super(name);
            const timeoutReference = window.setTimeout(() => {
                this.resolve();
            }, timeout);
            this.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Expiring extends Deferred {
        constructor(timeout, name) {
            super(name);
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
        constructor(checker, interval, timeout, name) {
            super(timeout, name);
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
window.moduleRegistry.add('request', (logService, Promise) => {

    async function requestWithFallback(fallback, url, body, headers) {
        try {
            const expiring = new Promise.Expiring(2000, 'requestWithFallback - ' + url);
            request(url, body, headers)
                .then(a => expiring.resolve(a))
                .catch(a => expiring.reject(a));
            const result = await expiring;
            return result;
        } catch(e) {
            console.warn('Fetching fallback cache for ' + url, e);
            return JSON.parse(fallback);
        }
    }

    async function request(url, body, headers) {
        if(!headers) {
            headers = {};
        }
        headers['Content-Type'] = 'application/json';
        const method = body !== undefined ? 'POST' : 'GET';
        try {
            if(body !== undefined) {
                body = JSON.stringify(body);
            }
            const fetchResponse = await fetch(`${window.PANCAKE_ROOT}/${url}`, {method, headers, body});
            if(fetchResponse.status !== 200) {
                throw await fetchResponse.text();
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
            logService.error(e);
            throw `Failed fetching ${url} : ${e}`;
        }
    }

    // alphabetical

    request.forwardDataGuildLevel = (guild, level) => request(`public/data/guild/${guild}/level`, level);
    request.forwardDataGuildStructures = (guild, data) => request(`public/data/guild/${guild}/structures`, data);
    request.forwardDataGuildEventTime = (guild, type, time) => request(`public/data/guild/${guild}/event/${type}`, time);
    request.createDiscordRegistration = (registration) => request('public/discord', registration);
    request.getDiscordRegistrationTypes = () => request('public/discord/types');
    request.getDiscordRegistration = (id) => request(`public/discord/${id}`);
    request.setTimeDiscordRegistration = (id, time) => request(`public/discord/${id}/time`, time);
    request.setEnabledDiscordRegistration = (id, enabled) => request(`public/discord/${id}/enabled`, enabled);
    request.unlinkDiscordRegistration = (id) => request(`public/discord/${id}/unlink`);
    request.deleteDiscordRegistration = (id) => request(`public/discord/${id}/delete`);
    request.listActions = () => requestWithFallback('[{"id":-9289,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9288,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9287,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9286,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9285,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9284,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9283,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9282,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9281,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9280,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9279,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9278,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9277,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9276,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9275,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9274,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9273,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9272,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9271,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9270,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9269,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9268,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9267,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9266,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9265,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9264,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9263,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9262,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9261,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9260,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9249,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9248,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9247,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9246,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9245,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9244,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9243,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9242,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9241,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9240,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9239,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9238,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9237,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9236,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9235,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9234,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9233,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9232,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9231,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9230,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9229,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9228,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9227,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9226,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9225,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9224,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9223,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9222,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9221,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9220,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9219,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9218,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9217,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9216,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9215,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9214,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9213,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9212,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9211,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9210,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9209,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Boomerang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9208,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Scythe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9207,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Spear","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9206,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Bow","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9205,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Spade","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9204,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Rod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9203,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Hammer","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9202,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Sword","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9201,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Hatchet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9200,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Pickaxe","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9174,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9173,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9172,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9171,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9170,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Infernal Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9164,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9163,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9162,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9161,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9160,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Astral Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9154,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9153,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9152,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9151,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9150,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Obsidian Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9144,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9143,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9142,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9141,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9140,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Cobalt Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9134,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9133,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9132,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9131,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9130,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Gold Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9124,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9123,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9122,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9121,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9120,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Silver Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9114,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9113,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9112,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9111,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9110,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Iron Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9104,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Shield","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9103,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Gloves","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9102,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Body","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9101,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Boots","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-9100,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":9,"name":"Conversion metal_parts Copper Helmet","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7411,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Giant Fang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7410,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Giant Bone","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7409,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Large Fang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7408,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Large Bone","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7407,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Medium Fang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7406,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Medium Bone","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7405,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Fang","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7400,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Bone","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7347,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Banana","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7324,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Blueberry","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7323,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Raspberry","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7304,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Blackcurrant","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7303,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Green Apple","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7302,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Cherry","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7301,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Grapes","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-7300,"skill":"Farming","type":"CONVERSION","structure":null,"monster":null,"item":7,"name":"Conversion compost Apple","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6342,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw King Crab","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6325,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw Shark","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6320,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw Swordfish","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6317,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw Lobster","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6314,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw Bass","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6311,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw Salmon","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6308,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw Cod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-6305,"skill":"Taming","type":"CONVERSION","structure":null,"monster":null,"item":6,"name":"Conversion pet_snacks Raw Shrimp","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5037,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Onyx","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5036,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Moonstone","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5035,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Citrine","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5034,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Diamond","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5033,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Amethyst","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5032,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Emerald","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5031,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Topaz","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-5030,"skill":"Enchanting","type":"CONVERSION","structure":null,"monster":null,"item":5,"name":"Conversion arcane_powder Ruby","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2900,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Celebration Cake","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2345,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health King Crab Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2343,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked King Crab","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2334,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Shark Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2333,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Swordfish Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2332,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Lobster Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2331,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Bass Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2330,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Salmon Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2329,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cod Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2328,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Shrimp Pie","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2326,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked Shark","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2321,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked Swordfish","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2318,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked Lobster","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2315,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked Bass","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2312,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked Salmon","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2309,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked Cod","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2306,"skill":"Defense","type":"CONVERSION","structure":null,"monster":null,"item":-2,"name":"Conversion health Cooked Shrimp","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2017,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Ancient Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2016,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Redwood Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2015,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Ironbark Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2014,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Mahogany Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2013,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Teak Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2012,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Birch Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2011,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Spruce Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":-2010,"skill":"Smelting","type":"CONVERSION","structure":null,"monster":null,"item":2,"name":"Conversion charcoal Pine Log","image":"N/A","level":1,"exp":0,"speed":0,"tier":0,"monsterGroup":null,"outskirtsMonsterChance":0},{"id":10,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":10,"name":"Pine Tree","image":"items/tree-pine.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":11,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":11,"name":"Spruce Tree","image":"items/tree-spruce.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":12,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":12,"name":"Birch Tree","image":"items/tree-birch.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":13,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":13,"name":"Teak Tree","image":"items/tree-teak.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":14,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":14,"name":"Mahogany Tree","image":"items/tree-mahogany.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":15,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":15,"name":"Ironbark Tree","image":"items/tree-ironbark.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":16,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":16,"name":"Redwood Tree","image":"items/tree-redwood.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":17,"skill":"Woodcutting","type":"ACTIVITY","structure":null,"monster":null,"item":17,"name":"Ancient Tree","image":"items/tree-ancient.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":20,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":20,"name":"Copper Rock","image":"items/rock-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":21,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":21,"name":"Iron Rock","image":"items/rock-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":22,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":22,"name":"Silver Rock","image":"items/rock-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":23,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":23,"name":"Gold Rock","image":"items/rock-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":24,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":24,"name":"Cobalt Rock","image":"items/rock-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":25,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":26,"name":"Obsidian Rock","image":"items/rock-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":26,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":27,"name":"Astral Rock","image":"items/rock-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":27,"skill":"Mining","type":"ACTIVITY","structure":null,"monster":null,"item":28,"name":"Infernal Rock","image":"items/rock-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":30,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":40,"name":"Copper Bar","image":"items/bar-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":31,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":41,"name":"Iron Bar","image":"items/bar-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":32,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":42,"name":"Silver Bar","image":"items/bar-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":33,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":43,"name":"Gold Bar","image":"items/bar-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":34,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":44,"name":"Cobalt Bar","image":"items/bar-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":35,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":45,"name":"Obsidian Bar","image":"items/bar-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":36,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":46,"name":"Astral Bar","image":"items/bar-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":37,"skill":"Smelting","type":"ACTIVITY","structure":null,"monster":null,"item":47,"name":"Infernal Bar","image":"items/bar-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":40,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":305,"name":"Raw Shrimp","image":"items/raw-shrimp.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":41,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":308,"name":"Raw Cod","image":"items/raw-cod.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":42,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":311,"name":"Raw Salmon","image":"items/raw-salmon.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":43,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":314,"name":"Raw Bass","image":"items/raw-bass.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":44,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":317,"name":"Raw Lobster","image":"items/raw-lobster.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":45,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":320,"name":"Raw Swordfish","image":"items/raw-swordfish.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":46,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":325,"name":"Raw Shark","image":"items/raw-shark.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":47,"skill":"Fishing","type":"ACTIVITY","structure":null,"monster":null,"item":342,"name":"Raw King Crab","image":"items/raw-king-crab.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":50,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":306,"name":"Shrimp","image":"items/food-cooked-shrimp.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":51,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":309,"name":"Cod","image":"items/food-cooked-cod.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":52,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":312,"name":"Salmon","image":"items/food-cooked-salmon.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":53,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":315,"name":"Bass","image":"items/food-cooked-bass.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":54,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":318,"name":"Lobster","image":"items/food-cooked-lobster.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":55,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":321,"name":"Swordfish","image":"items/food-cooked-swordfish.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":57,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":326,"name":"Shark","image":"items/food-cooked-shark.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":58,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":343,"name":"King Crab","image":"items/food-cooked-king-crab.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":60,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":328,"name":"Shrimp Pie","image":"items/pie-shrimp.png","level":1,"exp":5.76,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":61,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":329,"name":"Cod Pie","image":"items/pie-cod.png","level":10,"exp":10.079999999999998,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":62,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":330,"name":"Salmon Pie","image":"items/pie-salmon.png","level":25,"exp":15.36,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":63,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":331,"name":"Bass Pie","image":"items/pie-bass.png","level":40,"exp":21.599999999999998,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":64,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":332,"name":"Lobster Pie","image":"items/pie-lobster.png","level":55,"exp":28.799999999999997,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":65,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":333,"name":"Swordfish Pie","image":"items/pie-swordfish.png","level":70,"exp":36.96,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":66,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":334,"name":"Shark Pie","image":"items/pie-shark.png","level":85,"exp":46.08,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":67,"skill":"Cooking","type":"ACTIVITY","structure":null,"monster":null,"item":345,"name":"King Crab Pie","image":"items/pie-king-crab.png","level":100,"exp":56.160000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":70,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":70,"name":"Ruby Essence","image":"items/essence-ruby.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":71,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":71,"name":"Topaz Essence","image":"items/essence-topaz.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":72,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":72,"name":"Emerald Essence","image":"items/essence-emerald.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":73,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":73,"name":"Amethyst Essence","image":"items/essence-amethyst.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":74,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":74,"name":"Citrine Essence","image":"items/essence-citrine.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":75,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":75,"name":"Diamond Essence","image":"items/essence-diamond.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":76,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":76,"name":"Moonstone Essence","image":"items/essence-moonstone.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":77,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":77,"name":"Onyx Essence","image":"items/essence-onyx.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":80,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":1100,"name":"Savage Looting Tome 1","image":"items/tome-one-savage-looting.png","level":1,"exp":50,"speed":30,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":81,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":1101,"name":"Bountiful Harvest Tome 1","image":"items/tome-one-bountiful-harvest.png","level":1,"exp":50,"speed":30,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":82,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":1102,"name":"Opulent Crafting Tome 1","image":"items/tome-one-opulent-crafting.png","level":1,"exp":50,"speed":30,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":84,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":1104,"name":"Insatiable Power Tome 1","image":"items/tome-one-insatiable-power.png","level":1,"exp":50,"speed":30,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":85,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":1105,"name":"Potent Concoction Tome 1","image":"items/tome-one-potent-concoction.png","level":1,"exp":50,"speed":30,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":90,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":80,"name":"Dungeon Key 25","image":"items/key-emerald.png","level":25,"exp":57.60000000000001,"speed":24,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":91,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":81,"name":"Dungeon Key 40","image":"items/key-amethyst.png","level":40,"exp":81,"speed":30,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":92,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":82,"name":"Dungeon Key 55","image":"items/key-citrine.png","level":55,"exp":108,"speed":36,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":93,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":83,"name":"Dungeon Key 70","image":"items/key-diamond.png","level":70,"exp":138.60000000000002,"speed":42,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":94,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":84,"name":"Dungeon Key 85","image":"items/key-moonstone.png","level":85,"exp":172.79999999999998,"speed":48,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":95,"skill":"Enchanting","type":"ACTIVITY","structure":null,"monster":null,"item":85,"name":"Dungeon Key 100","image":"items/key-onyx.png","level":100,"exp":210.60000000000002,"speed":54,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":100,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":100,"name":"Copper Helmet","image":"items/armor-copper-helmet.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":101,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":101,"name":"Copper Boots","image":"items/armor-copper-boots.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":102,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":102,"name":"Copper Body","image":"items/armor-copper-body.png","level":1,"exp":7.199999999999999,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":103,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":103,"name":"Copper Gloves","image":"items/armor-copper-gloves.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":104,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":104,"name":"Copper Shield","image":"items/armor-copper-shield.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":110,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":110,"name":"Iron Helmet","image":"items/armor-iron-helmet.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":111,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":111,"name":"Iron Boots","image":"items/armor-iron-boots.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":112,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":112,"name":"Iron Body","image":"items/armor-iron-body.png","level":10,"exp":12.599999999999998,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":113,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":113,"name":"Iron Gloves","image":"items/armor-iron-gloves.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":114,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":114,"name":"Iron Shield","image":"items/armor-iron-shield.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":120,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":120,"name":"Silver Helmet","image":"items/armor-silver-helmet.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":121,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":121,"name":"Silver Boots","image":"items/armor-silver-boots.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":122,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":122,"name":"Silver Body","image":"items/armor-silver-body.png","level":25,"exp":19.200000000000003,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":123,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":123,"name":"Silver Gloves","image":"items/armor-silver-gloves.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":124,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":124,"name":"Silver Shield","image":"items/armor-silver-shield.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":130,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":130,"name":"Gold Helmet","image":"items/armor-gold-helmet.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":131,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":131,"name":"Gold Boots","image":"items/armor-gold-boots.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":132,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":132,"name":"Gold Body","image":"items/armor-gold-body.png","level":40,"exp":27,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":133,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":133,"name":"Gold Gloves","image":"items/armor-gold-gloves.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":134,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":134,"name":"Gold Shield","image":"items/armor-gold-shield.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":140,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":140,"name":"Cobalt Body","image":"items/armor-cobalt-body.png","level":55,"exp":36,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":141,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":141,"name":"Cobalt Boots","image":"items/armor-cobalt-boots.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":142,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":142,"name":"Cobalt Helmet","image":"items/armor-cobalt-helmet.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":143,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":143,"name":"Cobalt Gloves","image":"items/armor-cobalt-gloves.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":144,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":144,"name":"Cobalt Shield","image":"items/armor-cobalt-shield.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":150,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":150,"name":"Obsidian Body","image":"items/armor-obsidian-body.png","level":70,"exp":46.2,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":151,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":151,"name":"Obsidian Boots","image":"items/armor-obsidian-boots.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":152,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":152,"name":"Obsidian Helmet","image":"items/armor-obsidian-helmet.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":153,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":153,"name":"Obsidian Gloves","image":"items/armor-obsidian-gloves.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":154,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":154,"name":"Obsidian Shield","image":"items/armor-obsidian-shield.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":160,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":160,"name":"Astral Body","image":"items/armor-astral-body.png","level":85,"exp":57.599999999999994,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":161,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":161,"name":"Astral Boots","image":"items/armor-astral-boots.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":162,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":162,"name":"Astral Helmet","image":"items/armor-astral-helmet.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":163,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":163,"name":"Astral Gloves","image":"items/armor-astral-gloves.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":164,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":164,"name":"Astral Shield","image":"items/armor-astral-shield.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":170,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":170,"name":"Infernal Body","image":"items/armor-infernal-body.png","level":100,"exp":70.2,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":171,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":171,"name":"Infernal Boots","image":"items/armor-infernal-boots.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":172,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":172,"name":"Infernal Helmet","image":"items/armor-infernal-helmet.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":173,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":173,"name":"Infernal Gloves","image":"items/armor-infernal-gloves.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":174,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":174,"name":"Infernal Shield","image":"items/armor-infernal-shield.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":200,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":203,"name":"Copper Hammer","image":"items/hammer-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":201,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":201,"name":"Copper Hatchet","image":"items/hatchet-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":202,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":202,"name":"Copper Sword","image":"items/sword-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":203,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":204,"name":"Copper Rod","image":"items/tool-copper-rod.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":204,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":200,"name":"Copper Pickaxe","image":"items/pickaxe-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":205,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":205,"name":"Copper Spade","image":"items/tool-copper-spade.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":206,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":206,"name":"Copper Bow","image":"items/bow-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":207,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":207,"name":"Copper Spear","image":"items/spear-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":208,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":208,"name":"Copper Scythe","image":"items/scythe-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":209,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":209,"name":"Copper Boomerang","image":"items/boomerang-copper.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":210,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":213,"name":"Iron Hammer","image":"items/hammer-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":211,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":211,"name":"Iron Hatchet","image":"items/hatchet-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":212,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":212,"name":"Iron Sword","image":"items/sword-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":213,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":214,"name":"Iron Rod","image":"items/tool-iron-rod.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":214,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":210,"name":"Iron Pickaxe","image":"items/pickaxe-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":215,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":215,"name":"Iron Spade","image":"items/tool-iron-spade.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":216,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":216,"name":"Iron Bow","image":"items/bow-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":217,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":217,"name":"Iron Spear","image":"items/spear-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":218,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":218,"name":"Iron Scythe","image":"items/scythe-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":219,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":219,"name":"Iron Boomerang","image":"items/boomerang-iron.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":220,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":223,"name":"Silver Hammer","image":"items/hammer-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":221,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":221,"name":"Silver Hatchet","image":"items/hatchet-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":222,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":222,"name":"Silver Sword","image":"items/sword-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":223,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":224,"name":"Silver Rod","image":"items/tool-silver-rod.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":224,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":220,"name":"Silver Pickaxe","image":"items/pickaxe-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":225,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":225,"name":"Silver Spade","image":"items/tool-silver-spade.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":226,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":226,"name":"Silver Bow","image":"items/bow-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":227,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":227,"name":"Silver Spear","image":"items/spear-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":228,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":228,"name":"Silver Scythe","image":"items/scythe-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":229,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":229,"name":"Silver Boomerang","image":"items/boomerang-silver.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":230,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":233,"name":"Gold Hammer","image":"items/hammer-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":231,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":231,"name":"Gold Hatchet","image":"items/hatchet-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":232,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":232,"name":"Gold Sword","image":"items/sword-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":233,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":234,"name":"Gold Rod","image":"items/tool-gold-rod.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":234,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":230,"name":"Gold Pickaxe","image":"items/pickaxe-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":235,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":235,"name":"Gold Spade","image":"items/tool-gold-spade.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":236,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":236,"name":"Gold Bow","image":"items/bow-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":237,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":237,"name":"Gold Spear","image":"items/spear-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":238,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":238,"name":"Gold Scythe","image":"items/scythe-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":239,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":239,"name":"Gold Boomerang","image":"items/boomerang-gold.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":240,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":243,"name":"Cobalt Hammer","image":"items/hammer-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":241,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":241,"name":"Cobalt Hatchet","image":"items/hatchet-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":242,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":242,"name":"Cobalt Sword","image":"items/sword-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":243,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":244,"name":"Cobalt Rod","image":"items/tool-cobalt-rod.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":244,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":240,"name":"Cobalt Pickaxe","image":"items/pickaxe-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":245,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":245,"name":"Cobalt Spade","image":"items/tool-cobalt-spade.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":246,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":246,"name":"Cobalt Bow","image":"items/bow-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":247,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":247,"name":"Cobalt Spear","image":"items/spear-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":248,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":248,"name":"Cobalt Scythe","image":"items/scythe-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":249,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":249,"name":"Cobalt Boomerang","image":"items/boomerang-cobalt.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":250,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":263,"name":"Obsidian Hammer","image":"items/hammer-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":251,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":261,"name":"Obsidian Hatchet","image":"items/hatchet-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":252,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":262,"name":"Obsidian Sword","image":"items/sword-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":253,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":264,"name":"Obsidian Rod","image":"items/tool-obsidian-rod.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":254,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":260,"name":"Obsidian Pickaxe","image":"items/pickaxe-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":255,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":265,"name":"Obsidian Spade","image":"items/tool-obsidian-spade.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":256,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":266,"name":"Obsidian Bow","image":"items/bow-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":257,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":267,"name":"Obsidian Spear","image":"items/spear-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":258,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":268,"name":"Obsidian Scythe","image":"items/scythe-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":259,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":269,"name":"Obsidian Boomerang","image":"items/boomerang-obsidian.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":260,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":273,"name":"Astral Hammer","image":"items/hammer-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":261,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":271,"name":"Astral Hatchet","image":"items/hatchet-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":262,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":272,"name":"Astral Sword","image":"items/sword-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":263,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":274,"name":"Astral Rod","image":"items/tool-astral-rod.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":264,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":270,"name":"Astral Pickaxe","image":"items/pickaxe-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":265,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":275,"name":"Astral Spade","image":"items/tool-astral-spade.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":266,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":276,"name":"Astral Bow","image":"items/bow-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":267,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":277,"name":"Astral Spear","image":"items/spear-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":268,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":278,"name":"Astral Scythe","image":"items/scythe-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":269,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":279,"name":"Astral Boomerang","image":"items/boomerang-astral.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":270,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":283,"name":"Infernal Hammer","image":"items/hammer-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":271,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":281,"name":"Infernal Hatchet","image":"items/hatchet-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":272,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":282,"name":"Infernal Sword","image":"items/sword-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":273,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":284,"name":"Infernal Rod","image":"items/tool-infernal-rod.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":274,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":280,"name":"Infernal Pickaxe","image":"items/pickaxe-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":275,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":285,"name":"Infernal Spade","image":"items/tool-infernal-spade.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":276,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":286,"name":"Infernal Bow","image":"items/bow-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":277,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":287,"name":"Infernal Spear","image":"items/spear-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":278,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":288,"name":"Infernal Scythe","image":"items/scythe-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":279,"skill":"Smithing","type":"ACTIVITY","structure":null,"monster":null,"item":289,"name":"Infernal Boomerang","image":"items/boomerang-infernal.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":300,"skill":"Combat","type":"MONSTER","structure":null,"monster":1,"item":405,"name":"Red Frog","image":"monsters/red-frog.png","level":10,"exp":140,"speed":1,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":301,"skill":"Combat","type":"MONSTER","structure":null,"monster":2,"item":408,"name":"Leaf Hopper","image":"monsters/leaf-hopper.png","level":55,"exp":200,"speed":1,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":302,"skill":"Combat","type":"MONSTER","structure":null,"monster":3,"item":400,"name":"Snake","image":"monsters/black-snake.png","level":1,"exp":120,"speed":1,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":304,"skill":"Combat","type":"MONSTER","structure":null,"monster":4,"item":405,"name":"Skeleton","image":"monsters/skeleton.png","level":10,"exp":140,"speed":1,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":305,"skill":"Combat","type":"MONSTER","structure":null,"monster":5,"item":409,"name":"Tree Stump","image":"monsters/tree-stump.png","level":70,"exp":220.00000000000003,"speed":1,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":306,"skill":"Combat","type":"MONSTER","structure":null,"monster":6,"item":408,"name":"Ogre","image":"monsters/ogre.png","level":55,"exp":200,"speed":1,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":307,"skill":"Combat","type":"MONSTER","structure":null,"monster":7,"item":406,"name":"Goblin","image":"monsters/goblin.png","level":25,"exp":160,"speed":1,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":308,"skill":"Combat","type":"MONSTER","structure":null,"monster":8,"item":400,"name":"Snail","image":"monsters/snail.png","level":1,"exp":120,"speed":1,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":309,"skill":"Combat","type":"MONSTER","structure":null,"monster":9,"item":406,"name":"Green Slime","image":"monsters/green-slime.png","level":25,"exp":160,"speed":1,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":310,"skill":"Combat","type":"MONSTER","structure":null,"monster":10,"item":410,"name":"Venus Flytrap","image":"monsters/venus-flytrap.png","level":85,"exp":240,"speed":1,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":311,"skill":"Combat","type":"MONSTER","structure":null,"monster":11,"item":409,"name":"Grey Wolf","image":"monsters/grey-wolf.png","level":70,"exp":220.00000000000003,"speed":1,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":312,"skill":"Combat","type":"MONSTER","structure":null,"monster":12,"item":407,"name":"Lady Beetle","image":"monsters/lady-beetle.png","level":40,"exp":180,"speed":1,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":315,"skill":"Combat","type":"MONSTER","structure":null,"monster":15,"item":407,"name":"Goblin Chief","image":"monsters/goblin-chief.png","level":40,"exp":180,"speed":1,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":317,"skill":"Combat","type":"MONSTER","structure":null,"monster":21,"item":405,"name":"Hermit Crab","image":"monsters/hermit-crab.png","level":10,"exp":140,"speed":1,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":318,"skill":"Combat","type":"MONSTER","structure":null,"monster":22,"item":408,"name":"Coral Snail","image":"monsters/coral-snail.png","level":55,"exp":200,"speed":1,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":319,"skill":"Combat","type":"MONSTER","structure":null,"monster":17,"item":400,"name":"Sea Jelly","image":"monsters/sea-jelly.png","level":1,"exp":120,"speed":1,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":320,"skill":"Combat","type":"MONSTER","structure":null,"monster":18,"item":406,"name":"Blue Slime","image":"monsters/blue-slime.png","level":25,"exp":160,"speed":1,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":321,"skill":"Combat","type":"MONSTER","structure":null,"monster":19,"item":409,"name":"Jellyfish","image":"monsters/jellyfish.png","level":70,"exp":220.00000000000003,"speed":1,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":322,"skill":"Combat","type":"MONSTER","structure":null,"monster":20,"item":407,"name":"Ice Fairy","image":"monsters/ice-fairy.png","level":40,"exp":180,"speed":1,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":323,"skill":"Combat","type":"MONSTER","structure":null,"monster":23,"item":410,"name":"Rock Dweller","image":"monsters/rock-dweller.png","level":85,"exp":240,"speed":1,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":324,"skill":"Combat","type":"MONSTER","structure":null,"monster":24,"item":410,"name":"Griffin","image":"monsters/griffin.png","level":85,"exp":240,"speed":1,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":325,"skill":"Combat","type":"MONSTER","structure":null,"monster":26,"item":411,"name":"Efreet","image":"monsters/efreet.png","level":100,"exp":260,"speed":1,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":326,"skill":"Combat","type":"MONSTER","structure":null,"monster":27,"item":411,"name":"Frost Wolf","image":"monsters/frost-wolf.png","level":100,"exp":260,"speed":1,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":327,"skill":"Combat","type":"MONSTER","structure":null,"monster":25,"item":411,"name":"Treant","image":"monsters/treant.png","level":100,"exp":260,"speed":1,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":350,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":350,"name":"Peony","image":"items/flower-peony.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":351,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":351,"name":"Tulip","image":"items/flower-tulip.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":352,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":352,"name":"Rose","image":"items/flower-rose.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":353,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":353,"name":"Daisy","image":"items/flower-daisy.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":354,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":354,"name":"Lilac","image":"items/flower-lilac.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":355,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":355,"name":"Hyacinth","image":"items/flower-hyacinth.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":356,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":356,"name":"Nemesia","image":"items/flower-nemesia.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":357,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":357,"name":"Snapdragon","image":"items/flower-snapdragon.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":360,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":360,"name":"Potato","image":"items/food-potato.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":361,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":361,"name":"Radish","image":"items/food-radish.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":362,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":362,"name":"Onion","image":"items/food-onion.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":363,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":363,"name":"Carrot","image":"items/food-carrot.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":364,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":364,"name":"Tomato","image":"items/food-tomato.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":365,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":365,"name":"Corn","image":"items/food-corn.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":366,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":366,"name":"Pumpkin","image":"items/food-pumpkin.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":367,"skill":"Farming","type":"ACTIVITY","structure":null,"monster":null,"item":367,"name":"Chilli","image":"items/food-chilli.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":400,"skill":"Combat","type":"DUNGEON","structure":null,"monster":null,"item":406,"name":"Ice Caverns","image":"monsters/ice-serpent.png","level":25,"exp":240.00000000000003,"speed":1,"tier":3,"monsterGroup":[100,102,101],"outskirtsMonsterChance":1000},{"id":402,"skill":"Combat","type":"DUNGEON","structure":null,"monster":null,"item":408,"name":"Misty Tides","image":"monsters/sea-snail.png","level":55,"exp":300,"speed":1,"tier":5,"monsterGroup":[103,105,104],"outskirtsMonsterChance":1000},{"id":403,"skill":"Combat","type":"DUNGEON","structure":null,"monster":null,"item":409,"name":"Cyclops Den","image":"monsters/cyclops.png","level":70,"exp":330,"speed":1,"tier":6,"monsterGroup":[106,107,108],"outskirtsMonsterChance":1000},{"id":404,"skill":"Combat","type":"DUNGEON","structure":null,"monster":null,"item":407,"name":"Twisted Woods","image":"monsters/ghoul.png","level":40,"exp":270,"speed":1,"tier":4,"monsterGroup":[111,110,109],"outskirtsMonsterChance":1000},{"id":405,"skill":"Combat","type":"DUNGEON","structure":null,"monster":null,"item":410,"name":"Hellish Lair","image":"monsters/cerberus.png","level":85,"exp":359.99999999999994,"speed":1,"tier":7,"monsterGroup":[112,113,114],"outskirtsMonsterChance":1000},{"id":406,"skill":"Combat","type":"DUNGEON","structure":null,"monster":null,"item":411,"name":"Wizard Tower","image":"monsters/wizard.png","level":100,"exp":390.00000000000006,"speed":1,"tier":8,"monsterGroup":[115,116,117],"outskirtsMonsterChance":1000},{"id":710,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":760,"name":"Basic Health Potion","image":"items/potion-basic-health.png","level":1,"exp":4.8,"speed":4,"tier":1,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":711,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":766,"name":"Basic Combat Loot Potion","image":"items/potion-basic-combat-loot.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":712,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":765,"name":"Basic Combat XP Potion","image":"items/potion-basic-combat-efficiency.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":713,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":763,"name":"Basic Gather Level Potion","image":"items/potion-basic-gather-level.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":714,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":768,"name":"Basic Gather Yield Potion","image":"items/potion-basic-gather-yield.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":715,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":761,"name":"Basic Gather XP Potion","image":"items/potion-basic-gather-efficiency.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":716,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":764,"name":"Basic Craft Level Potion","image":"items/potion-basic-craft-level.png","level":10,"exp":8.399999999999999,"speed":6,"tier":2,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":717,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":767,"name":"Basic Multi Craft Potion","image":"items/potion-basic-preservation.png","level":25,"exp":12.8,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":718,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":762,"name":"Basic Craft XP Potion","image":"items/potion-basic-craft-efficiency.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":720,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":710,"name":"Health Potion","image":"items/potion-health.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":721,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":716,"name":"Combat Loot Potion","image":"items/potion-combat-loot.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":722,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":715,"name":"Combat XP Potion","image":"items/potion-combat-efficiency.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":723,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":713,"name":"Gather Level Potion","image":"items/potion-gather-level.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":724,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":718,"name":"Gather Yield Potion","image":"items/potion-gather-yield.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":725,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":711,"name":"Gather XP Potion","image":"items/potion-gather-efficiency.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":726,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":714,"name":"Craft Level Potion","image":"items/potion-craft-level.png","level":40,"exp":18,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":727,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":717,"name":"Multi Craft Potion","image":"items/potion-preservation.png","level":55,"exp":24,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":728,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":712,"name":"Craft XP Potion","image":"items/potion-craft-efficiency.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":730,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":720,"name":"Super Health Potion","image":"items/potion-super-health.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":731,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":726,"name":"Super Combat Loot Potion","image":"items/potion-super-combat-loot.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":732,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":725,"name":"Super Combat XP Potion","image":"items/potion-super-combat-efficiency.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":733,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":723,"name":"Super Gather Level Potion","image":"items/potion-super-gather-level.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":734,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":728,"name":"Super Gather Yield Potion","image":"items/potion-super-gather-yield.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":735,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":721,"name":"Super Gather XP Potion","image":"items/potion-super-gather-efficiency.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":736,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":724,"name":"Super Craft Level Potion","image":"items/potion-super-craft-level.png","level":70,"exp":30.800000000000004,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":737,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":727,"name":"Super Multi Craft Potion","image":"items/potion-super-preservation.png","level":85,"exp":38.4,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":738,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":722,"name":"Super Craft XP Potion","image":"items/potion-super-craft-efficiency.png","level":100,"exp":46.800000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":740,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":740,"name":"Divine Health Potion","image":"items/potion-divine-health.png","level":70,"exp":46.2,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":741,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":746,"name":"Divine Combat Loot Potion","image":"items/potion-divine-combat-loot.png","level":85,"exp":57.599999999999994,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":742,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":745,"name":"Divine Combat XP Potion","image":"items/potion-divine-combat-efficiency.png","level":100,"exp":70.2,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":743,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":743,"name":"Divine Gather Level Potion","image":"items/potion-divine-gather-level.png","level":70,"exp":46.2,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":744,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":748,"name":"Divine Gather Yield Potion","image":"items/potion-divine-gather-yield.png","level":85,"exp":57.599999999999994,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":745,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":741,"name":"Divine Gather XP Potion","image":"items/potion-divine-gather-efficiency.png","level":100,"exp":70.2,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":746,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":744,"name":"Divine Craft Level Potion","image":"items/potion-divine-craft-level.png","level":70,"exp":46.2,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":747,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":747,"name":"Divine Multi Craft Potion","image":"items/potion-divine-preservation.png","level":85,"exp":57.599999999999994,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":748,"skill":"Alchemy","type":"ACTIVITY","structure":null,"monster":null,"item":742,"name":"Divine Craft XP Potion","image":"items/potion-divine-craft-efficiency.png","level":100,"exp":70.2,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":1000},{"id":1000,"skill":"Woodcutting","type":"OUTSKIRTS","structure":null,"monster":200,"item":12,"name":"Outskirts Birch Tree","image":"items/tree-birch.png","level":25,"exp":15.36,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":996},{"id":1001,"skill":"Woodcutting","type":"OUTSKIRTS","structure":null,"monster":201,"item":13,"name":"Outskirts Teak Tree","image":"items/tree-teak.png","level":40,"exp":21.599999999999998,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":995},{"id":1002,"skill":"Woodcutting","type":"OUTSKIRTS","structure":null,"monster":202,"item":14,"name":"Outskirts Mahogany Tree","image":"items/tree-mahogany.png","level":55,"exp":28.799999999999997,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1003,"skill":"Woodcutting","type":"OUTSKIRTS","structure":null,"monster":203,"item":15,"name":"Outskirts Ironbark Tree","image":"items/tree-ironbark.png","level":70,"exp":36.96,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1004,"skill":"Woodcutting","type":"OUTSKIRTS","structure":null,"monster":204,"item":16,"name":"Outskirts Redwood Tree","image":"items/tree-redwood.png","level":85,"exp":46.08,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":992},{"id":1005,"skill":"Woodcutting","type":"OUTSKIRTS","structure":null,"monster":205,"item":17,"name":"Outskirts Ancient Tree","image":"items/tree-ancient.png","level":100,"exp":56.160000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":991},{"id":1010,"skill":"Mining","type":"OUTSKIRTS","structure":null,"monster":210,"item":22,"name":"Outskirts Silver Rock","image":"items/rock-silver.png","level":25,"exp":15.36,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":996},{"id":1011,"skill":"Mining","type":"OUTSKIRTS","structure":null,"monster":211,"item":23,"name":"Outskirts Gold Rock","image":"items/rock-gold.png","level":40,"exp":21.599999999999998,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":995},{"id":1012,"skill":"Mining","type":"OUTSKIRTS","structure":null,"monster":212,"item":24,"name":"Outskirts Cobalt Rock","image":"items/rock-cobalt.png","level":55,"exp":28.799999999999997,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1013,"skill":"Mining","type":"OUTSKIRTS","structure":null,"monster":213,"item":26,"name":"Outskirts Obsidian Rock","image":"items/rock-obsidian.png","level":70,"exp":36.96,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1014,"skill":"Mining","type":"OUTSKIRTS","structure":null,"monster":214,"item":27,"name":"Outskirts Astral Rock","image":"items/rock-astral.png","level":85,"exp":46.08,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":992},{"id":1015,"skill":"Mining","type":"OUTSKIRTS","structure":null,"monster":215,"item":28,"name":"Outskirts Infernal Rock","image":"items/rock-infernal.png","level":100,"exp":56.160000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":991},{"id":1020,"skill":"Fishing","type":"OUTSKIRTS","structure":null,"monster":220,"item":311,"name":"Outskirts Raw Salmon","image":"items/raw-salmon.png","level":25,"exp":15.36,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":996},{"id":1022,"skill":"Fishing","type":"OUTSKIRTS","structure":null,"monster":222,"item":317,"name":"Outskirts Raw Lobster","image":"items/raw-lobster.png","level":55,"exp":28.799999999999997,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1023,"skill":"Fishing","type":"OUTSKIRTS","structure":null,"monster":223,"item":320,"name":"Outskirts Raw Swordfish","image":"items/raw-swordfish.png","level":70,"exp":36.96,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1024,"skill":"Fishing","type":"OUTSKIRTS","structure":null,"monster":224,"item":325,"name":"Outskirts Raw Shark","image":"items/raw-shark.png","level":85,"exp":46.08,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":992},{"id":1025,"skill":"Fishing","type":"OUTSKIRTS","structure":null,"monster":225,"item":342,"name":"Outskirts Raw King Crab","image":"items/raw-king-crab.png","level":100,"exp":56.160000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":991},{"id":1030,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":200,"item":352,"name":"Outskirts Rose","image":"items/flower-rose.png","level":25,"exp":15.36,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":996},{"id":1031,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":201,"item":353,"name":"Outskirts Daisy","image":"items/flower-daisy.png","level":40,"exp":21.599999999999998,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":995},{"id":1032,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":202,"item":354,"name":"Outskirts Lilac","image":"items/flower-lilac.png","level":55,"exp":28.799999999999997,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1033,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":203,"item":355,"name":"Outskirts Hyacinth","image":"items/flower-hyacinth.png","level":70,"exp":36.96,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1034,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":204,"item":356,"name":"Outskirts Nemesia","image":"items/flower-nemesia.png","level":85,"exp":46.08,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":992},{"id":1035,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":200,"item":362,"name":"Outskirts Onion","image":"items/food-onion.png","level":25,"exp":15.36,"speed":8,"tier":3,"monsterGroup":null,"outskirtsMonsterChance":996},{"id":1036,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":201,"item":363,"name":"Outskirts Carrot","image":"items/food-carrot.png","level":40,"exp":21.599999999999998,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":995},{"id":1037,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":202,"item":364,"name":"Outskirts Tomato","image":"items/food-tomato.png","level":55,"exp":28.799999999999997,"speed":12,"tier":5,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1038,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":203,"item":365,"name":"Outskirts Corn","image":"items/food-corn.png","level":70,"exp":36.96,"speed":14,"tier":6,"monsterGroup":null,"outskirtsMonsterChance":994},{"id":1039,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":204,"item":366,"name":"Outskirts Pumpkin","image":"items/food-pumpkin.png","level":85,"exp":46.08,"speed":16,"tier":7,"monsterGroup":null,"outskirtsMonsterChance":992},{"id":1040,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":205,"item":367,"name":"Outskirts Chilli","image":"items/food-chilli.png","level":100,"exp":56.160000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":991},{"id":1041,"skill":"Farming","type":"OUTSKIRTS","structure":null,"monster":205,"item":357,"name":"Outskirts Snapdragon","image":"items/flower-snapdragon.png","level":100,"exp":56.160000000000004,"speed":18,"tier":8,"monsterGroup":null,"outskirtsMonsterChance":991},{"id":10201,"skill":"Fishing","type":"OUTSKIRTS","structure":null,"monster":221,"item":314,"name":"Outskirts Raw Bass","image":"items/raw-bass.png","level":40,"exp":21.599999999999998,"speed":10,"tier":4,"monsterGroup":null,"outskirtsMonsterChance":995}]', 'public/list/action');
    request.listDrops = () => requestWithFallback('[{"id":237166,"action":-2010,"item":2,"type":"GUARANTEED","chance":1,"amount":1},{"id":237167,"action":-2011,"item":2,"type":"GUARANTEED","chance":1,"amount":2},{"id":237168,"action":-2012,"item":2,"type":"GUARANTEED","chance":1,"amount":3},{"id":237169,"action":-2013,"item":2,"type":"GUARANTEED","chance":1,"amount":4},{"id":237170,"action":-2014,"item":2,"type":"GUARANTEED","chance":1,"amount":5},{"id":237171,"action":-2015,"item":2,"type":"GUARANTEED","chance":1,"amount":6},{"id":237172,"action":-2016,"item":2,"type":"GUARANTEED","chance":1,"amount":7},{"id":237173,"action":-2017,"item":2,"type":"GUARANTEED","chance":1,"amount":8},{"id":237174,"action":-7300,"item":7,"type":"GUARANTEED","chance":1,"amount":20},{"id":237175,"action":-7301,"item":7,"type":"GUARANTEED","chance":1,"amount":40},{"id":237176,"action":-7302,"item":7,"type":"GUARANTEED","chance":1,"amount":60},{"id":237177,"action":-7303,"item":7,"type":"GUARANTEED","chance":1,"amount":80},{"id":237178,"action":-7304,"item":7,"type":"GUARANTEED","chance":1,"amount":100},{"id":237179,"action":-7323,"item":7,"type":"GUARANTEED","chance":1,"amount":120},{"id":237180,"action":-7324,"item":7,"type":"GUARANTEED","chance":1,"amount":140},{"id":237181,"action":-7347,"item":7,"type":"GUARANTEED","chance":1,"amount":160},{"id":237182,"action":-7400,"item":7,"type":"GUARANTEED","chance":1,"amount":2},{"id":237183,"action":-7405,"item":7,"type":"GUARANTEED","chance":1,"amount":4},{"id":237184,"action":-7406,"item":7,"type":"GUARANTEED","chance":1,"amount":6},{"id":237185,"action":-7407,"item":7,"type":"GUARANTEED","chance":1,"amount":8},{"id":237186,"action":-7408,"item":7,"type":"GUARANTEED","chance":1,"amount":10},{"id":237187,"action":-7409,"item":7,"type":"GUARANTEED","chance":1,"amount":12},{"id":237188,"action":-7410,"item":7,"type":"GUARANTEED","chance":1,"amount":14},{"id":237189,"action":-7411,"item":7,"type":"GUARANTEED","chance":1,"amount":16},{"id":237190,"action":-5030,"item":5,"type":"GUARANTEED","chance":1,"amount":50},{"id":237191,"action":-5031,"item":5,"type":"GUARANTEED","chance":1,"amount":100},{"id":237192,"action":-5032,"item":5,"type":"GUARANTEED","chance":1,"amount":150},{"id":237193,"action":-5033,"item":5,"type":"GUARANTEED","chance":1,"amount":200},{"id":237194,"action":-5034,"item":5,"type":"GUARANTEED","chance":1,"amount":300},{"id":237195,"action":-5035,"item":5,"type":"GUARANTEED","chance":1,"amount":250},{"id":237196,"action":-5036,"item":5,"type":"GUARANTEED","chance":1,"amount":350},{"id":237197,"action":-5037,"item":5,"type":"GUARANTEED","chance":1,"amount":400},{"id":237198,"action":-6305,"item":6,"type":"GUARANTEED","chance":1,"amount":1},{"id":237199,"action":-6308,"item":6,"type":"GUARANTEED","chance":1,"amount":2},{"id":237200,"action":-6311,"item":6,"type":"GUARANTEED","chance":1,"amount":3},{"id":237201,"action":-6314,"item":6,"type":"GUARANTEED","chance":1,"amount":4},{"id":237202,"action":-6317,"item":6,"type":"GUARANTEED","chance":1,"amount":5},{"id":237203,"action":-6320,"item":6,"type":"GUARANTEED","chance":1,"amount":6},{"id":237204,"action":-6325,"item":6,"type":"GUARANTEED","chance":1,"amount":7},{"id":237205,"action":-6342,"item":6,"type":"GUARANTEED","chance":1,"amount":8},{"id":237206,"action":-9100,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237207,"action":-9101,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237208,"action":-9102,"item":9,"type":"GUARANTEED","chance":1,"amount":3},{"id":237209,"action":-9103,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237210,"action":-9104,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237211,"action":-9110,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237212,"action":-9111,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237213,"action":-9112,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237214,"action":-9113,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237215,"action":-9114,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237216,"action":-9120,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237217,"action":-9121,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237218,"action":-9122,"item":9,"type":"GUARANTEED","chance":1,"amount":9},{"id":237219,"action":-9123,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237220,"action":-9124,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237221,"action":-9130,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237222,"action":-9131,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237223,"action":-9132,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237224,"action":-9133,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237225,"action":-9134,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237226,"action":-9140,"item":9,"type":"GUARANTEED","chance":1,"amount":15},{"id":237227,"action":-9141,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237228,"action":-9142,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237229,"action":-9143,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237230,"action":-9144,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237231,"action":-9150,"item":9,"type":"GUARANTEED","chance":1,"amount":18},{"id":237232,"action":-9151,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237233,"action":-9152,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237234,"action":-9153,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237235,"action":-9154,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237236,"action":-9160,"item":9,"type":"GUARANTEED","chance":1,"amount":21},{"id":237237,"action":-9161,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237238,"action":-9162,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237239,"action":-9163,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237240,"action":-9164,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237241,"action":-9170,"item":9,"type":"GUARANTEED","chance":1,"amount":24},{"id":237242,"action":-9171,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237243,"action":-9172,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237244,"action":-9173,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237245,"action":-9174,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237246,"action":-9200,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237247,"action":-9201,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237248,"action":-9202,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237249,"action":-9203,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237250,"action":-9204,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237251,"action":-9205,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237252,"action":-9206,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237253,"action":-9207,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237254,"action":-9208,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237255,"action":-9209,"item":9,"type":"GUARANTEED","chance":1,"amount":2},{"id":237256,"action":-9210,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237257,"action":-9211,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237258,"action":-9212,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237259,"action":-9213,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237260,"action":-9214,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237261,"action":-9215,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237262,"action":-9216,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237263,"action":-9217,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237264,"action":-9218,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237265,"action":-9219,"item":9,"type":"GUARANTEED","chance":1,"amount":4},{"id":237266,"action":-9220,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237267,"action":-9221,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237268,"action":-9222,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237269,"action":-9223,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237270,"action":-9224,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237271,"action":-9225,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237272,"action":-9226,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237273,"action":-9227,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237274,"action":-9228,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237275,"action":-9229,"item":9,"type":"GUARANTEED","chance":1,"amount":6},{"id":237276,"action":-9230,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237277,"action":-9231,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237278,"action":-9232,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237279,"action":-9233,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237280,"action":-9234,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237281,"action":-9235,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237282,"action":-9236,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237283,"action":-9237,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237284,"action":-9238,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237285,"action":-9239,"item":9,"type":"GUARANTEED","chance":1,"amount":8},{"id":237286,"action":-9240,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237287,"action":-9241,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237288,"action":-9242,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237289,"action":-9243,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237290,"action":-9244,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237291,"action":-9245,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237292,"action":-9246,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237293,"action":-9247,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237294,"action":-9248,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237295,"action":-9249,"item":9,"type":"GUARANTEED","chance":1,"amount":10},{"id":237296,"action":-9260,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237297,"action":-9261,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237298,"action":-9262,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237299,"action":-9263,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237300,"action":-9264,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237301,"action":-9265,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237302,"action":-9266,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237303,"action":-9267,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237304,"action":-9268,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237305,"action":-9269,"item":9,"type":"GUARANTEED","chance":1,"amount":12},{"id":237306,"action":-9270,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237307,"action":-9271,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237308,"action":-9272,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237309,"action":-9273,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237310,"action":-9274,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237311,"action":-9275,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237312,"action":-9276,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237313,"action":-9277,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237314,"action":-9278,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237315,"action":-9279,"item":9,"type":"GUARANTEED","chance":1,"amount":14},{"id":237316,"action":-9280,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237317,"action":-9281,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237318,"action":-9282,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237319,"action":-9283,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237320,"action":-9284,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237321,"action":-9285,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237322,"action":-9286,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237323,"action":-9287,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237324,"action":-9288,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237325,"action":-9289,"item":9,"type":"GUARANTEED","chance":1,"amount":16},{"id":237326,"action":-2306,"item":-2,"type":"GUARANTEED","chance":1,"amount":20},{"id":237327,"action":-2309,"item":-2,"type":"GUARANTEED","chance":1,"amount":40},{"id":237328,"action":-2312,"item":-2,"type":"GUARANTEED","chance":1,"amount":60},{"id":237329,"action":-2315,"item":-2,"type":"GUARANTEED","chance":1,"amount":80},{"id":237330,"action":-2318,"item":-2,"type":"GUARANTEED","chance":1,"amount":100},{"id":237331,"action":-2321,"item":-2,"type":"GUARANTEED","chance":1,"amount":120},{"id":237332,"action":-2326,"item":-2,"type":"GUARANTEED","chance":1,"amount":140},{"id":237333,"action":-2328,"item":-2,"type":"GUARANTEED","chance":1,"amount":30},{"id":237334,"action":-2329,"item":-2,"type":"GUARANTEED","chance":1,"amount":60},{"id":237335,"action":-2330,"item":-2,"type":"GUARANTEED","chance":1,"amount":90},{"id":237336,"action":-2331,"item":-2,"type":"GUARANTEED","chance":1,"amount":120},{"id":237337,"action":-2332,"item":-2,"type":"GUARANTEED","chance":1,"amount":150},{"id":237338,"action":-2333,"item":-2,"type":"GUARANTEED","chance":1,"amount":180},{"id":237339,"action":-2334,"item":-2,"type":"GUARANTEED","chance":1,"amount":210},{"id":237340,"action":-2343,"item":-2,"type":"GUARANTEED","chance":1,"amount":160},{"id":237341,"action":-2345,"item":-2,"type":"GUARANTEED","chance":1,"amount":240},{"id":237342,"action":-2900,"item":-2,"type":"GUARANTEED","chance":1,"amount":1000},{"id":238016,"action":10,"item":300,"type":"REGULAR","chance":0.05,"amount":1},{"id":238017,"action":10,"item":10,"type":"REGULAR","chance":0.95,"amount":1},{"id":238018,"action":11,"item":11,"type":"REGULAR","chance":0.95,"amount":1},{"id":238019,"action":11,"item":301,"type":"REGULAR","chance":0.05,"amount":1},{"id":238020,"action":12,"item":12,"type":"REGULAR","chance":0.95,"amount":1},{"id":238021,"action":12,"item":302,"type":"REGULAR","chance":0.05,"amount":1},{"id":238022,"action":13,"item":13,"type":"REGULAR","chance":0.95,"amount":1},{"id":238023,"action":13,"item":303,"type":"REGULAR","chance":0.05,"amount":1},{"id":238024,"action":14,"item":14,"type":"REGULAR","chance":0.95,"amount":1},{"id":238025,"action":14,"item":304,"type":"REGULAR","chance":0.05,"amount":1},{"id":238026,"action":15,"item":323,"type":"REGULAR","chance":0.05,"amount":1},{"id":238027,"action":15,"item":15,"type":"REGULAR","chance":0.95,"amount":1},{"id":238028,"action":16,"item":16,"type":"REGULAR","chance":0.95,"amount":1},{"id":238029,"action":16,"item":324,"type":"REGULAR","chance":0.05,"amount":1},{"id":238030,"action":17,"item":17,"type":"REGULAR","chance":0.95,"amount":1},{"id":238031,"action":17,"item":347,"type":"REGULAR","chance":0.05,"amount":1},{"id":238032,"action":20,"item":20,"type":"REGULAR","chance":0.99,"amount":1},{"id":238033,"action":20,"item":30,"type":"REGULAR","chance":0.01,"amount":1},{"id":238034,"action":21,"item":21,"type":"REGULAR","chance":0.99,"amount":1},{"id":238035,"action":21,"item":31,"type":"REGULAR","chance":0.01,"amount":1},{"id":238036,"action":22,"item":22,"type":"REGULAR","chance":0.99,"amount":1},{"id":238037,"action":22,"item":32,"type":"REGULAR","chance":0.01,"amount":1},{"id":238038,"action":23,"item":23,"type":"REGULAR","chance":0.99,"amount":1},{"id":238039,"action":23,"item":33,"type":"REGULAR","chance":0.01,"amount":1},{"id":238040,"action":24,"item":24,"type":"REGULAR","chance":0.99,"amount":1},{"id":238041,"action":24,"item":35,"type":"REGULAR","chance":0.01,"amount":1},{"id":238042,"action":25,"item":34,"type":"REGULAR","chance":0.01,"amount":1},{"id":238043,"action":25,"item":26,"type":"REGULAR","chance":0.99,"amount":1},{"id":238044,"action":26,"item":36,"type":"REGULAR","chance":0.01,"amount":1},{"id":238045,"action":26,"item":27,"type":"REGULAR","chance":0.99,"amount":1},{"id":238046,"action":27,"item":37,"type":"REGULAR","chance":0.01,"amount":1},{"id":238047,"action":27,"item":28,"type":"REGULAR","chance":0.99,"amount":1},{"id":238048,"action":30,"item":40,"type":"REGULAR","chance":1,"amount":1},{"id":238049,"action":31,"item":41,"type":"REGULAR","chance":1,"amount":1},{"id":238050,"action":32,"item":42,"type":"REGULAR","chance":1,"amount":1},{"id":238051,"action":33,"item":43,"type":"REGULAR","chance":1,"amount":1},{"id":238052,"action":34,"item":44,"type":"REGULAR","chance":1,"amount":1},{"id":238053,"action":35,"item":45,"type":"REGULAR","chance":1,"amount":1},{"id":238054,"action":36,"item":46,"type":"REGULAR","chance":1,"amount":1},{"id":238055,"action":37,"item":47,"type":"REGULAR","chance":1,"amount":1},{"id":238056,"action":40,"item":305,"type":"REGULAR","chance":1,"amount":1},{"id":238057,"action":40,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238058,"action":40,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238059,"action":41,"item":308,"type":"REGULAR","chance":1,"amount":1},{"id":238060,"action":41,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238061,"action":41,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238062,"action":42,"item":311,"type":"REGULAR","chance":1,"amount":1},{"id":238063,"action":42,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238064,"action":42,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238065,"action":43,"item":314,"type":"REGULAR","chance":1,"amount":1},{"id":238066,"action":43,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238067,"action":43,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238068,"action":44,"item":317,"type":"REGULAR","chance":1,"amount":1},{"id":238069,"action":44,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238070,"action":44,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238071,"action":45,"item":320,"type":"REGULAR","chance":1,"amount":1},{"id":238072,"action":45,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238073,"action":45,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238074,"action":46,"item":325,"type":"REGULAR","chance":1,"amount":1},{"id":238075,"action":46,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238076,"action":46,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238077,"action":47,"item":342,"type":"REGULAR","chance":1,"amount":1},{"id":238078,"action":47,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238079,"action":47,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238080,"action":50,"item":306,"type":"REGULAR","chance":1,"amount":1},{"id":238081,"action":50,"item":307,"type":"FAILED","chance":1,"amount":1},{"id":238082,"action":51,"item":309,"type":"REGULAR","chance":1,"amount":1},{"id":238083,"action":51,"item":310,"type":"FAILED","chance":1,"amount":1},{"id":238084,"action":52,"item":312,"type":"REGULAR","chance":1,"amount":1},{"id":238085,"action":52,"item":313,"type":"FAILED","chance":1,"amount":1},{"id":238086,"action":53,"item":315,"type":"REGULAR","chance":1,"amount":1},{"id":238087,"action":53,"item":316,"type":"FAILED","chance":1,"amount":1},{"id":238088,"action":54,"item":318,"type":"REGULAR","chance":1,"amount":1},{"id":238089,"action":54,"item":319,"type":"FAILED","chance":1,"amount":1},{"id":238090,"action":55,"item":321,"type":"REGULAR","chance":1,"amount":1},{"id":238091,"action":55,"item":322,"type":"FAILED","chance":1,"amount":1},{"id":238092,"action":57,"item":326,"type":"REGULAR","chance":1,"amount":1},{"id":238093,"action":57,"item":327,"type":"FAILED","chance":1,"amount":1},{"id":238094,"action":58,"item":343,"type":"REGULAR","chance":1,"amount":1},{"id":238095,"action":58,"item":344,"type":"FAILED","chance":1,"amount":1},{"id":238096,"action":60,"item":328,"type":"REGULAR","chance":1,"amount":1},{"id":238097,"action":60,"item":335,"type":"FAILED","chance":1,"amount":1},{"id":238098,"action":61,"item":329,"type":"REGULAR","chance":1,"amount":1},{"id":238099,"action":61,"item":336,"type":"FAILED","chance":1,"amount":1},{"id":238100,"action":62,"item":330,"type":"REGULAR","chance":1,"amount":1},{"id":238101,"action":62,"item":337,"type":"FAILED","chance":1,"amount":1},{"id":238102,"action":63,"item":331,"type":"REGULAR","chance":1,"amount":1},{"id":238103,"action":63,"item":338,"type":"FAILED","chance":1,"amount":1},{"id":238104,"action":64,"item":332,"type":"REGULAR","chance":1,"amount":1},{"id":238105,"action":64,"item":339,"type":"FAILED","chance":1,"amount":1},{"id":238106,"action":65,"item":333,"type":"REGULAR","chance":1,"amount":1},{"id":238107,"action":65,"item":340,"type":"FAILED","chance":1,"amount":1},{"id":238108,"action":66,"item":334,"type":"REGULAR","chance":1,"amount":1},{"id":238109,"action":66,"item":341,"type":"FAILED","chance":1,"amount":1},{"id":238110,"action":67,"item":345,"type":"REGULAR","chance":1,"amount":1},{"id":238111,"action":67,"item":346,"type":"FAILED","chance":1,"amount":1},{"id":238112,"action":70,"item":70,"type":"REGULAR","chance":1,"amount":1},{"id":238113,"action":71,"item":71,"type":"REGULAR","chance":1,"amount":1},{"id":238114,"action":72,"item":72,"type":"REGULAR","chance":1,"amount":1},{"id":238115,"action":73,"item":73,"type":"REGULAR","chance":1,"amount":1},{"id":238116,"action":74,"item":74,"type":"REGULAR","chance":1,"amount":1},{"id":238117,"action":75,"item":75,"type":"REGULAR","chance":1,"amount":1},{"id":238118,"action":76,"item":76,"type":"REGULAR","chance":1,"amount":1},{"id":238119,"action":77,"item":77,"type":"REGULAR","chance":1,"amount":1},{"id":238120,"action":80,"item":1100,"type":"REGULAR","chance":1,"amount":1},{"id":238121,"action":81,"item":1101,"type":"REGULAR","chance":1,"amount":1},{"id":238122,"action":82,"item":1102,"type":"REGULAR","chance":1,"amount":1},{"id":238123,"action":84,"item":1104,"type":"REGULAR","chance":1,"amount":1},{"id":238124,"action":85,"item":1105,"type":"REGULAR","chance":1,"amount":1},{"id":238125,"action":90,"item":80,"type":"REGULAR","chance":1,"amount":1},{"id":238126,"action":91,"item":81,"type":"REGULAR","chance":1,"amount":1},{"id":238127,"action":92,"item":82,"type":"REGULAR","chance":1,"amount":1},{"id":238128,"action":93,"item":83,"type":"REGULAR","chance":1,"amount":1},{"id":238129,"action":94,"item":84,"type":"REGULAR","chance":1,"amount":1},{"id":238130,"action":95,"item":85,"type":"REGULAR","chance":1,"amount":1},{"id":238131,"action":100,"item":100,"type":"REGULAR","chance":1,"amount":1},{"id":238132,"action":101,"item":101,"type":"REGULAR","chance":1,"amount":1},{"id":238133,"action":102,"item":102,"type":"REGULAR","chance":1,"amount":1},{"id":238134,"action":103,"item":103,"type":"REGULAR","chance":1,"amount":1},{"id":238135,"action":104,"item":104,"type":"REGULAR","chance":1,"amount":1},{"id":238136,"action":110,"item":110,"type":"REGULAR","chance":1,"amount":1},{"id":238137,"action":111,"item":111,"type":"REGULAR","chance":1,"amount":1},{"id":238138,"action":112,"item":112,"type":"REGULAR","chance":1,"amount":1},{"id":238139,"action":113,"item":113,"type":"REGULAR","chance":1,"amount":1},{"id":238140,"action":114,"item":114,"type":"REGULAR","chance":1,"amount":1},{"id":238141,"action":120,"item":120,"type":"REGULAR","chance":1,"amount":1},{"id":238142,"action":121,"item":121,"type":"REGULAR","chance":1,"amount":1},{"id":238143,"action":122,"item":122,"type":"REGULAR","chance":1,"amount":1},{"id":238144,"action":123,"item":123,"type":"REGULAR","chance":1,"amount":1},{"id":238145,"action":124,"item":124,"type":"REGULAR","chance":1,"amount":1},{"id":238146,"action":130,"item":130,"type":"REGULAR","chance":1,"amount":1},{"id":238147,"action":131,"item":131,"type":"REGULAR","chance":1,"amount":1},{"id":238148,"action":132,"item":132,"type":"REGULAR","chance":1,"amount":1},{"id":238149,"action":133,"item":133,"type":"REGULAR","chance":1,"amount":1},{"id":238150,"action":134,"item":134,"type":"REGULAR","chance":1,"amount":1},{"id":238151,"action":140,"item":140,"type":"REGULAR","chance":1,"amount":1},{"id":238152,"action":141,"item":141,"type":"REGULAR","chance":1,"amount":1},{"id":238153,"action":142,"item":142,"type":"REGULAR","chance":1,"amount":1},{"id":238154,"action":143,"item":143,"type":"REGULAR","chance":1,"amount":1},{"id":238155,"action":144,"item":144,"type":"REGULAR","chance":1,"amount":1},{"id":238156,"action":150,"item":150,"type":"REGULAR","chance":1,"amount":1},{"id":238157,"action":151,"item":151,"type":"REGULAR","chance":1,"amount":1},{"id":238158,"action":152,"item":152,"type":"REGULAR","chance":1,"amount":1},{"id":238159,"action":153,"item":153,"type":"REGULAR","chance":1,"amount":1},{"id":238160,"action":154,"item":154,"type":"REGULAR","chance":1,"amount":1},{"id":238161,"action":160,"item":160,"type":"REGULAR","chance":1,"amount":1},{"id":238162,"action":161,"item":161,"type":"REGULAR","chance":1,"amount":1},{"id":238163,"action":162,"item":162,"type":"REGULAR","chance":1,"amount":1},{"id":238164,"action":163,"item":163,"type":"REGULAR","chance":1,"amount":1},{"id":238165,"action":164,"item":164,"type":"REGULAR","chance":1,"amount":1},{"id":238166,"action":170,"item":170,"type":"REGULAR","chance":1,"amount":1},{"id":238167,"action":171,"item":171,"type":"REGULAR","chance":1,"amount":1},{"id":238168,"action":172,"item":172,"type":"REGULAR","chance":1,"amount":1},{"id":238169,"action":173,"item":173,"type":"REGULAR","chance":1,"amount":1},{"id":238170,"action":174,"item":174,"type":"REGULAR","chance":1,"amount":1},{"id":238171,"action":200,"item":203,"type":"REGULAR","chance":1,"amount":1},{"id":238172,"action":201,"item":201,"type":"REGULAR","chance":1,"amount":1},{"id":238173,"action":202,"item":202,"type":"REGULAR","chance":1,"amount":1},{"id":238174,"action":203,"item":204,"type":"REGULAR","chance":1,"amount":1},{"id":238175,"action":204,"item":200,"type":"REGULAR","chance":1,"amount":1},{"id":238176,"action":205,"item":205,"type":"REGULAR","chance":1,"amount":1},{"id":238177,"action":206,"item":206,"type":"REGULAR","chance":1,"amount":1},{"id":238178,"action":207,"item":207,"type":"REGULAR","chance":1,"amount":1},{"id":238179,"action":208,"item":208,"type":"REGULAR","chance":1,"amount":1},{"id":238180,"action":209,"item":209,"type":"REGULAR","chance":1,"amount":1},{"id":238181,"action":210,"item":213,"type":"REGULAR","chance":1,"amount":1},{"id":238182,"action":211,"item":211,"type":"REGULAR","chance":1,"amount":1},{"id":238183,"action":212,"item":212,"type":"REGULAR","chance":1,"amount":1},{"id":238184,"action":213,"item":214,"type":"REGULAR","chance":1,"amount":1},{"id":238185,"action":214,"item":210,"type":"REGULAR","chance":1,"amount":1},{"id":238186,"action":215,"item":215,"type":"REGULAR","chance":1,"amount":1},{"id":238187,"action":216,"item":216,"type":"REGULAR","chance":1,"amount":1},{"id":238188,"action":217,"item":217,"type":"REGULAR","chance":1,"amount":1},{"id":238189,"action":218,"item":218,"type":"REGULAR","chance":1,"amount":1},{"id":238190,"action":219,"item":219,"type":"REGULAR","chance":1,"amount":1},{"id":238191,"action":220,"item":223,"type":"REGULAR","chance":1,"amount":1},{"id":238192,"action":221,"item":221,"type":"REGULAR","chance":1,"amount":1},{"id":238193,"action":222,"item":222,"type":"REGULAR","chance":1,"amount":1},{"id":238194,"action":223,"item":224,"type":"REGULAR","chance":1,"amount":1},{"id":238195,"action":224,"item":220,"type":"REGULAR","chance":1,"amount":1},{"id":238196,"action":225,"item":225,"type":"REGULAR","chance":1,"amount":1},{"id":238197,"action":226,"item":226,"type":"REGULAR","chance":1,"amount":1},{"id":238198,"action":227,"item":227,"type":"REGULAR","chance":1,"amount":1},{"id":238199,"action":228,"item":228,"type":"REGULAR","chance":1,"amount":1},{"id":238200,"action":229,"item":229,"type":"REGULAR","chance":1,"amount":1},{"id":238201,"action":230,"item":233,"type":"REGULAR","chance":1,"amount":1},{"id":238202,"action":231,"item":231,"type":"REGULAR","chance":1,"amount":1},{"id":238203,"action":232,"item":232,"type":"REGULAR","chance":1,"amount":1},{"id":238204,"action":233,"item":234,"type":"REGULAR","chance":1,"amount":1},{"id":238205,"action":234,"item":230,"type":"REGULAR","chance":1,"amount":1},{"id":238206,"action":235,"item":235,"type":"REGULAR","chance":1,"amount":1},{"id":238207,"action":236,"item":236,"type":"REGULAR","chance":1,"amount":1},{"id":238208,"action":237,"item":237,"type":"REGULAR","chance":1,"amount":1},{"id":238209,"action":238,"item":238,"type":"REGULAR","chance":1,"amount":1},{"id":238210,"action":239,"item":239,"type":"REGULAR","chance":1,"amount":1},{"id":238211,"action":240,"item":243,"type":"REGULAR","chance":1,"amount":1},{"id":238212,"action":241,"item":241,"type":"REGULAR","chance":1,"amount":1},{"id":238213,"action":242,"item":242,"type":"REGULAR","chance":1,"amount":1},{"id":238214,"action":243,"item":244,"type":"REGULAR","chance":1,"amount":1},{"id":238215,"action":244,"item":240,"type":"REGULAR","chance":1,"amount":1},{"id":238216,"action":245,"item":245,"type":"REGULAR","chance":1,"amount":1},{"id":238217,"action":246,"item":246,"type":"REGULAR","chance":1,"amount":1},{"id":238218,"action":247,"item":247,"type":"REGULAR","chance":1,"amount":1},{"id":238219,"action":248,"item":248,"type":"REGULAR","chance":1,"amount":1},{"id":238220,"action":249,"item":249,"type":"REGULAR","chance":1,"amount":1},{"id":238221,"action":250,"item":263,"type":"REGULAR","chance":1,"amount":1},{"id":238222,"action":251,"item":261,"type":"REGULAR","chance":1,"amount":1},{"id":238223,"action":252,"item":262,"type":"REGULAR","chance":1,"amount":1},{"id":238224,"action":253,"item":264,"type":"REGULAR","chance":1,"amount":1},{"id":238225,"action":254,"item":260,"type":"REGULAR","chance":1,"amount":1},{"id":238226,"action":255,"item":265,"type":"REGULAR","chance":1,"amount":1},{"id":238227,"action":256,"item":266,"type":"REGULAR","chance":1,"amount":1},{"id":238228,"action":257,"item":267,"type":"REGULAR","chance":1,"amount":1},{"id":238229,"action":258,"item":268,"type":"REGULAR","chance":1,"amount":1},{"id":238230,"action":259,"item":269,"type":"REGULAR","chance":1,"amount":1},{"id":238231,"action":260,"item":273,"type":"REGULAR","chance":1,"amount":1},{"id":238232,"action":261,"item":271,"type":"REGULAR","chance":1,"amount":1},{"id":238233,"action":262,"item":272,"type":"REGULAR","chance":1,"amount":1},{"id":238234,"action":263,"item":274,"type":"REGULAR","chance":1,"amount":1},{"id":238235,"action":264,"item":270,"type":"REGULAR","chance":1,"amount":1},{"id":238236,"action":265,"item":275,"type":"REGULAR","chance":1,"amount":1},{"id":238237,"action":266,"item":276,"type":"REGULAR","chance":1,"amount":1},{"id":238238,"action":267,"item":277,"type":"REGULAR","chance":1,"amount":1},{"id":238239,"action":268,"item":278,"type":"REGULAR","chance":1,"amount":1},{"id":238240,"action":269,"item":279,"type":"REGULAR","chance":1,"amount":1},{"id":238241,"action":270,"item":283,"type":"REGULAR","chance":1,"amount":1},{"id":238242,"action":271,"item":281,"type":"REGULAR","chance":1,"amount":1},{"id":238243,"action":272,"item":282,"type":"REGULAR","chance":1,"amount":1},{"id":238244,"action":273,"item":284,"type":"REGULAR","chance":1,"amount":1},{"id":238245,"action":274,"item":280,"type":"REGULAR","chance":1,"amount":1},{"id":238246,"action":275,"item":285,"type":"REGULAR","chance":1,"amount":1},{"id":238247,"action":276,"item":286,"type":"REGULAR","chance":1,"amount":1},{"id":238248,"action":277,"item":287,"type":"REGULAR","chance":1,"amount":1},{"id":238249,"action":278,"item":288,"type":"REGULAR","chance":1,"amount":1},{"id":238250,"action":279,"item":289,"type":"REGULAR","chance":1,"amount":1},{"id":238251,"action":300,"item":405,"type":"GUARANTEED","chance":1,"amount":1},{"id":238252,"action":300,"item":11,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238253,"action":300,"item":351,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238254,"action":300,"item":10,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238255,"action":300,"item":350,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238256,"action":300,"item":31,"type":"REGULAR","chance":0.005,"amount":1},{"id":238257,"action":300,"item":30,"type":"REGULAR","chance":0.005,"amount":1},{"id":238258,"action":300,"item":1,"type":"REGULAR","chance":0.8,"amount":10},{"id":238259,"action":301,"item":408,"type":"GUARANTEED","chance":1,"amount":1},{"id":238260,"action":301,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238261,"action":301,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238262,"action":301,"item":1,"type":"REGULAR","chance":0.8,"amount":75},{"id":238263,"action":301,"item":14,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238264,"action":301,"item":354,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238265,"action":301,"item":13,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238266,"action":301,"item":353,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238270,"action":302,"item":400,"type":"GUARANTEED","chance":1,"amount":1},{"id":238271,"action":302,"item":10,"type":"REGULAR","chance":0.095,"amount":2},{"id":238272,"action":302,"item":20,"type":"REGULAR","chance":0.095,"amount":2},{"id":238273,"action":302,"item":30,"type":"REGULAR","chance":0.01,"amount":1},{"id":238274,"action":302,"item":1,"type":"REGULAR","chance":0.8,"amount":5},{"id":238275,"action":304,"item":405,"type":"GUARANTEED","chance":1,"amount":1},{"id":238276,"action":304,"item":11,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238277,"action":304,"item":21,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238278,"action":304,"item":10,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238279,"action":304,"item":20,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238280,"action":304,"item":31,"type":"REGULAR","chance":0.005,"amount":1},{"id":238281,"action":304,"item":30,"type":"REGULAR","chance":0.005,"amount":1},{"id":238282,"action":304,"item":1,"type":"REGULAR","chance":0.8,"amount":10},{"id":238283,"action":305,"item":409,"type":"GUARANTEED","chance":1,"amount":1},{"id":238284,"action":305,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238285,"action":305,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238286,"action":305,"item":1,"type":"REGULAR","chance":0.8,"amount":100},{"id":238287,"action":305,"item":15,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238288,"action":305,"item":355,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238289,"action":305,"item":14,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238290,"action":305,"item":354,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238294,"action":306,"item":408,"type":"GUARANTEED","chance":1,"amount":1},{"id":238295,"action":306,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238296,"action":306,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238297,"action":306,"item":1,"type":"REGULAR","chance":0.8,"amount":75},{"id":238298,"action":306,"item":14,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238299,"action":306,"item":24,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238300,"action":306,"item":13,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238301,"action":306,"item":23,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238305,"action":307,"item":406,"type":"GUARANTEED","chance":1,"amount":1},{"id":238306,"action":307,"item":22,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238307,"action":307,"item":11,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238308,"action":307,"item":21,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238309,"action":307,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238310,"action":307,"item":31,"type":"REGULAR","chance":0.005,"amount":2},{"id":238311,"action":307,"item":1,"type":"REGULAR","chance":0.8,"amount":25},{"id":238312,"action":307,"item":12,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238316,"action":308,"item":400,"type":"GUARANTEED","chance":1,"amount":1},{"id":238317,"action":308,"item":10,"type":"REGULAR","chance":0.095,"amount":2},{"id":238318,"action":308,"item":350,"type":"REGULAR","chance":0.095,"amount":2},{"id":238319,"action":308,"item":30,"type":"REGULAR","chance":0.01,"amount":1},{"id":238320,"action":308,"item":1,"type":"REGULAR","chance":0.8,"amount":5},{"id":238321,"action":309,"item":406,"type":"GUARANTEED","chance":1,"amount":1},{"id":238322,"action":309,"item":352,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238323,"action":309,"item":11,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238324,"action":309,"item":351,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238325,"action":309,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238326,"action":309,"item":31,"type":"REGULAR","chance":0.005,"amount":2},{"id":238327,"action":309,"item":1,"type":"REGULAR","chance":0.8,"amount":25},{"id":238328,"action":309,"item":12,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238332,"action":310,"item":410,"type":"GUARANTEED","chance":1,"amount":1},{"id":238333,"action":310,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238334,"action":310,"item":16,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238335,"action":310,"item":356,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238336,"action":310,"item":15,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238337,"action":310,"item":355,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238338,"action":310,"item":1,"type":"REGULAR","chance":0.8,"amount":125},{"id":238339,"action":310,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238343,"action":311,"item":409,"type":"GUARANTEED","chance":1,"amount":1},{"id":238344,"action":311,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238345,"action":311,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238346,"action":311,"item":1,"type":"REGULAR","chance":0.8,"amount":100},{"id":238347,"action":311,"item":26,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238348,"action":311,"item":15,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238349,"action":311,"item":14,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238350,"action":311,"item":24,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238354,"action":312,"item":407,"type":"GUARANTEED","chance":1,"amount":1},{"id":238355,"action":312,"item":1,"type":"REGULAR","chance":0.8,"amount":50},{"id":238356,"action":312,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238357,"action":312,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238358,"action":312,"item":13,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238359,"action":312,"item":353,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238360,"action":312,"item":12,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238361,"action":312,"item":352,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238365,"action":315,"item":407,"type":"GUARANTEED","chance":1,"amount":1},{"id":238366,"action":315,"item":22,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238367,"action":315,"item":1,"type":"REGULAR","chance":0.8,"amount":50},{"id":238368,"action":315,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238369,"action":315,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238370,"action":315,"item":13,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238371,"action":315,"item":23,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238372,"action":315,"item":12,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238376,"action":317,"item":405,"type":"GUARANTEED","chance":1,"amount":1},{"id":238377,"action":317,"item":11,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238378,"action":317,"item":10,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238379,"action":317,"item":31,"type":"REGULAR","chance":0.005,"amount":1},{"id":238380,"action":317,"item":30,"type":"REGULAR","chance":0.005,"amount":1},{"id":238381,"action":317,"item":308,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238382,"action":317,"item":305,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238383,"action":317,"item":1,"type":"REGULAR","chance":0.8,"amount":10},{"id":238384,"action":318,"item":408,"type":"GUARANTEED","chance":1,"amount":1},{"id":238385,"action":318,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238386,"action":318,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238387,"action":318,"item":317,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238388,"action":318,"item":314,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238389,"action":318,"item":1,"type":"REGULAR","chance":0.8,"amount":75},{"id":238390,"action":318,"item":14,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238391,"action":318,"item":13,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238395,"action":319,"item":400,"type":"GUARANTEED","chance":1,"amount":1},{"id":238396,"action":319,"item":10,"type":"REGULAR","chance":0.095,"amount":2},{"id":238397,"action":319,"item":30,"type":"REGULAR","chance":0.01,"amount":1},{"id":238398,"action":319,"item":305,"type":"REGULAR","chance":0.095,"amount":2},{"id":238399,"action":319,"item":1,"type":"REGULAR","chance":0.8,"amount":5},{"id":238400,"action":320,"item":406,"type":"GUARANTEED","chance":1,"amount":1},{"id":238401,"action":320,"item":11,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238402,"action":320,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238403,"action":320,"item":31,"type":"REGULAR","chance":0.005,"amount":2},{"id":238404,"action":320,"item":308,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238405,"action":320,"item":1,"type":"REGULAR","chance":0.8,"amount":25},{"id":238406,"action":320,"item":311,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238407,"action":320,"item":12,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238411,"action":321,"item":409,"type":"GUARANTEED","chance":1,"amount":1},{"id":238412,"action":321,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238413,"action":321,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238414,"action":321,"item":1,"type":"REGULAR","chance":0.8,"amount":100},{"id":238415,"action":321,"item":317,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238416,"action":321,"item":15,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238417,"action":321,"item":14,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238418,"action":321,"item":320,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238422,"action":322,"item":407,"type":"GUARANTEED","chance":1,"amount":1},{"id":238423,"action":322,"item":1,"type":"REGULAR","chance":0.8,"amount":50},{"id":238424,"action":322,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238425,"action":322,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238426,"action":322,"item":314,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238427,"action":322,"item":13,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238428,"action":322,"item":311,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238429,"action":322,"item":12,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238433,"action":323,"item":410,"type":"GUARANTEED","chance":1,"amount":1},{"id":238434,"action":323,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238435,"action":323,"item":325,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238436,"action":323,"item":16,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238437,"action":323,"item":15,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238438,"action":323,"item":320,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238439,"action":323,"item":1,"type":"REGULAR","chance":0.8,"amount":125},{"id":238440,"action":323,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238444,"action":324,"item":410,"type":"GUARANTEED","chance":1,"amount":1},{"id":238445,"action":324,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238446,"action":324,"item":27,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238447,"action":324,"item":16,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238448,"action":324,"item":26,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238449,"action":324,"item":15,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238450,"action":324,"item":1,"type":"REGULAR","chance":0.8,"amount":125},{"id":238451,"action":324,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238455,"action":325,"item":411,"type":"GUARANTEED","chance":1,"amount":1},{"id":238456,"action":325,"item":37,"type":"REGULAR","chance":0.005,"amount":2},{"id":238457,"action":325,"item":1,"type":"REGULAR","chance":0.8,"amount":250},{"id":238458,"action":325,"item":28,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238459,"action":325,"item":17,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238460,"action":325,"item":27,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238461,"action":325,"item":16,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238462,"action":325,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238466,"action":326,"item":411,"type":"GUARANTEED","chance":1,"amount":1},{"id":238467,"action":326,"item":37,"type":"REGULAR","chance":0.005,"amount":2},{"id":238468,"action":326,"item":1,"type":"REGULAR","chance":0.8,"amount":250},{"id":238469,"action":326,"item":17,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238470,"action":326,"item":325,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238471,"action":326,"item":16,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238472,"action":326,"item":342,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238473,"action":326,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238477,"action":327,"item":411,"type":"GUARANTEED","chance":1,"amount":1},{"id":238478,"action":327,"item":37,"type":"REGULAR","chance":0.005,"amount":2},{"id":238479,"action":327,"item":1,"type":"REGULAR","chance":0.8,"amount":250},{"id":238480,"action":327,"item":17,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238481,"action":327,"item":357,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238482,"action":327,"item":16,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238483,"action":327,"item":356,"type":"REGULAR","chance":0.0475,"amount":4},{"id":238484,"action":327,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238488,"action":350,"item":350,"type":"REGULAR","chance":1,"amount":1},{"id":238489,"action":351,"item":351,"type":"REGULAR","chance":1,"amount":1},{"id":238490,"action":352,"item":352,"type":"REGULAR","chance":1,"amount":1},{"id":238491,"action":353,"item":353,"type":"REGULAR","chance":1,"amount":1},{"id":238492,"action":354,"item":354,"type":"REGULAR","chance":1,"amount":1},{"id":238493,"action":355,"item":355,"type":"REGULAR","chance":1,"amount":1},{"id":238494,"action":356,"item":356,"type":"REGULAR","chance":1,"amount":1},{"id":238495,"action":357,"item":357,"type":"REGULAR","chance":1,"amount":1},{"id":238496,"action":360,"item":360,"type":"REGULAR","chance":1,"amount":1},{"id":238497,"action":361,"item":361,"type":"REGULAR","chance":1,"amount":1},{"id":238498,"action":362,"item":362,"type":"REGULAR","chance":1,"amount":1},{"id":238499,"action":363,"item":363,"type":"REGULAR","chance":1,"amount":1},{"id":238500,"action":364,"item":364,"type":"REGULAR","chance":1,"amount":1},{"id":238501,"action":365,"item":365,"type":"REGULAR","chance":1,"amount":1},{"id":238502,"action":366,"item":366,"type":"REGULAR","chance":1,"amount":1},{"id":238503,"action":367,"item":367,"type":"REGULAR","chance":1,"amount":1},{"id":238504,"action":400,"item":406,"type":"GUARANTEED","chance":1,"amount":1},{"id":238505,"action":400,"item":1,"type":"REGULAR","chance":0.8,"amount":300},{"id":238506,"action":400,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238507,"action":400,"item":31,"type":"REGULAR","chance":0.005,"amount":2},{"id":238508,"action":400,"item":311,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238509,"action":400,"item":12,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238510,"action":400,"item":352,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238511,"action":400,"item":22,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238518,"action":402,"item":408,"type":"GUARANTEED","chance":1,"amount":1},{"id":238519,"action":402,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238520,"action":402,"item":317,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238521,"action":402,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238522,"action":402,"item":1,"type":"REGULAR","chance":0.8,"amount":550},{"id":238523,"action":402,"item":14,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238524,"action":402,"item":354,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238525,"action":402,"item":24,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238532,"action":403,"item":409,"type":"GUARANTEED","chance":1,"amount":1},{"id":238533,"action":403,"item":35,"type":"REGULAR","chance":0.005,"amount":2},{"id":238534,"action":403,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238535,"action":403,"item":26,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238536,"action":403,"item":15,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238537,"action":403,"item":355,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238538,"action":403,"item":320,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238539,"action":403,"item":1,"type":"REGULAR","chance":0.8,"amount":700},{"id":238546,"action":404,"item":407,"type":"GUARANTEED","chance":1,"amount":1},{"id":238547,"action":404,"item":33,"type":"REGULAR","chance":0.005,"amount":2},{"id":238548,"action":404,"item":32,"type":"REGULAR","chance":0.005,"amount":2},{"id":238549,"action":404,"item":314,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238550,"action":404,"item":13,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238551,"action":404,"item":353,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238552,"action":404,"item":23,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238553,"action":404,"item":1,"type":"REGULAR","chance":0.8,"amount":425},{"id":238560,"action":405,"item":410,"type":"GUARANTEED","chance":1,"amount":1},{"id":238561,"action":405,"item":34,"type":"REGULAR","chance":0.005,"amount":2},{"id":238562,"action":405,"item":325,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238563,"action":405,"item":27,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238564,"action":405,"item":16,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238565,"action":405,"item":356,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238566,"action":405,"item":1,"type":"REGULAR","chance":0.8,"amount":900},{"id":238567,"action":405,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238574,"action":406,"item":411,"type":"GUARANTEED","chance":1,"amount":1},{"id":238575,"action":406,"item":37,"type":"REGULAR","chance":0.005,"amount":2},{"id":238576,"action":406,"item":1,"type":"REGULAR","chance":0.8,"amount":1250},{"id":238577,"action":406,"item":28,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238578,"action":406,"item":17,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238579,"action":406,"item":357,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238580,"action":406,"item":342,"type":"REGULAR","chance":0.0475,"amount":8},{"id":238581,"action":406,"item":36,"type":"REGULAR","chance":0.005,"amount":2},{"id":238588,"action":710,"item":760,"type":"REGULAR","chance":1,"amount":1},{"id":238589,"action":711,"item":766,"type":"REGULAR","chance":1,"amount":1},{"id":238590,"action":712,"item":765,"type":"REGULAR","chance":1,"amount":1},{"id":238591,"action":713,"item":763,"type":"REGULAR","chance":1,"amount":1},{"id":238592,"action":714,"item":768,"type":"REGULAR","chance":1,"amount":1},{"id":238593,"action":715,"item":761,"type":"REGULAR","chance":1,"amount":1},{"id":238594,"action":716,"item":764,"type":"REGULAR","chance":1,"amount":1},{"id":238595,"action":717,"item":767,"type":"REGULAR","chance":1,"amount":1},{"id":238596,"action":718,"item":762,"type":"REGULAR","chance":1,"amount":1},{"id":238597,"action":720,"item":710,"type":"REGULAR","chance":1,"amount":1},{"id":238598,"action":721,"item":716,"type":"REGULAR","chance":1,"amount":1},{"id":238599,"action":722,"item":715,"type":"REGULAR","chance":1,"amount":1},{"id":238600,"action":723,"item":713,"type":"REGULAR","chance":1,"amount":1},{"id":238601,"action":724,"item":718,"type":"REGULAR","chance":1,"amount":1},{"id":238602,"action":725,"item":711,"type":"REGULAR","chance":1,"amount":1},{"id":238603,"action":726,"item":714,"type":"REGULAR","chance":1,"amount":1},{"id":238604,"action":727,"item":717,"type":"REGULAR","chance":1,"amount":1},{"id":238605,"action":728,"item":712,"type":"REGULAR","chance":1,"amount":1},{"id":238606,"action":730,"item":720,"type":"REGULAR","chance":1,"amount":1},{"id":238607,"action":731,"item":726,"type":"REGULAR","chance":1,"amount":1},{"id":238608,"action":732,"item":725,"type":"REGULAR","chance":1,"amount":1},{"id":238609,"action":733,"item":723,"type":"REGULAR","chance":1,"amount":1},{"id":238610,"action":734,"item":728,"type":"REGULAR","chance":1,"amount":1},{"id":238611,"action":735,"item":721,"type":"REGULAR","chance":1,"amount":1},{"id":238612,"action":736,"item":724,"type":"REGULAR","chance":1,"amount":1},{"id":238613,"action":737,"item":727,"type":"REGULAR","chance":1,"amount":1},{"id":238614,"action":738,"item":722,"type":"REGULAR","chance":1,"amount":1},{"id":238615,"action":740,"item":740,"type":"REGULAR","chance":1,"amount":1},{"id":238616,"action":741,"item":746,"type":"REGULAR","chance":1,"amount":1},{"id":238617,"action":742,"item":745,"type":"REGULAR","chance":1,"amount":1},{"id":238618,"action":743,"item":743,"type":"REGULAR","chance":1,"amount":1},{"id":238619,"action":744,"item":748,"type":"REGULAR","chance":1,"amount":1},{"id":238620,"action":745,"item":741,"type":"REGULAR","chance":1,"amount":1},{"id":238621,"action":746,"item":744,"type":"REGULAR","chance":1,"amount":1},{"id":238622,"action":747,"item":747,"type":"REGULAR","chance":1,"amount":1},{"id":238623,"action":748,"item":742,"type":"REGULAR","chance":1,"amount":1},{"id":238624,"action":1000,"item":12,"type":"REGULAR","chance":0.95,"amount":2},{"id":238625,"action":1000,"item":302,"type":"REGULAR","chance":0.05,"amount":2},{"id":238626,"action":1000,"item":406,"type":"MONSTER","chance":1,"amount":1},{"id":238627,"action":1000,"item":1,"type":"MONSTER","chance":1,"amount":50},{"id":238630,"action":1001,"item":13,"type":"REGULAR","chance":0.95,"amount":2},{"id":238631,"action":1001,"item":303,"type":"REGULAR","chance":0.05,"amount":2},{"id":238632,"action":1001,"item":407,"type":"MONSTER","chance":1,"amount":1},{"id":238633,"action":1001,"item":1,"type":"MONSTER","chance":1,"amount":75},{"id":238636,"action":1002,"item":304,"type":"REGULAR","chance":0.05,"amount":2},{"id":238637,"action":1002,"item":14,"type":"REGULAR","chance":0.95,"amount":2},{"id":238638,"action":1002,"item":408,"type":"MONSTER","chance":1,"amount":1},{"id":238639,"action":1002,"item":1,"type":"MONSTER","chance":1,"amount":100},{"id":238642,"action":1003,"item":15,"type":"REGULAR","chance":0.95,"amount":2},{"id":238643,"action":1003,"item":323,"type":"REGULAR","chance":0.05,"amount":2},{"id":238644,"action":1003,"item":409,"type":"MONSTER","chance":1,"amount":1},{"id":238645,"action":1003,"item":1,"type":"MONSTER","chance":1,"amount":125},{"id":238648,"action":1004,"item":324,"type":"REGULAR","chance":0.05,"amount":2},{"id":238649,"action":1004,"item":16,"type":"REGULAR","chance":0.95,"amount":2},{"id":238650,"action":1004,"item":410,"type":"MONSTER","chance":1,"amount":1},{"id":238651,"action":1004,"item":1,"type":"MONSTER","chance":1,"amount":150},{"id":238654,"action":1005,"item":17,"type":"REGULAR","chance":0.95,"amount":2},{"id":238655,"action":1005,"item":347,"type":"REGULAR","chance":0.05,"amount":2},{"id":238656,"action":1005,"item":411,"type":"MONSTER","chance":1,"amount":1},{"id":238657,"action":1005,"item":1,"type":"MONSTER","chance":1,"amount":175},{"id":238660,"action":1010,"item":22,"type":"REGULAR","chance":0.99,"amount":2},{"id":238661,"action":1010,"item":32,"type":"REGULAR","chance":0.01,"amount":2},{"id":238662,"action":1010,"item":406,"type":"MONSTER","chance":1,"amount":1},{"id":238663,"action":1010,"item":1,"type":"MONSTER","chance":1,"amount":50},{"id":238666,"action":1011,"item":23,"type":"REGULAR","chance":0.99,"amount":2},{"id":238667,"action":1011,"item":33,"type":"REGULAR","chance":0.01,"amount":2},{"id":238668,"action":1011,"item":407,"type":"MONSTER","chance":1,"amount":1},{"id":238669,"action":1011,"item":1,"type":"MONSTER","chance":1,"amount":75},{"id":238672,"action":1012,"item":24,"type":"REGULAR","chance":0.99,"amount":2},{"id":238673,"action":1012,"item":35,"type":"REGULAR","chance":0.01,"amount":2},{"id":238674,"action":1012,"item":408,"type":"MONSTER","chance":1,"amount":1},{"id":238675,"action":1012,"item":1,"type":"MONSTER","chance":1,"amount":100},{"id":238678,"action":1013,"item":34,"type":"REGULAR","chance":0.01,"amount":2},{"id":238679,"action":1013,"item":26,"type":"REGULAR","chance":0.99,"amount":2},{"id":238680,"action":1013,"item":409,"type":"MONSTER","chance":1,"amount":1},{"id":238681,"action":1013,"item":1,"type":"MONSTER","chance":1,"amount":125},{"id":238684,"action":1014,"item":27,"type":"REGULAR","chance":0.99,"amount":2},{"id":238685,"action":1014,"item":36,"type":"REGULAR","chance":0.01,"amount":2},{"id":238686,"action":1014,"item":410,"type":"MONSTER","chance":1,"amount":1},{"id":238687,"action":1014,"item":1,"type":"MONSTER","chance":1,"amount":150},{"id":238690,"action":1015,"item":37,"type":"REGULAR","chance":0.01,"amount":2},{"id":238691,"action":1015,"item":28,"type":"REGULAR","chance":0.99,"amount":2},{"id":238692,"action":1015,"item":411,"type":"MONSTER","chance":1,"amount":1},{"id":238693,"action":1015,"item":1,"type":"MONSTER","chance":1,"amount":175},{"id":238696,"action":1020,"item":311,"type":"REGULAR","chance":1,"amount":2},{"id":238697,"action":1020,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238698,"action":1020,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238699,"action":1020,"item":406,"type":"MONSTER","chance":1,"amount":1},{"id":238700,"action":1020,"item":1,"type":"MONSTER","chance":1,"amount":50},{"id":238703,"action":1022,"item":317,"type":"REGULAR","chance":1,"amount":2},{"id":238704,"action":1022,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238705,"action":1022,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238706,"action":1022,"item":408,"type":"MONSTER","chance":1,"amount":1},{"id":238707,"action":1022,"item":1,"type":"MONSTER","chance":1,"amount":100},{"id":238710,"action":1023,"item":320,"type":"REGULAR","chance":1,"amount":2},{"id":238711,"action":1023,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238712,"action":1023,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238713,"action":1023,"item":409,"type":"MONSTER","chance":1,"amount":1},{"id":238714,"action":1023,"item":1,"type":"MONSTER","chance":1,"amount":125},{"id":238717,"action":1024,"item":325,"type":"REGULAR","chance":1,"amount":2},{"id":238718,"action":1024,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238719,"action":1024,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238720,"action":1024,"item":410,"type":"MONSTER","chance":1,"amount":1},{"id":238721,"action":1024,"item":1,"type":"MONSTER","chance":1,"amount":150},{"id":238724,"action":1025,"item":342,"type":"REGULAR","chance":1,"amount":2},{"id":238725,"action":1025,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238726,"action":1025,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238727,"action":1025,"item":411,"type":"MONSTER","chance":1,"amount":1},{"id":238728,"action":1025,"item":1,"type":"MONSTER","chance":1,"amount":175},{"id":238731,"action":1030,"item":352,"type":"REGULAR","chance":1,"amount":2},{"id":238732,"action":1030,"item":406,"type":"MONSTER","chance":1,"amount":1},{"id":238733,"action":1030,"item":1,"type":"MONSTER","chance":1,"amount":50},{"id":238736,"action":1031,"item":353,"type":"REGULAR","chance":1,"amount":2},{"id":238737,"action":1031,"item":407,"type":"MONSTER","chance":1,"amount":1},{"id":238738,"action":1031,"item":1,"type":"MONSTER","chance":1,"amount":75},{"id":238741,"action":1032,"item":354,"type":"REGULAR","chance":1,"amount":2},{"id":238742,"action":1032,"item":408,"type":"MONSTER","chance":1,"amount":1},{"id":238743,"action":1032,"item":1,"type":"MONSTER","chance":1,"amount":100},{"id":238746,"action":1033,"item":355,"type":"REGULAR","chance":1,"amount":2},{"id":238747,"action":1033,"item":409,"type":"MONSTER","chance":1,"amount":1},{"id":238748,"action":1033,"item":1,"type":"MONSTER","chance":1,"amount":125},{"id":238751,"action":1034,"item":356,"type":"REGULAR","chance":1,"amount":2},{"id":238752,"action":1034,"item":410,"type":"MONSTER","chance":1,"amount":1},{"id":238753,"action":1034,"item":1,"type":"MONSTER","chance":1,"amount":150},{"id":238756,"action":1035,"item":362,"type":"REGULAR","chance":1,"amount":2},{"id":238757,"action":1035,"item":406,"type":"MONSTER","chance":1,"amount":1},{"id":238758,"action":1035,"item":1,"type":"MONSTER","chance":1,"amount":50},{"id":238761,"action":1036,"item":363,"type":"REGULAR","chance":1,"amount":2},{"id":238762,"action":1036,"item":407,"type":"MONSTER","chance":1,"amount":1},{"id":238763,"action":1036,"item":1,"type":"MONSTER","chance":1,"amount":75},{"id":238766,"action":1037,"item":364,"type":"REGULAR","chance":1,"amount":2},{"id":238767,"action":1037,"item":408,"type":"MONSTER","chance":1,"amount":1},{"id":238768,"action":1037,"item":1,"type":"MONSTER","chance":1,"amount":100},{"id":238771,"action":1038,"item":365,"type":"REGULAR","chance":1,"amount":2},{"id":238772,"action":1038,"item":409,"type":"MONSTER","chance":1,"amount":1},{"id":238773,"action":1038,"item":1,"type":"MONSTER","chance":1,"amount":125},{"id":238776,"action":1039,"item":366,"type":"REGULAR","chance":1,"amount":2},{"id":238777,"action":1039,"item":410,"type":"MONSTER","chance":1,"amount":1},{"id":238778,"action":1039,"item":1,"type":"MONSTER","chance":1,"amount":150},{"id":238781,"action":1040,"item":367,"type":"REGULAR","chance":1,"amount":2},{"id":238782,"action":1040,"item":411,"type":"MONSTER","chance":1,"amount":1},{"id":238783,"action":1040,"item":1,"type":"MONSTER","chance":1,"amount":175},{"id":238786,"action":1041,"item":357,"type":"REGULAR","chance":1,"amount":2},{"id":238787,"action":1041,"item":411,"type":"MONSTER","chance":1,"amount":1},{"id":238788,"action":1041,"item":1,"type":"MONSTER","chance":1,"amount":175},{"id":238791,"action":10201,"item":314,"type":"REGULAR","chance":1,"amount":2},{"id":238792,"action":10201,"item":402,"type":"FAILED","chance":0.5,"amount":1},{"id":238793,"action":10201,"item":401,"type":"FAILED","chance":0.5,"amount":1},{"id":238794,"action":10201,"item":407,"type":"MONSTER","chance":1,"amount":1},{"id":238795,"action":10201,"item":1,"type":"MONSTER","chance":1,"amount":75}]', 'public/list/drop');
    request.listExpeditions = () => requestWithFallback('[{"id":1,"name":"Mistwood Grove","image":"items/tree-pine.png","tier":1,"power":30,"exp":957,"food":50},{"id":10,"name":"Silverfall Canyon","image":"items/tree-spruce.png","tier":2,"power":66,"exp":1231,"food":75},{"id":25,"name":"Thunderpeak Summit","image":"items/tree-birch.png","tier":3,"power":122,"exp":1504,"food":100},{"id":40,"name":"Darkwater Marsh","image":"items/tree-teak.png","tier":4,"power":262,"exp":1821,"food":112},{"id":55,"name":"Sunfire Plateau","image":"items/tree-mahogany.png","tier":5,"power":356,"exp":2160,"food":124},{"id":70,"name":"Frostfang Vale","image":"items/tree-ironbark.png","tier":6,"power":605,"exp":2515,"food":136},{"id":85,"name":"Starlight Grotto","image":"items/tree-redwood.png","tier":7,"power":743,"exp":2880,"food":148},{"id":100,"name":"Shadowmist Hollow","image":"items/tree-ancient.png","tier":8,"power":930,"exp":3297,"food":160}]', 'public/list/expedition');
    request.listExpeditionDrops = () => requestWithFallback('[{"id":2730,"expedition":1,"type":"bones","item":400,"amount":33.75},{"id":2731,"expedition":1,"type":"fish","item":305,"amount":33.75},{"id":2732,"expedition":1,"type":"flowers","item":350,"amount":33.75},{"id":2733,"expedition":1,"type":"ore","item":20,"amount":33.4125},{"id":2734,"expedition":1,"type":"ore","item":30,"amount":0.3375},{"id":2735,"expedition":1,"type":"veges","item":360,"amount":33.75},{"id":2736,"expedition":1,"type":"wood","item":10,"amount":32.0625},{"id":2737,"expedition":1,"type":"wood","item":300,"amount":1.6875},{"id":2738,"expedition":10,"type":"bones","item":405,"amount":25},{"id":2739,"expedition":10,"type":"fish","item":308,"amount":25},{"id":2740,"expedition":10,"type":"flowers","item":351,"amount":25},{"id":2741,"expedition":10,"type":"ore","item":21,"amount":24.75},{"id":2742,"expedition":10,"type":"ore","item":31,"amount":0.25},{"id":2743,"expedition":10,"type":"veges","item":361,"amount":25},{"id":2744,"expedition":10,"type":"wood","item":11,"amount":23.75},{"id":2745,"expedition":10,"type":"wood","item":301,"amount":1.25},{"id":2746,"expedition":25,"type":"bones","item":406,"amount":20.58},{"id":2747,"expedition":25,"type":"fish","item":311,"amount":20.58},{"id":2748,"expedition":25,"type":"flowers","item":352,"amount":20.58},{"id":2749,"expedition":25,"type":"ore","item":22,"amount":20.3742},{"id":2750,"expedition":25,"type":"ore","item":32,"amount":0.20579999999999998},{"id":2751,"expedition":25,"type":"veges","item":362,"amount":20.58},{"id":2752,"expedition":25,"type":"wood","item":12,"amount":19.551},{"id":2753,"expedition":25,"type":"wood","item":302,"amount":1.029},{"id":2754,"expedition":40,"type":"bones","item":407,"amount":9},{"id":2755,"expedition":40,"type":"fish","item":314,"amount":9},{"id":2756,"expedition":40,"type":"flowers","item":353,"amount":9},{"id":2757,"expedition":40,"type":"ore","item":23,"amount":8.91},{"id":2758,"expedition":40,"type":"ore","item":33,"amount":0.09},{"id":2759,"expedition":40,"type":"veges","item":363,"amount":9},{"id":2760,"expedition":40,"type":"wood","item":13,"amount":8.55},{"id":2761,"expedition":40,"type":"wood","item":303,"amount":0.45},{"id":2762,"expedition":55,"type":"bones","item":408,"amount":8.12},{"id":2763,"expedition":55,"type":"fish","item":317,"amount":8.12},{"id":2764,"expedition":55,"type":"flowers","item":354,"amount":8.12},{"id":2765,"expedition":55,"type":"ore","item":24,"amount":8.038799999999998},{"id":2766,"expedition":55,"type":"ore","item":35,"amount":0.0812},{"id":2767,"expedition":55,"type":"veges","item":364,"amount":8.12},{"id":2768,"expedition":55,"type":"wood","item":14,"amount":7.7139999999999995},{"id":2769,"expedition":55,"type":"wood","item":304,"amount":0.4059999999999999},{"id":2770,"expedition":70,"type":"bones","item":409,"amount":5},{"id":2771,"expedition":70,"type":"fish","item":320,"amount":5},{"id":2772,"expedition":70,"type":"flowers","item":355,"amount":5},{"id":2773,"expedition":70,"type":"ore","item":26,"amount":4.95},{"id":2774,"expedition":70,"type":"ore","item":34,"amount":0.05},{"id":2775,"expedition":70,"type":"veges","item":365,"amount":5},{"id":2776,"expedition":70,"type":"wood","item":15,"amount":4.75},{"id":2777,"expedition":70,"type":"wood","item":323,"amount":0.25},{"id":2778,"expedition":85,"type":"bones","item":410,"amount":4.66},{"id":2779,"expedition":85,"type":"fish","item":325,"amount":4.66},{"id":2780,"expedition":85,"type":"flowers","item":356,"amount":4.66},{"id":2781,"expedition":85,"type":"ore","item":27,"amount":4.6134},{"id":2782,"expedition":85,"type":"ore","item":36,"amount":0.0466},{"id":2783,"expedition":85,"type":"veges","item":366,"amount":4.66},{"id":2784,"expedition":85,"type":"wood","item":16,"amount":4.427},{"id":2785,"expedition":85,"type":"wood","item":324,"amount":0.233},{"id":2786,"expedition":100,"type":"bones","item":411,"amount":4.41},{"id":2787,"expedition":100,"type":"fish","item":342,"amount":4.41},{"id":2788,"expedition":100,"type":"flowers","item":357,"amount":4.41},{"id":2789,"expedition":100,"type":"ore","item":28,"amount":4.3659},{"id":2790,"expedition":100,"type":"ore","item":37,"amount":0.0441},{"id":2791,"expedition":100,"type":"veges","item":367,"amount":4.41},{"id":2792,"expedition":100,"type":"wood","item":17,"amount":4.1895},{"id":2793,"expedition":100,"type":"wood","item":347,"amount":0.2205}]', 'public/list/expeditionDrop');
    request.listIngredients = () => requestWithFallback('[{"id":303152,"action":-2010,"item":10,"amount":1},{"id":303153,"action":-2011,"item":11,"amount":1},{"id":303154,"action":-2012,"item":12,"amount":1},{"id":303155,"action":-2013,"item":13,"amount":1},{"id":303156,"action":-2014,"item":14,"amount":1},{"id":303157,"action":-2015,"item":15,"amount":1},{"id":303158,"action":-2016,"item":16,"amount":1},{"id":303159,"action":-2017,"item":17,"amount":1},{"id":303160,"action":-7300,"item":300,"amount":1},{"id":303161,"action":-7301,"item":301,"amount":1},{"id":303162,"action":-7302,"item":302,"amount":1},{"id":303163,"action":-7303,"item":303,"amount":1},{"id":303164,"action":-7304,"item":304,"amount":1},{"id":303165,"action":-7323,"item":323,"amount":1},{"id":303166,"action":-7324,"item":324,"amount":1},{"id":303167,"action":-7347,"item":347,"amount":1},{"id":303168,"action":-7400,"item":400,"amount":1},{"id":303169,"action":-7405,"item":405,"amount":1},{"id":303170,"action":-7406,"item":406,"amount":1},{"id":303171,"action":-7407,"item":407,"amount":1},{"id":303172,"action":-7408,"item":408,"amount":1},{"id":303173,"action":-7409,"item":409,"amount":1},{"id":303174,"action":-7410,"item":410,"amount":1},{"id":303175,"action":-7411,"item":411,"amount":1},{"id":303176,"action":-5030,"item":30,"amount":1},{"id":303177,"action":-5031,"item":31,"amount":1},{"id":303178,"action":-5032,"item":32,"amount":1},{"id":303179,"action":-5033,"item":33,"amount":1},{"id":303180,"action":-5034,"item":34,"amount":1},{"id":303181,"action":-5035,"item":35,"amount":1},{"id":303182,"action":-5036,"item":36,"amount":1},{"id":303183,"action":-5037,"item":37,"amount":1},{"id":303184,"action":-6305,"item":305,"amount":1},{"id":303185,"action":-6308,"item":308,"amount":1},{"id":303186,"action":-6311,"item":311,"amount":1},{"id":303187,"action":-6314,"item":314,"amount":1},{"id":303188,"action":-6317,"item":317,"amount":1},{"id":303189,"action":-6320,"item":320,"amount":1},{"id":303190,"action":-6325,"item":325,"amount":1},{"id":303191,"action":-6342,"item":342,"amount":1},{"id":303192,"action":-9100,"item":100,"amount":1},{"id":303193,"action":-9101,"item":101,"amount":1},{"id":303194,"action":-9102,"item":102,"amount":1},{"id":303195,"action":-9103,"item":103,"amount":1},{"id":303196,"action":-9104,"item":104,"amount":1},{"id":303197,"action":-9110,"item":110,"amount":1},{"id":303198,"action":-9111,"item":111,"amount":1},{"id":303199,"action":-9112,"item":112,"amount":1},{"id":303200,"action":-9113,"item":113,"amount":1},{"id":303201,"action":-9114,"item":114,"amount":1},{"id":303202,"action":-9120,"item":120,"amount":1},{"id":303203,"action":-9121,"item":121,"amount":1},{"id":303204,"action":-9122,"item":122,"amount":1},{"id":303205,"action":-9123,"item":123,"amount":1},{"id":303206,"action":-9124,"item":124,"amount":1},{"id":303207,"action":-9130,"item":130,"amount":1},{"id":303208,"action":-9131,"item":131,"amount":1},{"id":303209,"action":-9132,"item":132,"amount":1},{"id":303210,"action":-9133,"item":133,"amount":1},{"id":303211,"action":-9134,"item":134,"amount":1},{"id":303212,"action":-9140,"item":140,"amount":1},{"id":303213,"action":-9141,"item":141,"amount":1},{"id":303214,"action":-9142,"item":142,"amount":1},{"id":303215,"action":-9143,"item":143,"amount":1},{"id":303216,"action":-9144,"item":144,"amount":1},{"id":303217,"action":-9150,"item":150,"amount":1},{"id":303218,"action":-9151,"item":151,"amount":1},{"id":303219,"action":-9152,"item":152,"amount":1},{"id":303220,"action":-9153,"item":153,"amount":1},{"id":303221,"action":-9154,"item":154,"amount":1},{"id":303222,"action":-9160,"item":160,"amount":1},{"id":303223,"action":-9161,"item":161,"amount":1},{"id":303224,"action":-9162,"item":162,"amount":1},{"id":303225,"action":-9163,"item":163,"amount":1},{"id":303226,"action":-9164,"item":164,"amount":1},{"id":303227,"action":-9170,"item":170,"amount":1},{"id":303228,"action":-9171,"item":171,"amount":1},{"id":303229,"action":-9172,"item":172,"amount":1},{"id":303230,"action":-9173,"item":173,"amount":1},{"id":303231,"action":-9174,"item":174,"amount":1},{"id":303232,"action":-9200,"item":200,"amount":1},{"id":303233,"action":-9201,"item":201,"amount":1},{"id":303234,"action":-9202,"item":202,"amount":1},{"id":303235,"action":-9203,"item":203,"amount":1},{"id":303236,"action":-9204,"item":204,"amount":1},{"id":303237,"action":-9205,"item":205,"amount":1},{"id":303238,"action":-9206,"item":206,"amount":1},{"id":303239,"action":-9207,"item":207,"amount":1},{"id":303240,"action":-9208,"item":208,"amount":1},{"id":303241,"action":-9209,"item":209,"amount":1},{"id":303242,"action":-9210,"item":210,"amount":1},{"id":303243,"action":-9211,"item":211,"amount":1},{"id":303244,"action":-9212,"item":212,"amount":1},{"id":303245,"action":-9213,"item":213,"amount":1},{"id":303246,"action":-9214,"item":214,"amount":1},{"id":303247,"action":-9215,"item":215,"amount":1},{"id":303248,"action":-9216,"item":216,"amount":1},{"id":303249,"action":-9217,"item":217,"amount":1},{"id":303250,"action":-9218,"item":218,"amount":1},{"id":303251,"action":-9219,"item":219,"amount":1},{"id":303252,"action":-9220,"item":220,"amount":1},{"id":303253,"action":-9221,"item":221,"amount":1},{"id":303254,"action":-9222,"item":222,"amount":1},{"id":303255,"action":-9223,"item":223,"amount":1},{"id":303256,"action":-9224,"item":224,"amount":1},{"id":303257,"action":-9225,"item":225,"amount":1},{"id":303258,"action":-9226,"item":226,"amount":1},{"id":303259,"action":-9227,"item":227,"amount":1},{"id":303260,"action":-9228,"item":228,"amount":1},{"id":303261,"action":-9229,"item":229,"amount":1},{"id":303262,"action":-9230,"item":230,"amount":1},{"id":303263,"action":-9231,"item":231,"amount":1},{"id":303264,"action":-9232,"item":232,"amount":1},{"id":303265,"action":-9233,"item":233,"amount":1},{"id":303266,"action":-9234,"item":234,"amount":1},{"id":303267,"action":-9235,"item":235,"amount":1},{"id":303268,"action":-9236,"item":236,"amount":1},{"id":303269,"action":-9237,"item":237,"amount":1},{"id":303270,"action":-9238,"item":238,"amount":1},{"id":303271,"action":-9239,"item":239,"amount":1},{"id":303272,"action":-9240,"item":240,"amount":1},{"id":303273,"action":-9241,"item":241,"amount":1},{"id":303274,"action":-9242,"item":242,"amount":1},{"id":303275,"action":-9243,"item":243,"amount":1},{"id":303276,"action":-9244,"item":244,"amount":1},{"id":303277,"action":-9245,"item":245,"amount":1},{"id":303278,"action":-9246,"item":246,"amount":1},{"id":303279,"action":-9247,"item":247,"amount":1},{"id":303280,"action":-9248,"item":248,"amount":1},{"id":303281,"action":-9249,"item":249,"amount":1},{"id":303282,"action":-9260,"item":260,"amount":1},{"id":303283,"action":-9261,"item":261,"amount":1},{"id":303284,"action":-9262,"item":262,"amount":1},{"id":303285,"action":-9263,"item":263,"amount":1},{"id":303286,"action":-9264,"item":264,"amount":1},{"id":303287,"action":-9265,"item":265,"amount":1},{"id":303288,"action":-9266,"item":266,"amount":1},{"id":303289,"action":-9267,"item":267,"amount":1},{"id":303290,"action":-9268,"item":268,"amount":1},{"id":303291,"action":-9269,"item":269,"amount":1},{"id":303292,"action":-9270,"item":270,"amount":1},{"id":303293,"action":-9271,"item":271,"amount":1},{"id":303294,"action":-9272,"item":272,"amount":1},{"id":303295,"action":-9273,"item":273,"amount":1},{"id":303296,"action":-9274,"item":274,"amount":1},{"id":303297,"action":-9275,"item":275,"amount":1},{"id":303298,"action":-9276,"item":276,"amount":1},{"id":303299,"action":-9277,"item":277,"amount":1},{"id":303300,"action":-9278,"item":278,"amount":1},{"id":303301,"action":-9279,"item":279,"amount":1},{"id":303302,"action":-9280,"item":280,"amount":1},{"id":303303,"action":-9281,"item":281,"amount":1},{"id":303304,"action":-9282,"item":282,"amount":1},{"id":303305,"action":-9283,"item":283,"amount":1},{"id":303306,"action":-9284,"item":284,"amount":1},{"id":303307,"action":-9285,"item":285,"amount":1},{"id":303308,"action":-9286,"item":286,"amount":1},{"id":303309,"action":-9287,"item":287,"amount":1},{"id":303310,"action":-9288,"item":288,"amount":1},{"id":303311,"action":-9289,"item":289,"amount":1},{"id":303312,"action":-2306,"item":306,"amount":1},{"id":303313,"action":-2309,"item":309,"amount":1},{"id":303314,"action":-2312,"item":312,"amount":1},{"id":303315,"action":-2315,"item":315,"amount":1},{"id":303316,"action":-2318,"item":318,"amount":1},{"id":303317,"action":-2321,"item":321,"amount":1},{"id":303318,"action":-2326,"item":326,"amount":1},{"id":303319,"action":-2328,"item":328,"amount":1},{"id":303320,"action":-2329,"item":329,"amount":1},{"id":303321,"action":-2330,"item":330,"amount":1},{"id":303322,"action":-2331,"item":331,"amount":1},{"id":303323,"action":-2332,"item":332,"amount":1},{"id":303324,"action":-2333,"item":333,"amount":1},{"id":303325,"action":-2334,"item":334,"amount":1},{"id":303326,"action":-2343,"item":343,"amount":1},{"id":303327,"action":-2345,"item":345,"amount":1},{"id":303328,"action":-2900,"item":900,"amount":1},{"id":305096,"action":30,"item":20,"amount":1},{"id":305097,"action":30,"item":2,"amount":1},{"id":305098,"action":31,"item":21,"amount":1},{"id":305099,"action":31,"item":2,"amount":2},{"id":305100,"action":32,"item":22,"amount":1},{"id":305101,"action":32,"item":2,"amount":3},{"id":305102,"action":33,"item":23,"amount":1},{"id":305103,"action":33,"item":2,"amount":4},{"id":305104,"action":34,"item":24,"amount":1},{"id":305105,"action":34,"item":2,"amount":5},{"id":305106,"action":35,"item":26,"amount":1},{"id":305107,"action":35,"item":2,"amount":6},{"id":305108,"action":36,"item":27,"amount":1},{"id":305109,"action":36,"item":2,"amount":7},{"id":305110,"action":37,"item":28,"amount":1},{"id":305111,"action":37,"item":2,"amount":8},{"id":305112,"action":40,"item":403,"amount":1},{"id":305113,"action":41,"item":403,"amount":1},{"id":305114,"action":42,"item":403,"amount":1},{"id":305115,"action":43,"item":403,"amount":1},{"id":305116,"action":44,"item":403,"amount":1},{"id":305117,"action":45,"item":403,"amount":1},{"id":305118,"action":46,"item":403,"amount":1},{"id":305119,"action":47,"item":403,"amount":1},{"id":305120,"action":50,"item":305,"amount":1},{"id":305121,"action":50,"item":2,"amount":1},{"id":305122,"action":51,"item":308,"amount":1},{"id":305123,"action":51,"item":2,"amount":2},{"id":305124,"action":52,"item":311,"amount":1},{"id":305125,"action":52,"item":2,"amount":3},{"id":305126,"action":53,"item":314,"amount":1},{"id":305127,"action":53,"item":2,"amount":4},{"id":305128,"action":54,"item":317,"amount":1},{"id":305129,"action":54,"item":2,"amount":5},{"id":305130,"action":55,"item":320,"amount":1},{"id":305131,"action":55,"item":2,"amount":6},{"id":305132,"action":57,"item":325,"amount":1},{"id":305133,"action":57,"item":2,"amount":7},{"id":305134,"action":58,"item":342,"amount":1},{"id":305135,"action":58,"item":2,"amount":8},{"id":305136,"action":60,"item":305,"amount":1},{"id":305137,"action":60,"item":360,"amount":1},{"id":305138,"action":60,"item":2,"amount":1},{"id":305139,"action":61,"item":308,"amount":1},{"id":305140,"action":61,"item":361,"amount":1},{"id":305141,"action":61,"item":2,"amount":2},{"id":305142,"action":62,"item":311,"amount":1},{"id":305143,"action":62,"item":362,"amount":1},{"id":305144,"action":62,"item":2,"amount":3},{"id":305145,"action":63,"item":314,"amount":1},{"id":305146,"action":63,"item":363,"amount":1},{"id":305147,"action":63,"item":2,"amount":4},{"id":305148,"action":64,"item":317,"amount":1},{"id":305149,"action":64,"item":364,"amount":1},{"id":305150,"action":64,"item":2,"amount":5},{"id":305151,"action":65,"item":320,"amount":1},{"id":305152,"action":65,"item":365,"amount":1},{"id":305153,"action":65,"item":2,"amount":6},{"id":305154,"action":66,"item":325,"amount":1},{"id":305155,"action":66,"item":366,"amount":1},{"id":305156,"action":66,"item":2,"amount":7},{"id":305157,"action":67,"item":342,"amount":1},{"id":305158,"action":67,"item":367,"amount":1},{"id":305159,"action":67,"item":2,"amount":8},{"id":305160,"action":70,"item":400,"amount":1},{"id":305161,"action":70,"item":5,"amount":1},{"id":305162,"action":71,"item":405,"amount":1},{"id":305163,"action":71,"item":5,"amount":2},{"id":305164,"action":72,"item":406,"amount":1},{"id":305165,"action":72,"item":5,"amount":3},{"id":305166,"action":73,"item":407,"amount":1},{"id":305167,"action":73,"item":5,"amount":4},{"id":305168,"action":74,"item":408,"amount":1},{"id":305169,"action":74,"item":5,"amount":5},{"id":305170,"action":75,"item":409,"amount":1},{"id":305171,"action":75,"item":5,"amount":6},{"id":305172,"action":76,"item":410,"amount":1},{"id":305173,"action":76,"item":5,"amount":7},{"id":305174,"action":77,"item":411,"amount":1},{"id":305175,"action":77,"item":5,"amount":8},{"id":305176,"action":80,"item":4,"amount":1},{"id":305177,"action":80,"item":70,"amount":150},{"id":305178,"action":80,"item":5,"amount":10000},{"id":305179,"action":81,"item":4,"amount":1},{"id":305180,"action":81,"item":70,"amount":150},{"id":305181,"action":81,"item":5,"amount":10000},{"id":305182,"action":82,"item":4,"amount":1},{"id":305183,"action":82,"item":70,"amount":150},{"id":305184,"action":82,"item":5,"amount":10000},{"id":305185,"action":84,"item":4,"amount":1},{"id":305186,"action":84,"item":70,"amount":150},{"id":305187,"action":84,"item":5,"amount":10000},{"id":305188,"action":85,"item":4,"amount":1},{"id":305189,"action":85,"item":70,"amount":150},{"id":305190,"action":85,"item":5,"amount":10000},{"id":305191,"action":90,"item":72,"amount":3},{"id":305192,"action":90,"item":9,"amount":9},{"id":305193,"action":91,"item":73,"amount":3},{"id":305194,"action":91,"item":9,"amount":12},{"id":305195,"action":92,"item":74,"amount":3},{"id":305196,"action":92,"item":9,"amount":15},{"id":305197,"action":93,"item":75,"amount":3},{"id":305198,"action":93,"item":9,"amount":18},{"id":305199,"action":94,"item":76,"amount":3},{"id":305200,"action":94,"item":9,"amount":21},{"id":305201,"action":95,"item":77,"amount":3},{"id":305202,"action":95,"item":9,"amount":24},{"id":305203,"action":100,"item":40,"amount":1},{"id":305204,"action":101,"item":40,"amount":1},{"id":305205,"action":102,"item":40,"amount":2},{"id":305206,"action":103,"item":40,"amount":1},{"id":305207,"action":104,"item":40,"amount":1},{"id":305208,"action":110,"item":41,"amount":1},{"id":305209,"action":111,"item":41,"amount":1},{"id":305210,"action":112,"item":41,"amount":2},{"id":305211,"action":113,"item":41,"amount":1},{"id":305212,"action":114,"item":41,"amount":1},{"id":305213,"action":120,"item":42,"amount":1},{"id":305214,"action":121,"item":42,"amount":1},{"id":305215,"action":122,"item":42,"amount":2},{"id":305216,"action":123,"item":42,"amount":1},{"id":305217,"action":124,"item":42,"amount":1},{"id":305218,"action":130,"item":43,"amount":1},{"id":305219,"action":131,"item":43,"amount":1},{"id":305220,"action":132,"item":43,"amount":2},{"id":305221,"action":133,"item":43,"amount":1},{"id":305222,"action":134,"item":43,"amount":1},{"id":305223,"action":140,"item":44,"amount":2},{"id":305224,"action":141,"item":44,"amount":1},{"id":305225,"action":142,"item":44,"amount":1},{"id":305226,"action":143,"item":44,"amount":1},{"id":305227,"action":144,"item":44,"amount":1},{"id":305228,"action":150,"item":45,"amount":2},{"id":305229,"action":151,"item":45,"amount":1},{"id":305230,"action":152,"item":45,"amount":1},{"id":305231,"action":153,"item":45,"amount":1},{"id":305232,"action":154,"item":45,"amount":1},{"id":305233,"action":160,"item":46,"amount":2},{"id":305234,"action":161,"item":46,"amount":1},{"id":305235,"action":162,"item":46,"amount":1},{"id":305236,"action":163,"item":46,"amount":1},{"id":305237,"action":164,"item":46,"amount":1},{"id":305238,"action":170,"item":47,"amount":2},{"id":305239,"action":171,"item":47,"amount":1},{"id":305240,"action":172,"item":47,"amount":1},{"id":305241,"action":173,"item":47,"amount":1},{"id":305242,"action":174,"item":47,"amount":1},{"id":305243,"action":200,"item":40,"amount":1},{"id":305244,"action":201,"item":40,"amount":1},{"id":305245,"action":202,"item":40,"amount":1},{"id":305246,"action":203,"item":40,"amount":1},{"id":305247,"action":204,"item":40,"amount":1},{"id":305248,"action":205,"item":40,"amount":1},{"id":305249,"action":206,"item":40,"amount":1},{"id":305250,"action":207,"item":40,"amount":1},{"id":305251,"action":208,"item":40,"amount":1},{"id":305252,"action":209,"item":40,"amount":1},{"id":305253,"action":210,"item":41,"amount":1},{"id":305254,"action":211,"item":41,"amount":1},{"id":305255,"action":212,"item":41,"amount":1},{"id":305256,"action":213,"item":41,"amount":1},{"id":305257,"action":214,"item":41,"amount":1},{"id":305258,"action":215,"item":41,"amount":1},{"id":305259,"action":216,"item":41,"amount":1},{"id":305260,"action":217,"item":41,"amount":1},{"id":305261,"action":218,"item":41,"amount":1},{"id":305262,"action":219,"item":41,"amount":1},{"id":305263,"action":220,"item":42,"amount":1},{"id":305264,"action":221,"item":42,"amount":1},{"id":305265,"action":222,"item":42,"amount":1},{"id":305266,"action":223,"item":42,"amount":1},{"id":305267,"action":224,"item":42,"amount":1},{"id":305268,"action":225,"item":42,"amount":1},{"id":305269,"action":226,"item":42,"amount":1},{"id":305270,"action":227,"item":42,"amount":1},{"id":305271,"action":228,"item":42,"amount":1},{"id":305272,"action":229,"item":42,"amount":1},{"id":305273,"action":230,"item":43,"amount":1},{"id":305274,"action":231,"item":43,"amount":1},{"id":305275,"action":232,"item":43,"amount":1},{"id":305276,"action":233,"item":43,"amount":1},{"id":305277,"action":234,"item":43,"amount":1},{"id":305278,"action":235,"item":43,"amount":1},{"id":305279,"action":236,"item":43,"amount":1},{"id":305280,"action":237,"item":43,"amount":1},{"id":305281,"action":238,"item":43,"amount":1},{"id":305282,"action":239,"item":43,"amount":1},{"id":305283,"action":240,"item":44,"amount":1},{"id":305284,"action":241,"item":44,"amount":1},{"id":305285,"action":242,"item":44,"amount":1},{"id":305286,"action":243,"item":44,"amount":1},{"id":305287,"action":244,"item":44,"amount":1},{"id":305288,"action":245,"item":44,"amount":1},{"id":305289,"action":246,"item":44,"amount":1},{"id":305290,"action":247,"item":44,"amount":1},{"id":305291,"action":248,"item":44,"amount":1},{"id":305292,"action":249,"item":44,"amount":1},{"id":305293,"action":250,"item":45,"amount":1},{"id":305294,"action":251,"item":45,"amount":1},{"id":305295,"action":252,"item":45,"amount":1},{"id":305296,"action":253,"item":45,"amount":1},{"id":305297,"action":254,"item":45,"amount":1},{"id":305298,"action":255,"item":45,"amount":1},{"id":305299,"action":256,"item":45,"amount":1},{"id":305300,"action":257,"item":45,"amount":1},{"id":305301,"action":258,"item":45,"amount":1},{"id":305302,"action":259,"item":45,"amount":1},{"id":305303,"action":260,"item":46,"amount":1},{"id":305304,"action":261,"item":46,"amount":1},{"id":305305,"action":262,"item":46,"amount":1},{"id":305306,"action":263,"item":46,"amount":1},{"id":305307,"action":264,"item":46,"amount":1},{"id":305308,"action":265,"item":46,"amount":1},{"id":305309,"action":266,"item":46,"amount":1},{"id":305310,"action":267,"item":46,"amount":1},{"id":305311,"action":268,"item":46,"amount":1},{"id":305312,"action":269,"item":46,"amount":1},{"id":305313,"action":270,"item":47,"amount":1},{"id":305314,"action":271,"item":47,"amount":1},{"id":305315,"action":272,"item":47,"amount":1},{"id":305316,"action":273,"item":47,"amount":1},{"id":305317,"action":274,"item":47,"amount":1},{"id":305318,"action":275,"item":47,"amount":1},{"id":305319,"action":276,"item":47,"amount":1},{"id":305320,"action":277,"item":47,"amount":1},{"id":305321,"action":278,"item":47,"amount":1},{"id":305322,"action":279,"item":47,"amount":1},{"id":305323,"action":350,"item":404,"amount":1},{"id":305324,"action":350,"item":7,"amount":1},{"id":305325,"action":351,"item":404,"amount":1},{"id":305326,"action":351,"item":7,"amount":2},{"id":305327,"action":352,"item":404,"amount":1},{"id":305328,"action":352,"item":7,"amount":3},{"id":305329,"action":353,"item":404,"amount":1},{"id":305330,"action":353,"item":7,"amount":4},{"id":305331,"action":354,"item":404,"amount":1},{"id":305332,"action":354,"item":7,"amount":5},{"id":305333,"action":355,"item":404,"amount":1},{"id":305334,"action":355,"item":7,"amount":6},{"id":305335,"action":356,"item":404,"amount":1},{"id":305336,"action":356,"item":7,"amount":7},{"id":305337,"action":357,"item":404,"amount":1},{"id":305338,"action":357,"item":7,"amount":8},{"id":305339,"action":360,"item":404,"amount":1},{"id":305340,"action":360,"item":7,"amount":1},{"id":305341,"action":361,"item":404,"amount":1},{"id":305342,"action":361,"item":7,"amount":2},{"id":305343,"action":362,"item":404,"amount":1},{"id":305344,"action":362,"item":7,"amount":3},{"id":305345,"action":363,"item":404,"amount":1},{"id":305346,"action":363,"item":7,"amount":4},{"id":305347,"action":364,"item":404,"amount":1},{"id":305348,"action":364,"item":7,"amount":5},{"id":305349,"action":365,"item":404,"amount":1},{"id":305350,"action":365,"item":7,"amount":6},{"id":305351,"action":366,"item":404,"amount":1},{"id":305352,"action":366,"item":7,"amount":7},{"id":305353,"action":367,"item":404,"amount":1},{"id":305354,"action":367,"item":7,"amount":8},{"id":305355,"action":710,"item":350,"amount":1},{"id":305356,"action":710,"item":400,"amount":1},{"id":305357,"action":710,"item":703,"amount":1},{"id":305358,"action":711,"item":352,"amount":1},{"id":305359,"action":711,"item":406,"amount":1},{"id":305360,"action":711,"item":703,"amount":1},{"id":305361,"action":712,"item":353,"amount":1},{"id":305362,"action":712,"item":407,"amount":1},{"id":305363,"action":712,"item":703,"amount":1},{"id":305364,"action":713,"item":351,"amount":1},{"id":305365,"action":713,"item":405,"amount":1},{"id":305366,"action":713,"item":703,"amount":1},{"id":305367,"action":714,"item":352,"amount":1},{"id":305368,"action":714,"item":406,"amount":1},{"id":305369,"action":714,"item":703,"amount":1},{"id":305370,"action":715,"item":353,"amount":1},{"id":305371,"action":715,"item":407,"amount":1},{"id":305372,"action":715,"item":703,"amount":1},{"id":305373,"action":716,"item":351,"amount":1},{"id":305374,"action":716,"item":405,"amount":1},{"id":305375,"action":716,"item":703,"amount":1},{"id":305376,"action":717,"item":352,"amount":1},{"id":305377,"action":717,"item":406,"amount":1},{"id":305378,"action":717,"item":703,"amount":1},{"id":305379,"action":718,"item":353,"amount":1},{"id":305380,"action":718,"item":407,"amount":1},{"id":305381,"action":718,"item":703,"amount":1},{"id":305382,"action":720,"item":353,"amount":1},{"id":305383,"action":720,"item":407,"amount":1},{"id":305384,"action":720,"item":703,"amount":1},{"id":305385,"action":721,"item":354,"amount":1},{"id":305386,"action":721,"item":408,"amount":1},{"id":305387,"action":721,"item":703,"amount":1},{"id":305388,"action":722,"item":355,"amount":1},{"id":305389,"action":722,"item":409,"amount":1},{"id":305390,"action":722,"item":703,"amount":1},{"id":305391,"action":723,"item":353,"amount":1},{"id":305392,"action":723,"item":407,"amount":1},{"id":305393,"action":723,"item":703,"amount":1},{"id":305394,"action":724,"item":354,"amount":1},{"id":305395,"action":724,"item":408,"amount":1},{"id":305396,"action":724,"item":703,"amount":1},{"id":305397,"action":725,"item":355,"amount":1},{"id":305398,"action":725,"item":409,"amount":1},{"id":305399,"action":725,"item":703,"amount":1},{"id":305400,"action":726,"item":353,"amount":1},{"id":305401,"action":726,"item":407,"amount":1},{"id":305402,"action":726,"item":703,"amount":1},{"id":305403,"action":727,"item":354,"amount":1},{"id":305404,"action":727,"item":408,"amount":1},{"id":305405,"action":727,"item":703,"amount":1},{"id":305406,"action":728,"item":355,"amount":1},{"id":305407,"action":728,"item":409,"amount":1},{"id":305408,"action":728,"item":703,"amount":1},{"id":305409,"action":730,"item":355,"amount":1},{"id":305410,"action":730,"item":409,"amount":1},{"id":305411,"action":730,"item":703,"amount":1},{"id":305412,"action":731,"item":356,"amount":1},{"id":305413,"action":731,"item":410,"amount":1},{"id":305414,"action":731,"item":703,"amount":1},{"id":305415,"action":732,"item":357,"amount":1},{"id":305416,"action":732,"item":411,"amount":1},{"id":305417,"action":732,"item":703,"amount":1},{"id":305418,"action":733,"item":355,"amount":1},{"id":305419,"action":733,"item":409,"amount":1},{"id":305420,"action":733,"item":703,"amount":1},{"id":305421,"action":734,"item":356,"amount":1},{"id":305422,"action":734,"item":410,"amount":1},{"id":305423,"action":734,"item":703,"amount":1},{"id":305424,"action":735,"item":357,"amount":1},{"id":305425,"action":735,"item":411,"amount":1},{"id":305426,"action":735,"item":703,"amount":1},{"id":305427,"action":736,"item":355,"amount":1},{"id":305428,"action":736,"item":409,"amount":1},{"id":305429,"action":736,"item":703,"amount":1},{"id":305430,"action":737,"item":356,"amount":1},{"id":305431,"action":737,"item":410,"amount":1},{"id":305432,"action":737,"item":703,"amount":1},{"id":305433,"action":738,"item":357,"amount":1},{"id":305434,"action":738,"item":411,"amount":1},{"id":305435,"action":738,"item":703,"amount":1},{"id":305436,"action":740,"item":720,"amount":1},{"id":305437,"action":740,"item":710,"amount":1},{"id":305438,"action":740,"item":760,"amount":1},{"id":305439,"action":740,"item":703,"amount":1},{"id":305440,"action":741,"item":726,"amount":1},{"id":305441,"action":741,"item":716,"amount":1},{"id":305442,"action":741,"item":766,"amount":1},{"id":305443,"action":741,"item":703,"amount":1},{"id":305444,"action":742,"item":725,"amount":1},{"id":305445,"action":742,"item":715,"amount":1},{"id":305446,"action":742,"item":765,"amount":1},{"id":305447,"action":742,"item":703,"amount":1},{"id":305448,"action":743,"item":723,"amount":1},{"id":305449,"action":743,"item":713,"amount":1},{"id":305450,"action":743,"item":763,"amount":1},{"id":305451,"action":743,"item":703,"amount":1},{"id":305452,"action":744,"item":728,"amount":1},{"id":305453,"action":744,"item":718,"amount":1},{"id":305454,"action":744,"item":768,"amount":1},{"id":305455,"action":744,"item":703,"amount":1},{"id":305456,"action":745,"item":721,"amount":1},{"id":305457,"action":745,"item":711,"amount":1},{"id":305458,"action":745,"item":761,"amount":1},{"id":305459,"action":745,"item":703,"amount":1},{"id":305460,"action":746,"item":724,"amount":1},{"id":305461,"action":746,"item":714,"amount":1},{"id":305462,"action":746,"item":764,"amount":1},{"id":305463,"action":746,"item":703,"amount":1},{"id":305464,"action":747,"item":727,"amount":1},{"id":305465,"action":747,"item":717,"amount":1},{"id":305466,"action":747,"item":767,"amount":1},{"id":305467,"action":747,"item":703,"amount":1},{"id":305468,"action":748,"item":722,"amount":1},{"id":305469,"action":748,"item":712,"amount":1},{"id":305470,"action":748,"item":762,"amount":1},{"id":305471,"action":748,"item":703,"amount":1},{"id":305472,"action":1020,"item":403,"amount":1},{"id":305473,"action":1022,"item":403,"amount":1},{"id":305474,"action":1023,"item":403,"amount":1},{"id":305475,"action":1024,"item":403,"amount":1},{"id":305476,"action":1025,"item":403,"amount":1},{"id":305477,"action":1030,"item":404,"amount":1},{"id":305478,"action":1030,"item":7,"amount":3},{"id":305479,"action":1031,"item":404,"amount":1},{"id":305480,"action":1031,"item":7,"amount":4},{"id":305481,"action":1032,"item":404,"amount":1},{"id":305482,"action":1032,"item":7,"amount":5},{"id":305483,"action":1033,"item":404,"amount":1},{"id":305484,"action":1033,"item":7,"amount":6},{"id":305485,"action":1034,"item":404,"amount":1},{"id":305486,"action":1034,"item":7,"amount":7},{"id":305487,"action":1035,"item":404,"amount":1},{"id":305488,"action":1035,"item":7,"amount":3},{"id":305489,"action":1036,"item":404,"amount":1},{"id":305490,"action":1036,"item":7,"amount":4},{"id":305491,"action":1037,"item":404,"amount":1},{"id":305492,"action":1037,"item":7,"amount":5},{"id":305493,"action":1038,"item":404,"amount":1},{"id":305494,"action":1038,"item":7,"amount":6},{"id":305495,"action":1039,"item":404,"amount":1},{"id":305496,"action":1039,"item":7,"amount":7},{"id":305497,"action":1040,"item":404,"amount":1},{"id":305498,"action":1040,"item":7,"amount":8},{"id":305499,"action":1041,"item":404,"amount":1},{"id":305500,"action":1041,"item":7,"amount":8},{"id":305501,"action":10201,"item":403,"amount":1}]', 'public/list/ingredient');
    request.listItems = () => requestWithFallback('[{"item":{"id":-2,"name":"Health","image":"","skill":"Defense","tier":0,"attributes":{}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1,"name":"Coins","image":"items/coin-stack.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":2,"name":"Charcoal","image":"items/charcoal.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":3,"name":"Stardust","image":"items/stardust.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":2,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":4,"name":"Ancient Tome","image":"items/ancient-tome.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":5,"name":"Arcane Powder","image":"items/arcane-powder.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":6,"name":"Pet Snacks","image":"items/pet-snacks.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":7,"name":"Compost","image":"items/compost.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":8,"name":"Pearls","image":"items/pearl.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":9,"name":"Metal Parts","image":"items/metal-parts.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":10,"name":"Pine Log","image":"items/wood-pine.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2,"UNTRADEABLE":false}},"charcoal":1,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":11,"name":"Spruce Log","image":"items/wood-spruce.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4,"UNTRADEABLE":false}},"charcoal":2,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":12,"name":"Birch Log","image":"items/wood-birch.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":false}},"charcoal":3,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":13,"name":"Teak Log","image":"items/wood-teak.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":false}},"charcoal":4,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":14,"name":"Mahogany Log","image":"items/wood-mahogany.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":false}},"charcoal":5,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":15,"name":"Ironbark Log","image":"items/wood-ironbark.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"UNTRADEABLE":false}},"charcoal":6,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":16,"name":"Redwood Log","image":"items/wood-redwood.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":false}},"charcoal":7,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":17,"name":"Ancient Log","image":"items/wood-ancient.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false}},"charcoal":8,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":20,"name":"Copper Ore","image":"items/rock-copper.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":21,"name":"Iron Ore","image":"items/rock-iron.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":22,"name":"Silver Ore","image":"items/rock-silver.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":23,"name":"Gold Ore","image":"items/rock-gold.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":24,"name":"Cobalt Ore","image":"items/rock-cobalt.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":26,"name":"Obsidian Ore","image":"items/rock-obsidian.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":27,"name":"Astral Ore","image":"items/rock-astral.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":28,"name":"Infernal Ore","image":"items/rock-infernal.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":30,"name":"Ruby","image":"items/gem-ruby.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":100,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":50,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":31,"name":"Topaz","image":"items/gem-topaz.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":200,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":100,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":32,"name":"Emerald","image":"items/gem-emerald.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":300,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":150,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":33,"name":"Amethyst","image":"items/gem-amethyst.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":400,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":200,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":34,"name":"Diamond","image":"items/gem-diamond.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":600,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":300,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":35,"name":"Citrine","image":"items/gem-citrine.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":500,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":250,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":36,"name":"Moonstone","image":"items/gem-moonstone.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":700,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":350,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":37,"name":"Onyx","image":"items/gem-onyx.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":800,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":400,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":40,"name":"Copper Bar","image":"items/bar-copper.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":41,"name":"Iron Bar","image":"items/bar-iron.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":42,"name":"Silver Bar","image":"items/bar-silver.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":24,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":43,"name":"Gold Bar","image":"items/bar-gold.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":44,"name":"Cobalt Bar","image":"items/bar-cobalt.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":45,"name":"Obsidian Bar","image":"items/bar-obsidian.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":46,"name":"Astral Bar","image":"items/bar-astral.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":56,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":47,"name":"Infernal Bar","image":"items/bar-infernal.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":50,"name":"Mountain Gem","image":"items/relic-ruby.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":51,"name":"Forest Gem","image":"items/relic-emerald.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":52,"name":"Ocean Gem","image":"items/relic-diamond.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":53,"name":"Mountain Scroll","image":"items/relic-scroll.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":54,"name":"Forest Scroll","image":"items/relic-scroll.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":55,"name":"Ocean Scroll","image":"items/relic-scroll.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":56,"name":"Jade Piece","image":"items/idol-jade.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":57,"name":"Stone Piece","image":"items/idol-stone.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":58,"name":"Bone Piece","image":"items/idol-bone.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":60,"name":"Copper Arrow","image":"items/arrow-copper.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":61,"name":"Iron Arrow","image":"items/arrow-iron.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":62,"name":"Silver Arrow","image":"items/arrow-silver.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":63,"name":"Gold Arrow","image":"items/arrow-gold.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":64,"name":"Cobalt Arrow","image":"items/arrow-cobalt.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":65,"name":"Obsidian Arrow","image":"items/arrow-obsidian.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":66,"name":"Astral Arrow","image":"items/arrow-astral.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":67,"name":"Infernal Arrow","image":"items/arrow-infernal.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":70,"name":"Ruby Essence","image":"items/essence-ruby.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":71,"name":"Topaz Essence","image":"items/essence-topaz.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":72,"name":"Emerald Essence","image":"items/essence-emerald.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":24,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":73,"name":"Amethyst Essence","image":"items/essence-amethyst.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":74,"name":"Citrine Essence","image":"items/essence-citrine.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":75,"name":"Diamond Essence","image":"items/essence-diamond.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":76,"name":"Moonstone Essence","image":"items/essence-moonstone.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":56,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":77,"name":"Onyx Essence","image":"items/essence-onyx.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":80,"name":"Dungeon Key 25","image":"items/key-emerald.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":216,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":81,"name":"Dungeon Key 40","image":"items/key-amethyst.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":288,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":82,"name":"Dungeon Key 55","image":"items/key-citrine.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":360,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":83,"name":"Dungeon Key 70","image":"items/key-diamond.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":432,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":84,"name":"Dungeon Key 85","image":"items/key-moonstone.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":504,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":85,"name":"Dungeon Key 100","image":"items/key-onyx.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":576,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":100,"name":"Copper Helmet","image":"items/armor-copper-helmet.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"ARMOUR":2,"HEALTH":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"HEALTH":6,"ARMOUR":2},"bySkill":{}}},{"item":{"id":101,"name":"Copper Boots","image":"items/armor-copper-boots.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"ARMOUR":2,"HEALTH":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"HEALTH":6,"ARMOUR":2},"bySkill":{}}},{"item":{"id":102,"name":"Copper Body","image":"items/armor-copper-body.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":500,"SELL_PRICE":24,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":3,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":103,"name":"Copper Gloves","image":"items/armor-copper-gloves.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"ARMOUR":2,"HEALTH":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"HEALTH":6,"ARMOUR":2},"bySkill":{}}},{"item":{"id":104,"name":"Copper Shield","image":"items/armor-copper-shield.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"ARMOUR":2,"HEALTH":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"HEALTH":6,"ARMOUR":2},"bySkill":{}}},{"item":{"id":110,"name":"Iron Helmet","image":"items/armor-iron-helmet.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":111,"name":"Iron Boots","image":"items/armor-iron-boots.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":112,"name":"Iron Body","image":"items/armor-iron-body.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":113,"name":"Iron Gloves","image":"items/armor-iron-gloves.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":114,"name":"Iron Shield","image":"items/armor-iron-shield.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":120,"name":"Silver Helmet","image":"items/armor-silver-helmet.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":121,"name":"Silver Boots","image":"items/armor-silver-boots.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":122,"name":"Silver Body","image":"items/armor-silver-body.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":72,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":9,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":123,"name":"Silver Gloves","image":"items/armor-silver-gloves.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":124,"name":"Silver Shield","image":"items/armor-silver-shield.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":130,"name":"Gold Helmet","image":"items/armor-gold-helmet.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":131,"name":"Gold Boots","image":"items/armor-gold-boots.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":132,"name":"Gold Body","image":"items/armor-gold-body.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":133,"name":"Gold Gloves","image":"items/armor-gold-gloves.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":134,"name":"Gold Shield","image":"items/armor-gold-shield.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":140,"name":"Cobalt Body","image":"items/armor-cobalt-body.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":120,"UNTRADEABLE":false,"ARMOUR":20,"HEALTH":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":15,"stats":{"global":{"HEALTH":60,"ARMOUR":20},"bySkill":{}}},{"item":{"id":141,"name":"Cobalt Boots","image":"items/armor-cobalt-boots.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":142,"name":"Cobalt Helmet","image":"items/armor-cobalt-helmet.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":143,"name":"Cobalt Gloves","image":"items/armor-cobalt-gloves.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":144,"name":"Cobalt Shield","image":"items/armor-cobalt-shield.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":150,"name":"Obsidian Body","image":"items/armor-obsidian-body.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":144,"UNTRADEABLE":false,"ARMOUR":24,"HEALTH":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":18,"stats":{"global":{"HEALTH":72,"ARMOUR":24},"bySkill":{}}},{"item":{"id":151,"name":"Obsidian Boots","image":"items/armor-obsidian-boots.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":152,"name":"Obsidian Helmet","image":"items/armor-obsidian-helmet.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":153,"name":"Obsidian Gloves","image":"items/armor-obsidian-gloves.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":154,"name":"Obsidian Shield","image":"items/armor-obsidian-shield.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":160,"name":"Astral Body","image":"items/armor-astral-body.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":168,"UNTRADEABLE":false,"ARMOUR":28,"HEALTH":84}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":21,"stats":{"global":{"HEALTH":84,"ARMOUR":28},"bySkill":{}}},{"item":{"id":161,"name":"Astral Boots","image":"items/armor-astral-boots.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":162,"name":"Astral Helmet","image":"items/armor-astral-helmet.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":163,"name":"Astral Gloves","image":"items/armor-astral-gloves.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":164,"name":"Astral Shield","image":"items/armor-astral-shield.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":170,"name":"Infernal Body","image":"items/armor-infernal-body.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":192,"UNTRADEABLE":false,"ARMOUR":32,"HEALTH":96}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":24,"stats":{"global":{"HEALTH":96,"ARMOUR":32},"bySkill":{}}},{"item":{"id":171,"name":"Infernal Boots","image":"items/armor-infernal-boots.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":172,"name":"Infernal Helmet","image":"items/armor-infernal-helmet.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":173,"name":"Infernal Gloves","image":"items/armor-infernal-gloves.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":174,"name":"Infernal Shield","image":"items/armor-infernal-shield.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":200,"name":"Copper Pickaxe","image":"items/pickaxe-copper.png","skill":"Mining","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"SKILL_SPEED":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":6}}}},{"item":{"id":201,"name":"Copper Hatchet","image":"items/hatchet-copper.png","skill":"Woodcutting","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"SKILL_SPEED":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":6}}}},{"item":{"id":202,"name":"Copper Sword","image":"items/sword-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":24,"COMBAT_EXP_PERCENT":6,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"COMBAT_EXP_PERCENT":6,"DAMAGE":24,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":203,"name":"Copper Hammer","image":"items/hammer-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":24,"COMBAT_EXP_PERCENT":6,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":6,"DAMAGE":24,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":204,"name":"Copper Rod","image":"items/tool-copper-rod.png","skill":"Fishing","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"SKILL_SPEED":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":6}}}},{"item":{"id":205,"name":"Copper Spade","image":"items/tool-copper-spade.png","skill":"Farming","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"SKILL_SPEED":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":6}}}},{"item":{"id":206,"name":"Copper Bow","image":"items/bow-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":24,"COMBAT_EXP_PERCENT":6,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"COMBAT_EXP_PERCENT":6,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":24,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":207,"name":"Copper Spear","image":"items/spear-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":24,"COMBAT_EXP_PERCENT":6,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"COMBAT_EXP_PERCENT":6,"DAMAGE":24,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":208,"name":"Copper Scythe","image":"items/scythe-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":24,"COMBAT_EXP_PERCENT":6,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":6,"DAMAGE":24,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":209,"name":"Copper Boomerang","image":"items/boomerang-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":250,"SELL_PRICE":16,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":24,"COMBAT_EXP_PERCENT":6,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":2,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":6,"DAMAGE":24,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":210,"name":"Iron Pickaxe","image":"items/pickaxe-iron.png","skill":"Mining","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":12}}}},{"item":{"id":211,"name":"Iron Hatchet","image":"items/hatchet-iron.png","skill":"Woodcutting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":12}}}},{"item":{"id":212,"name":"Iron Sword","image":"items/sword-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":213,"name":"Iron Hammer","image":"items/hammer-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":214,"name":"Iron Rod","image":"items/tool-iron-rod.png","skill":"Fishing","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":12}}}},{"item":{"id":215,"name":"Iron Spade","image":"items/tool-iron-spade.png","skill":"Farming","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":12}}}},{"item":{"id":216,"name":"Iron Bow","image":"items/bow-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"COMBAT_EXP_PERCENT":12,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":217,"name":"Iron Spear","image":"items/spear-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":218,"name":"Iron Scythe","image":"items/scythe-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":219,"name":"Iron Boomerang","image":"items/boomerang-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":4,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":220,"name":"Silver Pickaxe","image":"items/pickaxe-silver.png","skill":"Mining","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":18}}}},{"item":{"id":221,"name":"Silver Hatchet","image":"items/hatchet-silver.png","skill":"Woodcutting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":18}}}},{"item":{"id":222,"name":"Silver Sword","image":"items/sword-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":223,"name":"Silver Hammer","image":"items/hammer-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":224,"name":"Silver Rod","image":"items/tool-silver-rod.png","skill":"Fishing","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":18}}}},{"item":{"id":225,"name":"Silver Spade","image":"items/tool-silver-spade.png","skill":"Farming","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":18}}}},{"item":{"id":226,"name":"Silver Bow","image":"items/bow-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"COMBAT_EXP_PERCENT":18,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":227,"name":"Silver Spear","image":"items/spear-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":228,"name":"Silver Scythe","image":"items/scythe-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":229,"name":"Silver Boomerang","image":"items/boomerang-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":48,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":6,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":230,"name":"Gold Pickaxe","image":"items/pickaxe-gold.png","skill":"Mining","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":24}}}},{"item":{"id":231,"name":"Gold Hatchet","image":"items/hatchet-gold.png","skill":"Woodcutting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":24}}}},{"item":{"id":232,"name":"Gold Sword","image":"items/sword-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":233,"name":"Gold Hammer","image":"items/hammer-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":234,"name":"Gold Rod","image":"items/tool-gold-rod.png","skill":"Fishing","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":24}}}},{"item":{"id":235,"name":"Gold Spade","image":"items/tool-gold-spade.png","skill":"Farming","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":24}}}},{"item":{"id":236,"name":"Gold Bow","image":"items/bow-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"COMBAT_EXP_PERCENT":24,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":237,"name":"Gold Spear","image":"items/spear-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":238,"name":"Gold Scythe","image":"items/scythe-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":239,"name":"Gold Boomerang","image":"items/boomerang-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":8,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":240,"name":"Cobalt Pickaxe","image":"items/pickaxe-cobalt.png","skill":"Mining","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":30}}}},{"item":{"id":241,"name":"Cobalt Hatchet","image":"items/hatchet-cobalt.png","skill":"Woodcutting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":30}}}},{"item":{"id":242,"name":"Cobalt Sword","image":"items/sword-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":243,"name":"Cobalt Hammer","image":"items/hammer-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":244,"name":"Cobalt Rod","image":"items/tool-cobalt-rod.png","skill":"Fishing","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":30}}}},{"item":{"id":245,"name":"Cobalt Spade","image":"items/tool-cobalt-spade.png","skill":"Farming","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":30}}}},{"item":{"id":246,"name":"Cobalt Bow","image":"items/bow-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"COMBAT_EXP_PERCENT":30,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":247,"name":"Cobalt Spear","image":"items/spear-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":248,"name":"Cobalt Scythe","image":"items/scythe-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":249,"name":"Cobalt Boomerang","image":"items/boomerang-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":80,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":10,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":260,"name":"Obsidian Pickaxe","image":"items/pickaxe-obsidian.png","skill":"Mining","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":36}}}},{"item":{"id":261,"name":"Obsidian Hatchet","image":"items/hatchet-obsidian.png","skill":"Woodcutting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":36}}}},{"item":{"id":262,"name":"Obsidian Sword","image":"items/sword-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":263,"name":"Obsidian Hammer","image":"items/hammer-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":264,"name":"Obsidian Rod","image":"items/tool-obsidian-rod.png","skill":"Fishing","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":36}}}},{"item":{"id":265,"name":"Obsidian Spade","image":"items/tool-obsidian-spade.png","skill":"Farming","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":36}}}},{"item":{"id":266,"name":"Obsidian Bow","image":"items/bow-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"COMBAT_EXP_PERCENT":36,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":267,"name":"Obsidian Spear","image":"items/spear-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":268,"name":"Obsidian Scythe","image":"items/scythe-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":269,"name":"Obsidian Boomerang","image":"items/boomerang-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":12,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":270,"name":"Astral Pickaxe","image":"items/pickaxe-astral.png","skill":"Mining","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":42}}}},{"item":{"id":271,"name":"Astral Hatchet","image":"items/hatchet-astral.png","skill":"Woodcutting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":42}}}},{"item":{"id":272,"name":"Astral Sword","image":"items/sword-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":273,"name":"Astral Hammer","image":"items/hammer-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":274,"name":"Astral Rod","image":"items/tool-astral-rod.png","skill":"Fishing","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":42}}}},{"item":{"id":275,"name":"Astral Spade","image":"items/tool-astral-spade.png","skill":"Farming","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":42}}}},{"item":{"id":276,"name":"Astral Bow","image":"items/bow-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"COMBAT_EXP_PERCENT":42,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":277,"name":"Astral Spear","image":"items/spear-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":278,"name":"Astral Scythe","image":"items/scythe-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":279,"name":"Astral Boomerang","image":"items/boomerang-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":112,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":14,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":280,"name":"Infernal Pickaxe","image":"items/pickaxe-infernal.png","skill":"Mining","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":48}}}},{"item":{"id":281,"name":"Infernal Hatchet","image":"items/hatchet-infernal.png","skill":"Woodcutting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":48}}}},{"item":{"id":282,"name":"Infernal Sword","image":"items/sword-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":283,"name":"Infernal Hammer","image":"items/hammer-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":284,"name":"Infernal Rod","image":"items/tool-infernal-rod.png","skill":"Fishing","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":48}}}},{"item":{"id":285,"name":"Infernal Spade","image":"items/tool-infernal-spade.png","skill":"Farming","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":48}}}},{"item":{"id":286,"name":"Infernal Bow","image":"items/bow-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"COMBAT_EXP_PERCENT":48,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":287,"name":"Infernal Spear","image":"items/spear-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":288,"name":"Infernal Scythe","image":"items/scythe-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":289,"name":"Infernal Boomerang","image":"items/boomerang-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":16,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":300,"name":"Apple","image":"items/food-apple.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4,"UNTRADEABLE":false}},"charcoal":0,"compost":20,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":301,"name":"Grapes","image":"items/food-grapes.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":false}},"charcoal":0,"compost":40,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":302,"name":"Cherry","image":"items/food-cherry.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"UNTRADEABLE":false}},"charcoal":0,"compost":60,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":303,"name":"Green Apple","image":"items/food-green-apple.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false}},"charcoal":0,"compost":80,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":304,"name":"Blackcurrant","image":"items/food-blackcurrant.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":20,"UNTRADEABLE":false}},"charcoal":0,"compost":100,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":305,"name":"Raw Shrimp","image":"items/raw-shrimp.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":1,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":306,"name":"Cooked Shrimp","image":"items/food-cooked-shrimp.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":false,"HEAL":20}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":20},"bySkill":{}}},{"item":{"id":307,"name":"Burnt Shrimp","image":"items/burnt-shrimp.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":308,"name":"Raw Cod","image":"items/raw-cod.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":2,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":309,"name":"Cooked Cod","image":"items/food-cooked-cod.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":18,"UNTRADEABLE":false,"HEAL":40}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":40},"bySkill":{}}},{"item":{"id":310,"name":"Burnt Cod","image":"items/burnt-cod.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":311,"name":"Raw Salmon","image":"items/raw-salmon.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":3,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":312,"name":"Cooked Salmon","image":"items/food-cooked-salmon.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":26,"UNTRADEABLE":false,"HEAL":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":60},"bySkill":{}}},{"item":{"id":313,"name":"Burnt Salmon","image":"items/burnt-salmon.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":314,"name":"Raw Bass","image":"items/raw-bass.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":4,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":315,"name":"Cooked Bass","image":"items/food-cooked-bass.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":34,"UNTRADEABLE":false,"HEAL":80}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":80},"bySkill":{}}},{"item":{"id":316,"name":"Burnt Bass","image":"items/burnt-bass.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":317,"name":"Raw Lobster","image":"items/raw-lobster.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":5,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":318,"name":"Cooked Lobster","image":"items/food-cooked-lobster.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":42,"UNTRADEABLE":false,"HEAL":100}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":100},"bySkill":{}}},{"item":{"id":319,"name":"Burnt Lobster","image":"items/burnt-lobster.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":320,"name":"Raw Swordfish","image":"items/raw-swordfish.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":6,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":321,"name":"Cooked Swordfish","image":"items/food-cooked-swordfish.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":50,"UNTRADEABLE":false,"HEAL":120}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":120},"bySkill":{}}},{"item":{"id":322,"name":"Burnt Swordfish","image":"items/burnt-swordfish.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":323,"name":"Raspberry","image":"items/food-raspberry.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":24,"UNTRADEABLE":false}},"charcoal":0,"compost":120,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":324,"name":"Blueberry","image":"items/food-blueberry.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28,"UNTRADEABLE":false}},"charcoal":0,"compost":140,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":325,"name":"Raw Shark","image":"items/raw-shark.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":7,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":326,"name":"Cooked Shark","image":"items/food-cooked-shark.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":58,"UNTRADEABLE":false,"HEAL":140}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":140},"bySkill":{}}},{"item":{"id":327,"name":"Burnt Shark","image":"items/burnt-shark.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":328,"name":"Shrimp Pie","image":"items/pie-shrimp.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false,"HEAL":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":30},"bySkill":{}}},{"item":{"id":329,"name":"Cod Pie","image":"items/pie-cod.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28,"UNTRADEABLE":false,"HEAL":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":60},"bySkill":{}}},{"item":{"id":330,"name":"Salmon Pie","image":"items/pie-salmon.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40,"UNTRADEABLE":false,"HEAL":90}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":90},"bySkill":{}}},{"item":{"id":331,"name":"Bass Pie","image":"items/pie-bass.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":52,"UNTRADEABLE":false,"HEAL":120}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":120},"bySkill":{}}},{"item":{"id":332,"name":"Lobster Pie","image":"items/pie-lobster.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64,"UNTRADEABLE":false,"HEAL":150}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":150},"bySkill":{}}},{"item":{"id":333,"name":"Swordfish Pie","image":"items/pie-swordfish.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":76,"UNTRADEABLE":false,"HEAL":180}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":180},"bySkill":{}}},{"item":{"id":334,"name":"Shark Pie","image":"items/pie-shark.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88,"UNTRADEABLE":false,"HEAL":210}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":210},"bySkill":{}}},{"item":{"id":335,"name":"Burnt Shrimp Pie","image":"items/pie-burnt-shrimp.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":336,"name":"Burnt Cod Pie","image":"items/pie-burnt-cod.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":337,"name":"Burnt Salmon Pie","image":"items/pie-burnt-salmon.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":20,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":338,"name":"Burnt Bass Pie","image":"items/pie-burnt-bass.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":26,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":339,"name":"Burnt Lobster Pie","image":"items/pie-burnt-lobster.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":340,"name":"Burnt Swordfish Pie","image":"items/pie-burnt-swordfish.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":38,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":341,"name":"Burnt Shark Pie","image":"items/pie-burnt-shark.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":44,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":342,"name":"Raw King Crab","image":"items/raw-king-crab.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":18,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":8,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":343,"name":"Cooked King Crab","image":"items/food-cooked-king-crab.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":66,"UNTRADEABLE":false,"HEAL":160}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":160},"bySkill":{}}},{"item":{"id":344,"name":"Burnt King Crab","image":"items/burnt-king-crab.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":345,"name":"King Crab Pie","image":"items/pie-king-crab.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":100,"UNTRADEABLE":false,"HEAL":240}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":240},"bySkill":{}}},{"item":{"id":346,"name":"Burnt King Crab Pie","image":"items/pie-burnt-king-crab.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":50,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":347,"name":"Banana","image":"items/food-banana.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"UNTRADEABLE":false}},"charcoal":0,"compost":160,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":350,"name":"Peony","image":"items/flower-peony.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":351,"name":"Tulip","image":"items/flower-tulip.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":352,"name":"Rose","image":"items/flower-rose.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":353,"name":"Daisy","image":"items/flower-daisy.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":18,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":354,"name":"Lilac","image":"items/flower-lilac.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":22,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":355,"name":"Hyacinth","image":"items/flower-hyacinth.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":26,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":356,"name":"Nemesia","image":"items/flower-nemesia.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":30,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":357,"name":"Snapdragon","image":"items/flower-snapdragon.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":34,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":360,"name":"Potato","image":"items/food-potato.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":361,"name":"Radish","image":"items/food-radish.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":362,"name":"Onion","image":"items/food-onion.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":363,"name":"Carrot","image":"items/food-carrot.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":18,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":364,"name":"Tomato","image":"items/food-tomato.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":22,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":365,"name":"Corn","image":"items/food-corn.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":26,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":366,"name":"Pumpkin","image":"items/food-pumpkin.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":30,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":367,"name":"Chilli","image":"items/food-chilli.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":34,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":400,"name":"Bone","image":"items/bone.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2,"UNTRADEABLE":false}},"charcoal":0,"compost":2,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":401,"name":"Clam","image":"items/clam.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":402,"name":"Starfish","image":"items/starfish.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":403,"name":"Fishing Bait","image":"items/fishing-bait.png","skill":"Fishing","tier":0,"attributes":{"BUY_PRICE":2,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":404,"name":"Seeds","image":"items/seeds.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":2,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":405,"name":"Fang","image":"items/fang.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4,"UNTRADEABLE":false}},"charcoal":0,"compost":4,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":406,"name":"Medium Bone","image":"items/medium-bone.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6,"UNTRADEABLE":false}},"charcoal":0,"compost":6,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":407,"name":"Medium Fang","image":"items/medium-fang.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8,"UNTRADEABLE":false}},"charcoal":0,"compost":8,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":408,"name":"Large Bone","image":"items/large-bone.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":10,"UNTRADEABLE":false}},"charcoal":0,"compost":10,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":409,"name":"Large Fang","image":"items/large-fang.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"UNTRADEABLE":false}},"charcoal":0,"compost":12,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":410,"name":"Giant Bone","image":"items/giant-bone.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":14,"UNTRADEABLE":false}},"charcoal":0,"compost":14,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":411,"name":"Giant Fang","image":"items/giant-fang.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16,"UNTRADEABLE":false}},"charcoal":0,"compost":16,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":502,"name":"Silver Dagger","image":"items/dagger-silver.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"DUNGEON_DAMAGE_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_DAMAGE_PERCENT":1},"bySkill":{}}},{"item":{"id":503,"name":"Gold Dagger","image":"items/dagger-gold.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"DUNGEON_DAMAGE_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_DAMAGE_PERCENT":2},"bySkill":{}}},{"item":{"id":504,"name":"Cobalt Dagger","image":"items/dagger-cobalt.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"DUNGEON_DAMAGE_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_DAMAGE_PERCENT":3},"bySkill":{}}},{"item":{"id":505,"name":"Obsidian Dagger","image":"items/dagger-obsidian.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"DUNGEON_DAMAGE_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_DAMAGE_PERCENT":4},"bySkill":{}}},{"item":{"id":506,"name":"Astral Dagger","image":"items/dagger-astral.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"DUNGEON_DAMAGE_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_DAMAGE_PERCENT":5},"bySkill":{}}},{"item":{"id":507,"name":"Infernal Dagger","image":"items/dagger-infernal.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"DUNGEON_DAMAGE_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_DAMAGE_PERCENT":6},"bySkill":{}}},{"item":{"id":508,"name":"Perfect Infernal Dagger","image":"items/dagger-infernal.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"DUNGEON_DAMAGE_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_DAMAGE_PERCENT":7},"bySkill":{}}},{"item":{"id":510,"name":"Petty Mountain Block Rune","image":"items/rune-petty-block.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"MOUNTAIN_BLOCK_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":1},"bySkill":{}}},{"item":{"id":511,"name":"Petty Forest Block Rune","image":"items/rune-petty-crit.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"FOREST_BLOCK_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":1},"bySkill":{}}},{"item":{"id":512,"name":"Petty Ocean Block Rune","image":"items/rune-petty-parry.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"OCEAN_BLOCK_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_BLOCK_PERCENT":1},"bySkill":{}}},{"item":{"id":513,"name":"Petty Ocean Damage Rune","image":"items/rune-petty-bleed.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"OCEAN_DAMAGE_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":1},"bySkill":{}}},{"item":{"id":514,"name":"Petty Mountain Damage Rune","image":"items/rune-petty-stun.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"MOUNTAIN_DAMAGE_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_DAMAGE_PERCENT":1},"bySkill":{}}},{"item":{"id":515,"name":"Petty Forest Damage Rune","image":"items/rune-petty-damage.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"FOREST_DAMAGE_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_DAMAGE_PERCENT":1},"bySkill":{}}},{"item":{"id":516,"name":"Petty Woodcutting Rune","image":"items/rune-petty-gathering.png","skill":"Woodcutting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Woodcutting":1}}}},{"item":{"id":517,"name":"Petty Fishing Rune","image":"items/rune-petty-gathering.png","skill":"Fishing","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Fishing":1}}}},{"item":{"id":518,"name":"Petty Mining Rune","image":"items/rune-petty-gathering.png","skill":"Mining","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":1}}}},{"item":{"id":519,"name":"Petty Farming Rune","image":"items/rune-petty-gathering.png","skill":"Farming","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Farming":1}}}},{"item":{"id":520,"name":"Lesser Mountain Block Rune","image":"items/rune-lesser-block.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"MOUNTAIN_BLOCK_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":2},"bySkill":{}}},{"item":{"id":521,"name":"Lesser Forest Block Rune","image":"items/rune-lesser-crit.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"FOREST_BLOCK_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":2},"bySkill":{}}},{"item":{"id":522,"name":"Lesser Ocean Block Rune","image":"items/rune-lesser-parry.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"OCEAN_BLOCK_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_BLOCK_PERCENT":2},"bySkill":{}}},{"item":{"id":523,"name":"Lesser Ocean Damage Rune","image":"items/rune-lesser-bleed.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"OCEAN_DAMAGE_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":2},"bySkill":{}}},{"item":{"id":524,"name":"Lesser Mountain Damage Rune","image":"items/rune-lesser-stun.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"MOUNTAIN_DAMAGE_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_DAMAGE_PERCENT":2},"bySkill":{}}},{"item":{"id":525,"name":"Lesser Forest Damage Rune","image":"items/rune-lesser-damage.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"FOREST_DAMAGE_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_DAMAGE_PERCENT":2},"bySkill":{}}},{"item":{"id":526,"name":"Lesser Woodcutting Rune","image":"items/rune-lesser-gathering.png","skill":"Woodcutting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Woodcutting":2}}}},{"item":{"id":527,"name":"Lesser Fishing Rune","image":"items/rune-lesser-gathering.png","skill":"Fishing","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Fishing":2}}}},{"item":{"id":528,"name":"Lesser Mining Rune","image":"items/rune-lesser-gathering.png","skill":"Mining","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":2}}}},{"item":{"id":529,"name":"Lesser Farming Rune","image":"items/rune-lesser-gathering.png","skill":"Farming","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Farming":2}}}},{"item":{"id":530,"name":"Common Mountain Block Rune","image":"items/rune-common-block.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"MOUNTAIN_BLOCK_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":3},"bySkill":{}}},{"item":{"id":531,"name":"Common Forest Block Rune","image":"items/rune-common-crit.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"FOREST_BLOCK_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":3},"bySkill":{}}},{"item":{"id":532,"name":"Common Ocean Block Rune","image":"items/rune-common-parry.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"OCEAN_BLOCK_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_BLOCK_PERCENT":3},"bySkill":{}}},{"item":{"id":533,"name":"Common Ocean Damage Rune","image":"items/rune-common-bleed.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"OCEAN_DAMAGE_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":3},"bySkill":{}}},{"item":{"id":534,"name":"Common Mountain Damage Rune","image":"items/rune-common-stun.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"MOUNTAIN_DAMAGE_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_DAMAGE_PERCENT":3},"bySkill":{}}},{"item":{"id":535,"name":"Common Forest Damage Rune","image":"items/rune-common-damage.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"FOREST_DAMAGE_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_DAMAGE_PERCENT":3},"bySkill":{}}},{"item":{"id":536,"name":"Common Woodcutting Rune","image":"items/rune-common-gathering.png","skill":"Woodcutting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Woodcutting":3}}}},{"item":{"id":537,"name":"Common Fishing Rune","image":"items/rune-common-gathering.png","skill":"Fishing","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Fishing":3}}}},{"item":{"id":538,"name":"Common Mining Rune","image":"items/rune-common-gathering.png","skill":"Mining","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":3}}}},{"item":{"id":539,"name":"Common Farming Rune","image":"items/rune-common-gathering.png","skill":"Farming","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Farming":3}}}},{"item":{"id":540,"name":"Uncommon Mountain Block Rune","image":"items/rune-uncommon-block.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"MOUNTAIN_BLOCK_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":4},"bySkill":{}}},{"item":{"id":541,"name":"Uncommon Forest Block Rune","image":"items/rune-uncommon-crit.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"FOREST_BLOCK_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":4},"bySkill":{}}},{"item":{"id":542,"name":"Uncommon Ocean Block Rune","image":"items/rune-uncommon-parry.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"OCEAN_BLOCK_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_BLOCK_PERCENT":4},"bySkill":{}}},{"item":{"id":543,"name":"Uncommon Ocean Damage Rune","image":"items/rune-uncommon-bleed.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"OCEAN_DAMAGE_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":4},"bySkill":{}}},{"item":{"id":544,"name":"Uncommon Mountain Damage Rune","image":"items/rune-uncommon-stun.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"MOUNTAIN_DAMAGE_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_DAMAGE_PERCENT":4},"bySkill":{}}},{"item":{"id":545,"name":"Uncommon Forest Damage Rune","image":"items/rune-uncommon-damage.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"FOREST_DAMAGE_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_DAMAGE_PERCENT":4},"bySkill":{}}},{"item":{"id":546,"name":"Uncommon Woodcutting Rune","image":"items/rune-uncommon-gathering.png","skill":"Woodcutting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Woodcutting":4}}}},{"item":{"id":547,"name":"Uncommon Fishing Rune","image":"items/rune-uncommon-gathering.png","skill":"Fishing","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Fishing":4}}}},{"item":{"id":548,"name":"Uncommon Mining Rune","image":"items/rune-uncommon-gathering.png","skill":"Mining","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":4}}}},{"item":{"id":549,"name":"Uncommon Farming Rune","image":"items/rune-uncommon-gathering.png","skill":"Farming","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Farming":4}}}},{"item":{"id":550,"name":"Greater Mountain Block Rune","image":"items/rune-greater-block.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"MOUNTAIN_BLOCK_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":5},"bySkill":{}}},{"item":{"id":551,"name":"Greater Forest Block Rune","image":"items/rune-greater-crit.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"FOREST_BLOCK_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":5},"bySkill":{}}},{"item":{"id":552,"name":"Greater Ocean Block Rune","image":"items/rune-greater-parry.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"OCEAN_BLOCK_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_BLOCK_PERCENT":5},"bySkill":{}}},{"item":{"id":553,"name":"Greater Ocean Damage Rune","image":"items/rune-greater-bleed.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"OCEAN_DAMAGE_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":5},"bySkill":{}}},{"item":{"id":554,"name":"Greater Mountain Damage Rune","image":"items/rune-greater-stun.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"MOUNTAIN_DAMAGE_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_DAMAGE_PERCENT":5},"bySkill":{}}},{"item":{"id":555,"name":"Greater Forest Damage Rune","image":"items/rune-greater-damage.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"FOREST_DAMAGE_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_DAMAGE_PERCENT":5},"bySkill":{}}},{"item":{"id":556,"name":"Greater Woodcutting Rune","image":"items/rune-greater-gathering.png","skill":"Woodcutting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Woodcutting":5}}}},{"item":{"id":557,"name":"Greater Fishing Rune","image":"items/rune-greater-gathering.png","skill":"Fishing","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Fishing":5}}}},{"item":{"id":558,"name":"Greater Mining Rune","image":"items/rune-greater-gathering.png","skill":"Mining","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":5}}}},{"item":{"id":559,"name":"Greater Farming Rune","image":"items/rune-greater-gathering.png","skill":"Farming","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Farming":5}}}},{"item":{"id":560,"name":"Petty One-handed Rune","image":"items/rune-petty-combat.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"OneHanded":1}}}},{"item":{"id":561,"name":"Petty Two-handed Rune","image":"items/rune-petty-combat.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"TwoHanded":1}}}},{"item":{"id":562,"name":"Petty Ranged Rune","image":"items/rune-petty-combat.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":1}}}},{"item":{"id":563,"name":"Petty Defense Rune","image":"items/rune-petty-combat.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Defense":1}}}},{"item":{"id":564,"name":"Lesser One-handed Rune","image":"items/rune-lesser-combat.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"OneHanded":2}}}},{"item":{"id":565,"name":"Lesser Two-handed Rune","image":"items/rune-lesser-combat.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"TwoHanded":2}}}},{"item":{"id":566,"name":"Lesser Ranged Rune","image":"items/rune-lesser-combat.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":2}}}},{"item":{"id":567,"name":"Lesser Defense Rune","image":"items/rune-lesser-combat.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Defense":2}}}},{"item":{"id":568,"name":"Common One-handed Rune","image":"items/rune-common-combat.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"OneHanded":3}}}},{"item":{"id":569,"name":"Common Two-handed Rune","image":"items/rune-common-combat.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"TwoHanded":3}}}},{"item":{"id":570,"name":"Common Ranged Rune","image":"items/rune-common-combat.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":3}}}},{"item":{"id":571,"name":"Common Defense Rune","image":"items/rune-common-combat.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Defense":3}}}},{"item":{"id":572,"name":"Uncommon One-handed Rune","image":"items/rune-uncommon-combat.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"OneHanded":4}}}},{"item":{"id":573,"name":"Uncommon Two-handed Rune","image":"items/rune-uncommon-combat.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"TwoHanded":4}}}},{"item":{"id":574,"name":"Uncommon Ranged Rune","image":"items/rune-uncommon-combat.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":4}}}},{"item":{"id":575,"name":"Uncommon Defense Rune","image":"items/rune-uncommon-combat.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Defense":4}}}},{"item":{"id":576,"name":"Greater One-handed Rune","image":"items/rune-greater-combat.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"OneHanded":5}}}},{"item":{"id":577,"name":"Greater Two-handed Rune","image":"items/rune-greater-combat.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"TwoHanded":5}}}},{"item":{"id":578,"name":"Greater Ranged Rune","image":"items/rune-greater-combat.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":5}}}},{"item":{"id":579,"name":"Greater Defense Rune","image":"items/rune-greater-combat.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Defense":5}}}},{"item":{"id":580,"name":"Grand Mountain Block Rune","image":"items/rune-grand-block.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"MOUNTAIN_BLOCK_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":6},"bySkill":{}}},{"item":{"id":581,"name":"Grand Forest Block Rune","image":"items/rune-grand-crit.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"FOREST_BLOCK_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":6},"bySkill":{}}},{"item":{"id":582,"name":"Grand Ocean Block Rune","image":"items/rune-grand-parry.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"OCEAN_BLOCK_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_BLOCK_PERCENT":6},"bySkill":{}}},{"item":{"id":583,"name":"Grand Ocean Damage Rune","image":"items/rune-grand-bleed.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"OCEAN_DAMAGE_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":6},"bySkill":{}}},{"item":{"id":584,"name":"Grand Mountain Damage Rune","image":"items/rune-grand-stun.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"MOUNTAIN_DAMAGE_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_DAMAGE_PERCENT":6},"bySkill":{}}},{"item":{"id":585,"name":"Grand Forest Damage Rune","image":"items/rune-grand-damage.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"FOREST_DAMAGE_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_DAMAGE_PERCENT":6},"bySkill":{}}},{"item":{"id":586,"name":"Grand Woodcutting Rune","image":"items/rune-grand-gathering.png","skill":"Woodcutting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Woodcutting":6}}}},{"item":{"id":587,"name":"Grand Fishing Rune","image":"items/rune-grand-gathering.png","skill":"Fishing","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Fishing":6}}}},{"item":{"id":588,"name":"Grand Mining Rune","image":"items/rune-grand-gathering.png","skill":"Mining","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":6}}}},{"item":{"id":589,"name":"Grand Farming Rune","image":"items/rune-grand-gathering.png","skill":"Farming","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Farming":6}}}},{"item":{"id":590,"name":"Grand One-handed Rune","image":"items/rune-grand-combat.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"OneHanded":6}}}},{"item":{"id":591,"name":"Grand Two-handed Rune","image":"items/rune-grand-combat.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"TwoHanded":6}}}},{"item":{"id":592,"name":"Grand Ranged Rune","image":"items/rune-grand-combat.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":6}}}},{"item":{"id":593,"name":"Grand Defense Rune","image":"items/rune-grand-combat.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Defense":6}}}},{"item":{"id":594,"name":"Supreme Mountain Block Rune","image":"items/rune-supreme-block.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"MOUNTAIN_BLOCK_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":7},"bySkill":{}}},{"item":{"id":595,"name":"Supreme Forest Block Rune","image":"items/rune-supreme-crit.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"FOREST_BLOCK_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":7},"bySkill":{}}},{"item":{"id":596,"name":"Supreme Ocean Block Rune","image":"items/rune-supreme-parry.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"OCEAN_BLOCK_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_BLOCK_PERCENT":7},"bySkill":{}}},{"item":{"id":597,"name":"Supreme Ocean Damage Rune","image":"items/rune-supreme-bleed.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"OCEAN_DAMAGE_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":7},"bySkill":{}}},{"item":{"id":598,"name":"Supreme Mountain Damage Rune","image":"items/rune-supreme-stun.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"MOUNTAIN_DAMAGE_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_DAMAGE_PERCENT":7},"bySkill":{}}},{"item":{"id":599,"name":"Supreme Forest Damage Rune","image":"items/rune-supreme-damage.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"FOREST_DAMAGE_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_DAMAGE_PERCENT":7},"bySkill":{}}},{"item":{"id":600,"name":"Supreme Woodcutting Rune","image":"items/rune-supreme-gathering.png","skill":"Woodcutting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Woodcutting":7}}}},{"item":{"id":601,"name":"Supreme Fishing Rune","image":"items/rune-supreme-gathering.png","skill":"Fishing","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Fishing":7}}}},{"item":{"id":602,"name":"Supreme Mining Rune","image":"items/rune-supreme-gathering.png","skill":"Mining","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":7}}}},{"item":{"id":603,"name":"Supreme Farming Rune","image":"items/rune-supreme-gathering.png","skill":"Farming","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Farming":7}}}},{"item":{"id":604,"name":"Supreme One-handed Rune","image":"items/rune-supreme-combat.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":192000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"OneHanded":7}}}},{"item":{"id":605,"name":"Supreme Two-handed Rune","image":"items/rune-supreme-combat.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":192000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"TwoHanded":7}}}},{"item":{"id":606,"name":"Supreme Ranged Rune","image":"items/rune-supreme-combat.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":192000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":7}}}},{"item":{"id":607,"name":"Supreme Defense Rune","image":"items/rune-supreme-combat.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":192000,"UNTRADEABLE":false,"SPECIFIC_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Defense":7}}}},{"item":{"id":610,"name":"Smelter Blueprint 1","image":"items/blueprint.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":611,"name":"Smelter Blueprint 2","image":"items/blueprint.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":612,"name":"Smelter Blueprint 3","image":"items/blueprint.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":3,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":613,"name":"Smelter Blueprint 4","image":"items/blueprint.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":4,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":614,"name":"Smelter Blueprint 5","image":"items/blueprint.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":5,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":615,"name":"Smelter Blueprint 6","image":"items/blueprint.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":6,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":620,"name":"Spit Roast Blueprint 1","image":"items/blueprint.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":621,"name":"Spit Roast Blueprint 2","image":"items/blueprint.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":622,"name":"Spit Roast Blueprint 3","image":"items/blueprint.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":3,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":623,"name":"Spit Roast Blueprint 4","image":"items/blueprint.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":4,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":624,"name":"Spit Roast Blueprint 5","image":"items/blueprint.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":5,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":625,"name":"Spit Roast Blueprint 6","image":"items/blueprint.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":6,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":630,"name":"Cauldron Blueprint 1","image":"items/blueprint.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":631,"name":"Cauldron Blueprint 2","image":"items/blueprint.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":632,"name":"Cauldron Blueprint 3","image":"items/blueprint.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":3,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":633,"name":"Cauldron Blueprint 4","image":"items/blueprint.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":4,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":634,"name":"Cauldron Blueprint 5","image":"items/blueprint.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":5,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":635,"name":"Cauldron Blueprint 6","image":"items/blueprint.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":6,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":640,"name":"Kiln Blueprint 1","image":"items/blueprint.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":641,"name":"Kiln Blueprint 2","image":"items/blueprint.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":2,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":642,"name":"Kiln Blueprint 3","image":"items/blueprint.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":3,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":643,"name":"Kiln Blueprint 4","image":"items/blueprint.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":4,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":644,"name":"Kiln Blueprint 5","image":"items/blueprint.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":5,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":645,"name":"Kiln Blueprint 6","image":"items/blueprint.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"LEVEL":6,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":703,"name":"Vial","image":"items/vial.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":2,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":710,"name":"Health Potion","image":"items/potion-health.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":42,"DURATION":180,"UNTRADEABLE":false,"HEALTH_PERCENT":6,"FOOD_EFFECT_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH_PERCENT":6,"FOOD_EFFECT_PERCENT":6},"bySkill":{}}},{"item":{"id":711,"name":"Gather XP Potion","image":"items/potion-gather-efficiency.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":62,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_EXP_CHANCE":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":12,"Woodcutting":12,"Fishing":12,"Farming":12}}}},{"item":{"id":712,"name":"Craft XP Potion","image":"items/potion-craft-efficiency.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":62,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_CRAFT_EXP_CHANCE":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":12,"Cooking":12,"Alchemy":12,"Smelting":12,"Smithing":12}}}},{"item":{"id":713,"name":"Gather Level Potion","image":"items/potion-gather-level.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":42,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Mining":3,"Woodcutting":3,"Fishing":3,"Farming":3}}}},{"item":{"id":714,"name":"Craft Level Potion","image":"items/potion-craft-level.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":42,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Enchanting":3,"Cooking":3,"Alchemy":3,"Smelting":3,"Smithing":3}}}},{"item":{"id":715,"name":"Combat XP Potion","image":"items/potion-combat-efficiency.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":62,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_EXP_CHANCE":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":12,"TwoHanded":12,"OneHanded":12,"Defense":12}}}},{"item":{"id":716,"name":"Combat Loot Potion","image":"items/potion-combat-loot.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":52,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_DROP_CHANCE":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Ranged":12,"TwoHanded":12,"OneHanded":12,"Defense":12}}}},{"item":{"id":717,"name":"Multi Craft Potion","image":"items/potion-preservation.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":52,"DURATION":180,"UNTRADEABLE":false,"MULTICRAFT_CHANCE":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MULTICRAFT_CHANCE":12},"bySkill":{}}},{"item":{"id":718,"name":"Gather Yield Potion","image":"items/potion-gather-yield.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":52,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Mining":12,"Woodcutting":12,"Fishing":12,"Farming":12}}}},{"item":{"id":720,"name":"Super Health Potion","image":"items/potion-super-health.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":62,"DURATION":180,"UNTRADEABLE":false,"HEALTH_PERCENT":9,"FOOD_EFFECT_PERCENT":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH_PERCENT":9,"FOOD_EFFECT_PERCENT":9},"bySkill":{}}},{"item":{"id":721,"name":"Super Gather XP Potion","image":"items/potion-super-gather-efficiency.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":82,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_EXP_CHANCE":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":18,"Woodcutting":18,"Fishing":18,"Farming":18}}}},{"item":{"id":722,"name":"Super Craft XP Potion","image":"items/potion-super-craft-efficiency.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":82,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_CRAFT_EXP_CHANCE":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":18,"Cooking":18,"Alchemy":18,"Smelting":18,"Smithing":18}}}},{"item":{"id":723,"name":"Super Gather Level Potion","image":"items/potion-super-gather-level.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":62,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Mining":4,"Woodcutting":4,"Fishing":4,"Farming":4}}}},{"item":{"id":724,"name":"Super Craft Level Potion","image":"items/potion-super-craft-level.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":62,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Enchanting":4,"Cooking":4,"Alchemy":4,"Smelting":4,"Smithing":4}}}},{"item":{"id":725,"name":"Super Combat XP Potion","image":"items/potion-super-combat-efficiency.png","skill":null,"tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":82,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_EXP_CHANCE":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":18,"TwoHanded":18,"OneHanded":18,"Defense":18}}}},{"item":{"id":726,"name":"Super Combat Loot Potion","image":"items/potion-super-combat-loot.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":72,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_DROP_CHANCE":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Ranged":18,"TwoHanded":18,"OneHanded":18,"Defense":18}}}},{"item":{"id":727,"name":"Super Multi Craft Potion","image":"items/potion-super-preservation.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":72,"DURATION":180,"UNTRADEABLE":false,"MULTICRAFT_CHANCE":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MULTICRAFT_CHANCE":18},"bySkill":{}}},{"item":{"id":728,"name":"Super Gather Yield Potion","image":"items/potion-super-gather-yield.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":72,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Mining":18,"Woodcutting":18,"Fishing":18,"Farming":18}}}},{"item":{"id":740,"name":"Divine Health Potion","image":"items/potion-divine-health.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":176,"DURATION":180,"UNTRADEABLE":false,"HEALTH_PERCENT":12,"FOOD_EFFECT_PERCENT":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH_PERCENT":12,"FOOD_EFFECT_PERCENT":12},"bySkill":{}}},{"item":{"id":741,"name":"Divine Gather XP Potion","image":"items/potion-divine-gather-efficiency.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":252,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_EXP_CHANCE":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":24,"Woodcutting":24,"Fishing":24,"Farming":24}}}},{"item":{"id":742,"name":"Divine Craft XP Potion","image":"items/potion-divine-craft-efficiency.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":252,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_CRAFT_EXP_CHANCE":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":24,"Cooking":24,"Alchemy":24,"Smelting":24,"Smithing":24}}}},{"item":{"id":743,"name":"Divine Gather Level Potion","image":"items/potion-divine-gather-level.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":176,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Mining":5,"Woodcutting":5,"Fishing":5,"Farming":5}}}},{"item":{"id":744,"name":"Divine Craft Level Potion","image":"items/potion-divine-craft-level.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":176,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Enchanting":5,"Cooking":5,"Alchemy":5,"Smelting":5,"Smithing":5}}}},{"item":{"id":745,"name":"Divine Combat XP Potion","image":"items/potion-divine-combat-efficiency.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":252,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_EXP_CHANCE":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":24,"TwoHanded":24,"OneHanded":24,"Defense":24}}}},{"item":{"id":746,"name":"Divine Combat Loot Potion","image":"items/potion-divine-combat-loot.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":214,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_DROP_CHANCE":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Ranged":24,"TwoHanded":24,"OneHanded":24,"Defense":24}}}},{"item":{"id":747,"name":"Divine Multi Craft Potion","image":"items/potion-divine-preservation.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":214,"DURATION":180,"UNTRADEABLE":false,"MULTICRAFT_CHANCE":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MULTICRAFT_CHANCE":24},"bySkill":{}}},{"item":{"id":748,"name":"Divine Gather Yield Potion","image":"items/potion-divine-gather-yield.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":214,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Mining":24,"Woodcutting":24,"Fishing":24,"Farming":24}}}},{"item":{"id":760,"name":"Basic Health Potion","image":"items/potion-basic-health.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":12,"DURATION":180,"UNTRADEABLE":false,"HEALTH_PERCENT":3,"FOOD_EFFECT_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH_PERCENT":3,"FOOD_EFFECT_PERCENT":3},"bySkill":{}}},{"item":{"id":761,"name":"Basic Gather XP Potion","image":"items/potion-basic-gather-efficiency.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":42,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_EXP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":6,"Woodcutting":6,"Fishing":6,"Farming":6}}}},{"item":{"id":762,"name":"Basic Craft XP Potion","image":"items/potion-basic-craft-efficiency.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":42,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_CRAFT_EXP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":6,"Cooking":6,"Alchemy":6,"Smelting":6,"Smithing":6}}}},{"item":{"id":763,"name":"Basic Gather Level Potion","image":"items/potion-basic-gather-level.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":22,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Mining":2,"Woodcutting":2,"Fishing":2,"Farming":2}}}},{"item":{"id":764,"name":"Basic Craft Level Potion","image":"items/potion-basic-craft-level.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":22,"DURATION":180,"UNTRADEABLE":false,"BONUS_LEVEL":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"BONUS_LEVEL":{"Enchanting":2,"Cooking":2,"Alchemy":2,"Smelting":2,"Smithing":2}}}},{"item":{"id":765,"name":"Basic Combat XP Potion","image":"items/potion-basic-combat-efficiency.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":42,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_EXP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":6,"TwoHanded":6,"OneHanded":6,"Defense":6}}}},{"item":{"id":766,"name":"Basic Combat Loot Potion","image":"items/potion-basic-combat-loot.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_COMBAT_DROP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Ranged":6,"TwoHanded":6,"OneHanded":6,"Defense":6}}}},{"item":{"id":767,"name":"Basic Multi Craft Potion","image":"items/potion-basic-preservation.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"DURATION":180,"UNTRADEABLE":false,"MULTICRAFT_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MULTICRAFT_CHANCE":6},"bySkill":{}}},{"item":{"id":768,"name":"Basic Gather Yield Potion","image":"items/potion-basic-gather-yield.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32,"DURATION":180,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"DOUBLE_DROP_CHANCE":{"Mining":6,"Woodcutting":6,"Fishing":6,"Farming":6}}}},{"item":{"id":800,"name":"Ruby Loot Amulet","image":"items/amulet-loot-ruby.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":1,"DOUBLE_COMBAT_DROP_CHANCE":1,"CRAFT_PRESERVATION_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"PRESERVATION_CHANCE":{"Enchanting":1,"Cooking":1,"Alchemy":1,"Smelting":1,"Smithing":1},"DOUBLE_DROP_CHANCE":{"Ranged":1,"Mining":1,"TwoHanded":1,"OneHanded":1,"Woodcutting":1,"Fishing":1,"Defense":1,"Farming":1}}}},{"item":{"id":801,"name":"Topaz Loot Amulet","image":"items/amulet-loot-topaz.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":2,"DOUBLE_COMBAT_DROP_CHANCE":2,"CRAFT_PRESERVATION_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"PRESERVATION_CHANCE":{"Enchanting":2,"Cooking":2,"Alchemy":2,"Smelting":2,"Smithing":2},"DOUBLE_DROP_CHANCE":{"Ranged":2,"Mining":2,"TwoHanded":2,"OneHanded":2,"Woodcutting":2,"Fishing":2,"Defense":2,"Farming":2}}}},{"item":{"id":802,"name":"Emerald Loot Amulet","image":"items/amulet-loot-emerald.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":3,"DOUBLE_COMBAT_DROP_CHANCE":3,"CRAFT_PRESERVATION_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"PRESERVATION_CHANCE":{"Enchanting":3,"Cooking":3,"Alchemy":3,"Smelting":3,"Smithing":3},"DOUBLE_DROP_CHANCE":{"Ranged":3,"Mining":3,"TwoHanded":3,"OneHanded":3,"Woodcutting":3,"Fishing":3,"Defense":3,"Farming":3}}}},{"item":{"id":803,"name":"Amethyst Loot Amulet","image":"items/amulet-loot-amethyst.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64000,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":4,"DOUBLE_COMBAT_DROP_CHANCE":4,"CRAFT_PRESERVATION_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"PRESERVATION_CHANCE":{"Enchanting":4,"Cooking":4,"Alchemy":4,"Smelting":4,"Smithing":4},"DOUBLE_DROP_CHANCE":{"Ranged":4,"Mining":4,"TwoHanded":4,"OneHanded":4,"Woodcutting":4,"Fishing":4,"Defense":4,"Farming":4}}}},{"item":{"id":804,"name":"Citrine Loot Amulet","image":"items/amulet-loot-citrine.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128000,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":5,"DOUBLE_COMBAT_DROP_CHANCE":5,"CRAFT_PRESERVATION_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"PRESERVATION_CHANCE":{"Enchanting":5,"Cooking":5,"Alchemy":5,"Smelting":5,"Smithing":5},"DOUBLE_DROP_CHANCE":{"Ranged":5,"Mining":5,"TwoHanded":5,"OneHanded":5,"Woodcutting":5,"Fishing":5,"Defense":5,"Farming":5}}}},{"item":{"id":805,"name":"Diamond Loot Amulet","image":"items/amulet-loot-diamond.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":256000,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":6,"DOUBLE_COMBAT_DROP_CHANCE":6,"CRAFT_PRESERVATION_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"PRESERVATION_CHANCE":{"Enchanting":6,"Cooking":6,"Alchemy":6,"Smelting":6,"Smithing":6},"DOUBLE_DROP_CHANCE":{"Ranged":6,"Mining":6,"TwoHanded":6,"OneHanded":6,"Woodcutting":6,"Fishing":6,"Defense":6,"Farming":6}}}},{"item":{"id":806,"name":"Moonstone Loot Amulet","image":"items/amulet-loot-moonstone.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":768000,"UNTRADEABLE":false,"DOUBLE_GATHER_DROP_CHANCE":7,"DOUBLE_COMBAT_DROP_CHANCE":7,"CRAFT_PRESERVATION_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"PRESERVATION_CHANCE":{"Enchanting":7,"Cooking":7,"Alchemy":7,"Smelting":7,"Smithing":7},"DOUBLE_DROP_CHANCE":{"Ranged":7,"Mining":7,"TwoHanded":7,"OneHanded":7,"Woodcutting":7,"Fishing":7,"Defense":7,"Farming":7}}}},{"item":{"id":810,"name":"Ruby Efficiency Ring","image":"items/ring-efficiency-ruby.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"ALL_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"EFFICIENCY_CHANCE":1},"bySkill":{}}},{"item":{"id":811,"name":"Topaz Efficiency Ring","image":"items/ring-efficiency-topaz.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"ALL_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"EFFICIENCY_CHANCE":2},"bySkill":{}}},{"item":{"id":812,"name":"Emerald Efficiency Ring","image":"items/ring-efficiency-emerald.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"ALL_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"EFFICIENCY_CHANCE":3},"bySkill":{}}},{"item":{"id":813,"name":"Amethyst Efficiency Ring","image":"items/ring-efficiency-amethyst.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64000,"UNTRADEABLE":false,"ALL_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"EFFICIENCY_CHANCE":4},"bySkill":{}}},{"item":{"id":814,"name":"Citrine Efficiency Ring","image":"items/ring-efficiency-citrine.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":128000,"UNTRADEABLE":false,"ALL_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"EFFICIENCY_CHANCE":5},"bySkill":{}}},{"item":{"id":815,"name":"Diamond Efficiency Ring","image":"items/ring-efficiency-diamond.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":256000,"UNTRADEABLE":false,"ALL_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"EFFICIENCY_CHANCE":6},"bySkill":{}}},{"item":{"id":816,"name":"Moonstone Efficiency Ring","image":"items/ring-efficiency-moonstone.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":768000,"UNTRADEABLE":false,"ALL_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"EFFICIENCY_CHANCE":7},"bySkill":{}}},{"item":{"id":820,"name":"Ruby Wisdom Bracelet","image":"items/bracelet-wisdom-ruby.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"ALL_SKILL_EXP_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DOUBLE_EXP_CHANCE":1},"bySkill":{}}},{"item":{"id":821,"name":"Topaz Wisdom Bracelet","image":"items/bracelet-wisdom-topaz.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"ALL_SKILL_EXP_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DOUBLE_EXP_CHANCE":2},"bySkill":{}}},{"item":{"id":822,"name":"Emerald Wisdom Bracelet","image":"items/bracelet-wisdom-emerald.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"ALL_SKILL_EXP_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DOUBLE_EXP_CHANCE":3},"bySkill":{}}},{"item":{"id":823,"name":"Amethyst Wisdom Bracelet","image":"items/bracelet-wisdom-amethyst.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"ALL_SKILL_EXP_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DOUBLE_EXP_CHANCE":4},"bySkill":{}}},{"item":{"id":824,"name":"Citrine Wisdom Bracelet","image":"items/bracelet-wisdom-citrine.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"ALL_SKILL_EXP_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DOUBLE_EXP_CHANCE":5},"bySkill":{}}},{"item":{"id":825,"name":"Diamond Wisdom Bracelet","image":"items/bracelet-wisdom-diamond.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":64000,"UNTRADEABLE":false,"ALL_SKILL_EXP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DOUBLE_EXP_CHANCE":6},"bySkill":{}}},{"item":{"id":826,"name":"Moonstone Wisdom Bracelet","image":"items/bracelet-wisdom-moonstone.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":192000,"UNTRADEABLE":false,"ALL_SKILL_EXP_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DOUBLE_EXP_CHANCE":7},"bySkill":{}}},{"item":{"id":900,"name":"Celebration Cake","image":"items/event-celebration-cake.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"HEAL":1000}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEAL":1000},"bySkill":{}}},{"item":{"id":1000,"name":"Dungeon Map 25","image":"items/map-dungeon.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":100000,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1001,"name":"Dungeon Map 40","image":"items/map-dungeon.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":200000,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1002,"name":"Dungeon Map 55","image":"items/map-dungeon.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":300000,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1003,"name":"Dungeon Map 70","image":"items/map-dungeon.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":400000,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1004,"name":"Dungeon Map 85","image":"items/map-dungeon.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":500000,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1005,"name":"Dungeon Map 100","image":"items/map-dungeon.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":600000,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1010,"name":"Iron Chest","image":"items/chest-iron.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1011,"name":"Enhanced Iron Chest","image":"items/chest-iron.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1012,"name":"Silver Chest","image":"items/chest-silver.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1013,"name":"Enhanced Silver Chest","image":"items/chest-silver.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1014,"name":"Gold Chest","image":"items/chest-gold.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1015,"name":"Enhanced Gold Chest","image":"items/chest-gold.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1020,"name":"Challenge Scroll","image":"items/challenge-scroll.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1030,"name":"Small Egg","image":"items/egg-small.png","skill":"Taming","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":100,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1031,"name":"Medium Egg","image":"items/egg-medium.png","skill":"Taming","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":200,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1032,"name":"Large Egg","image":"items/egg-large.png","skill":"Taming","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":300,"UNTRADEABLE":false}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1050,"name":"Silver Telescope","image":"items/telescope-silver.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"DUNGEON_BLOCK_PERCENT":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_BLOCK_PERCENT":1},"bySkill":{}}},{"item":{"id":1052,"name":"Gold Telescope","image":"items/telescope-gold.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"DUNGEON_BLOCK_PERCENT":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_BLOCK_PERCENT":2},"bySkill":{}}},{"item":{"id":1053,"name":"Cobalt Telescope","image":"items/telescope-cobalt.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"DUNGEON_BLOCK_PERCENT":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_BLOCK_PERCENT":3},"bySkill":{}}},{"item":{"id":1054,"name":"Obsidian Telescope","image":"items/telescope-obsidian.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"DUNGEON_BLOCK_PERCENT":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_BLOCK_PERCENT":4},"bySkill":{}}},{"item":{"id":1055,"name":"Astral Telescope","image":"items/telescope-astral.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"DUNGEON_BLOCK_PERCENT":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_BLOCK_PERCENT":5},"bySkill":{}}},{"item":{"id":1056,"name":"Infernal Telescope","image":"items/telescope-infernal.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"DUNGEON_BLOCK_PERCENT":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_BLOCK_PERCENT":6},"bySkill":{}}},{"item":{"id":1057,"name":"Perfect Infernal Telescope","image":"items/telescope-infernal.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"DUNGEON_BLOCK_PERCENT":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DUNGEON_BLOCK_PERCENT":7},"bySkill":{}}},{"item":{"id":1060,"name":"Silver Lantern","image":"items/lantern-silver.png","skill":null,"tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1000,"UNTRADEABLE":false,"KEY_PRESERVATION_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"KEY_PRESERVATION_CHANCE":1},"bySkill":{}}},{"item":{"id":1061,"name":"Gold Lantern","image":"items/lantern-gold.png","skill":null,"tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2000,"UNTRADEABLE":false,"KEY_PRESERVATION_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"KEY_PRESERVATION_CHANCE":2},"bySkill":{}}},{"item":{"id":1062,"name":"Cobalt Lantern","image":"items/lantern-cobalt.png","skill":null,"tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4000,"UNTRADEABLE":false,"KEY_PRESERVATION_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"KEY_PRESERVATION_CHANCE":3},"bySkill":{}}},{"item":{"id":1063,"name":"Obsidian Lantern","image":"items/lantern-obsidian.png","skill":null,"tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8000,"UNTRADEABLE":false,"KEY_PRESERVATION_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"KEY_PRESERVATION_CHANCE":4},"bySkill":{}}},{"item":{"id":1064,"name":"Astral Lantern","image":"items/lantern-astral.png","skill":null,"tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16000,"UNTRADEABLE":false,"KEY_PRESERVATION_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"KEY_PRESERVATION_CHANCE":5},"bySkill":{}}},{"item":{"id":1065,"name":"Infernal Lantern","image":"items/lantern-infernal.png","skill":null,"tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":32000,"UNTRADEABLE":false,"KEY_PRESERVATION_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"KEY_PRESERVATION_CHANCE":6},"bySkill":{}}},{"item":{"id":1066,"name":"Perfect Infernal Lantern","image":"items/lantern-infernal.png","skill":null,"tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":96000,"UNTRADEABLE":false,"KEY_PRESERVATION_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"KEY_PRESERVATION_CHANCE":7},"bySkill":{}}},{"item":{"id":1100,"name":"Savage Looting Tome 1","image":"items/tome-one-savage-looting.png","skill":"Enchanting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":2,"DOUBLE_COMBAT_EXP_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":2},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":1,"TwoHanded":1,"OneHanded":1,"Defense":1}}}},{"item":{"id":1101,"name":"Bountiful Harvest Tome 1","image":"items/tome-one-bountiful-harvest.png","skill":"Enchanting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":2,"DOUBLE_GATHER_EXP_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":2},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":1,"Woodcutting":1,"Fishing":1,"Farming":1}}}},{"item":{"id":1102,"name":"Opulent Crafting Tome 1","image":"items/tome-one-opulent-crafting.png","skill":"Enchanting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":2,"DOUBLE_CRAFT_EXP_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":2},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":1,"Cooking":1,"Alchemy":1,"Smelting":1,"Smithing":1}}}},{"item":{"id":1104,"name":"Insatiable Power Tome 1","image":"items/tome-one-insatiable-power.png","skill":"Enchanting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":1,"ALL_SKILL_EFFICIENCY_CHANCE":1}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":1,"EFFICIENCY_CHANCE":1},"bySkill":{}}},{"item":{"id":1105,"name":"Potent Concoction Tome 1","image":"items/tome-one-potent-concoction.png","skill":"Enchanting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":6,"DECREASED_POTION_DURATION":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":6,"INCREASED_POTION_EFFECT":6},"bySkill":{}}},{"item":{"id":1110,"name":"Savage Looting Tome 2","image":"items/tome-two-savage-looting.png","skill":"Enchanting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":4,"DOUBLE_COMBAT_EXP_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":4},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":2,"TwoHanded":2,"OneHanded":2,"Defense":2}}}},{"item":{"id":1111,"name":"Bountiful Harvest Tome 2","image":"items/tome-two-bountiful-harvest.png","skill":"Enchanting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":4,"DOUBLE_GATHER_EXP_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":4},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":2,"Woodcutting":2,"Fishing":2,"Farming":2}}}},{"item":{"id":1112,"name":"Opulent Crafting Tome 2","image":"items/tome-two-opulent-crafting.png","skill":"Enchanting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":4,"DOUBLE_CRAFT_EXP_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":4},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":2,"Cooking":2,"Alchemy":2,"Smelting":2,"Smithing":2}}}},{"item":{"id":1114,"name":"Insatiable Power Tome 2","image":"items/tome-two-insatiable-power.png","skill":"Enchanting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":2,"ALL_SKILL_EFFICIENCY_CHANCE":2}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":2,"EFFICIENCY_CHANCE":2},"bySkill":{}}},{"item":{"id":1115,"name":"Potent Concoction Tome 2","image":"items/tome-two-potent-concoction.png","skill":"Enchanting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":12,"DECREASED_POTION_DURATION":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":12,"INCREASED_POTION_EFFECT":12},"bySkill":{}}},{"item":{"id":1120,"name":"Savage Looting Tome 3","image":"items/tome-three-savage-looting.png","skill":"Enchanting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":6,"DOUBLE_COMBAT_EXP_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":6},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":3,"TwoHanded":3,"OneHanded":3,"Defense":3}}}},{"item":{"id":1121,"name":"Bountiful Harvest Tome 3","image":"items/tome-three-bountiful-harvest.png","skill":"Enchanting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":6,"DOUBLE_GATHER_EXP_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":6},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":3,"Woodcutting":3,"Fishing":3,"Farming":3}}}},{"item":{"id":1122,"name":"Opulent Crafting Tome 3","image":"items/tome-three-opulent-crafting.png","skill":"Enchanting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":6,"DOUBLE_CRAFT_EXP_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":6},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":3,"Cooking":3,"Alchemy":3,"Smelting":3,"Smithing":3}}}},{"item":{"id":1124,"name":"Insatiable Power Tome 3","image":"items/tome-three-insatiable-power.png","skill":"Enchanting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":3,"ALL_SKILL_EFFICIENCY_CHANCE":3}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":3,"EFFICIENCY_CHANCE":3},"bySkill":{}}},{"item":{"id":1125,"name":"Potent Concoction Tome 3","image":"items/tome-three-potent-concoction.png","skill":"Enchanting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":18,"DECREASED_POTION_DURATION":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":18,"INCREASED_POTION_EFFECT":18},"bySkill":{}}},{"item":{"id":1130,"name":"Savage Looting Tome 4","image":"items/tome-four-savage-looting.png","skill":"Enchanting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":8,"DOUBLE_COMBAT_EXP_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":8},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":4,"TwoHanded":4,"OneHanded":4,"Defense":4}}}},{"item":{"id":1131,"name":"Bountiful Harvest Tome 4","image":"items/tome-four-bountiful-harvest.png","skill":"Enchanting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":8,"DOUBLE_GATHER_EXP_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":8},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":4,"Woodcutting":4,"Fishing":4,"Farming":4}}}},{"item":{"id":1132,"name":"Opulent Crafting Tome 4","image":"items/tome-four-opulent-crafting.png","skill":"Enchanting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":8,"DOUBLE_CRAFT_EXP_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":8},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":4,"Cooking":4,"Alchemy":4,"Smelting":4,"Smithing":4}}}},{"item":{"id":1134,"name":"Insatiable Power Tome 4","image":"items/tome-four-insatiable-power.png","skill":"Enchanting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":4,"ALL_SKILL_EFFICIENCY_CHANCE":4}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":4,"EFFICIENCY_CHANCE":4},"bySkill":{}}},{"item":{"id":1135,"name":"Potent Concoction Tome 4","image":"items/tome-four-potent-concoction.png","skill":"Enchanting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":24,"DECREASED_POTION_DURATION":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":24,"INCREASED_POTION_EFFECT":24},"bySkill":{}}},{"item":{"id":1140,"name":"Savage Looting Tome 5","image":"items/tome-five-savage-looting.png","skill":"Enchanting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":10,"DOUBLE_COMBAT_EXP_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":10},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":5,"TwoHanded":5,"OneHanded":5,"Defense":5}}}},{"item":{"id":1141,"name":"Bountiful Harvest Tome 5","image":"items/tome-five-bountiful-harvest.png","skill":"Enchanting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":10,"DOUBLE_GATHER_EXP_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":10},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":5,"Woodcutting":5,"Fishing":5,"Farming":5}}}},{"item":{"id":1142,"name":"Opulent Crafting Tome 5","image":"items/tome-five-opulent-crafting.png","skill":"Enchanting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":10,"DOUBLE_CRAFT_EXP_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":10},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":5,"Cooking":5,"Alchemy":5,"Smelting":5,"Smithing":5}}}},{"item":{"id":1144,"name":"Insatiable Power Tome 5","image":"items/tome-five-insatiable-power.png","skill":"Enchanting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":5,"ALL_SKILL_EFFICIENCY_CHANCE":5}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":5,"EFFICIENCY_CHANCE":5},"bySkill":{}}},{"item":{"id":1145,"name":"Potent Concoction Tome 5","image":"items/tome-five-potent-concoction.png","skill":"Enchanting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":30,"DECREASED_POTION_DURATION":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":30,"INCREASED_POTION_EFFECT":30},"bySkill":{}}},{"item":{"id":1150,"name":"Savage Looting Tome 6","image":"items/tome-six-savage-looting.png","skill":"Enchanting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":12,"DOUBLE_COMBAT_EXP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":12},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":6,"TwoHanded":6,"OneHanded":6,"Defense":6}}}},{"item":{"id":1151,"name":"Bountiful Harvest Tome 6","image":"items/tome-six-bountiful-harvest.png","skill":"Enchanting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":12,"DOUBLE_GATHER_EXP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":12},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":6,"Woodcutting":6,"Fishing":6,"Farming":6}}}},{"item":{"id":1152,"name":"Opulent Crafting Tome 6","image":"items/tome-six-opulent-crafting.png","skill":"Enchanting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":12,"DOUBLE_CRAFT_EXP_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":12},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":6,"Cooking":6,"Alchemy":6,"Smelting":6,"Smithing":6}}}},{"item":{"id":1154,"name":"Insatiable Power Tome 6","image":"items/tome-six-insatiable-power.png","skill":"Enchanting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":6,"ALL_SKILL_EFFICIENCY_CHANCE":6}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":6,"EFFICIENCY_CHANCE":6},"bySkill":{}}},{"item":{"id":1155,"name":"Potent Concoction Tome 6","image":"items/tome-six-potent-concoction.png","skill":"Enchanting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":36,"DECREASED_POTION_DURATION":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":36,"INCREASED_POTION_EFFECT":36},"bySkill":{}}},{"item":{"id":1160,"name":"Savage Looting Tome 7","image":"items/tome-seven-savage-looting.png","skill":"Enchanting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":14,"DOUBLE_COMBAT_EXP_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":14},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":7,"TwoHanded":7,"OneHanded":7,"Defense":7}}}},{"item":{"id":1161,"name":"Bountiful Harvest Tome 7","image":"items/tome-seven-bountiful-harvest.png","skill":"Enchanting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":14,"DOUBLE_GATHER_EXP_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":14},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":7,"Woodcutting":7,"Fishing":7,"Farming":7}}}},{"item":{"id":1162,"name":"Opulent Crafting Tome 7","image":"items/tome-seven-opulent-crafting.png","skill":"Enchanting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":14,"DOUBLE_CRAFT_EXP_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":14},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":7,"Cooking":7,"Alchemy":7,"Smelting":7,"Smithing":7}}}},{"item":{"id":1164,"name":"Insatiable Power Tome 7","image":"items/tome-seven-insatiable-power.png","skill":"Enchanting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":7,"ALL_SKILL_EFFICIENCY_CHANCE":7}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":7,"EFFICIENCY_CHANCE":7},"bySkill":{}}},{"item":{"id":1165,"name":"Potent Concoction Tome 7","image":"items/tome-seven-potent-concoction.png","skill":"Enchanting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":42,"DECREASED_POTION_DURATION":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":42,"INCREASED_POTION_EFFECT":42},"bySkill":{}}},{"item":{"id":1170,"name":"Savage Looting Tome 8","image":"items/tome-eight-savage-looting.png","skill":"Enchanting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"CARVE_CHANCE":16,"DOUBLE_COMBAT_EXP_CHANCE":8}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"CARVE_CHANCE":16},"bySkill":{"DOUBLE_EXP_CHANCE":{"Ranged":8,"TwoHanded":8,"OneHanded":8,"Defense":8}}}},{"item":{"id":1171,"name":"Bountiful Harvest Tome 8","image":"items/tome-eight-bountiful-harvest.png","skill":"Enchanting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"TIER_VARIETY_CHANCE":16,"DOUBLE_GATHER_EXP_CHANCE":8}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"TIER_VARIETY_CHANCE":16},"bySkill":{"DOUBLE_EXP_CHANCE":{"Mining":8,"Woodcutting":8,"Fishing":8,"Farming":8}}}},{"item":{"id":1172,"name":"Opulent Crafting Tome 8","image":"items/tome-eight-opulent-crafting.png","skill":"Enchanting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"OPULENT_CHANCE":16,"DOUBLE_CRAFT_EXP_CHANCE":8}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OPULENT_CHANCE":16},"bySkill":{"DOUBLE_EXP_CHANCE":{"Enchanting":8,"Cooking":8,"Alchemy":8,"Smelting":8,"Smithing":8}}}},{"item":{"id":1174,"name":"Insatiable Power Tome 8","image":"items/tome-eight-insatiable-power.png","skill":"Enchanting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"PASSIVE_FOOD_CONSUMPTION":8,"ALL_SKILL_EFFICIENCY_CHANCE":8}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"PASSIVE_FOOD_CONSUMPTION":8,"EFFICIENCY_CHANCE":8},"bySkill":{}}},{"item":{"id":1175,"name":"Potent Concoction Tome 8","image":"items/tome-eight-potent-concoction.png","skill":"Enchanting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true,"INCREASED_POTION_EFFECT":48,"DECREASED_POTION_DURATION":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"DECREASED_POTION_DURATION":48,"INCREASED_POTION_EFFECT":48},"bySkill":{}}},{"item":{"id":1500,"name":"Taming Mark","image":"marks/taming.png","skill":"Taming","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1501,"name":"Woodcutting Mark","image":"marks/woodcutting.png","skill":"Woodcutting","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1502,"name":"Mining Mark","image":"marks/mining.png","skill":"Mining","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1503,"name":"Smelting Mark","image":"marks/smelting.png","skill":"Smelting","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1504,"name":"Smithing Mark","image":"marks/smithing.png","skill":"Smithing","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1505,"name":"Enchanting Mark","image":"marks/enchanting.png","skill":"Enchanting","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1506,"name":"Farming Mark","image":"marks/farming.png","skill":"Farming","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1507,"name":"Alchemy Mark","image":"marks/alchemy.png","skill":"Alchemy","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1508,"name":"Fishing Mark","image":"marks/fishing.png","skill":"Fishing","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1509,"name":"Cooking Mark","image":"marks/cooking.png","skill":"Cooking","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1510,"name":"One-Handed Mark","image":"marks/one-handed.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1511,"name":"Two-Handed Mark","image":"marks/two-handed.png","skill":null,"tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1512,"name":"Ranged Mark","image":"marks/ranged.png","skill":"Ranged","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":1513,"name":"Defense Mark","image":"marks/defense.png","skill":"Defense","tier":0,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1,"UNTRADEABLE":true}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{}}},{"item":{"id":2000,"name":"Superior Copper Helmet","image":"items/armor-copper-helmet.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"ARMOUR":3,"HEALTH":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":9,"ARMOUR":3},"bySkill":{}}},{"item":{"id":2001,"name":"Superior Copper Boots","image":"items/armor-copper-boots.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"ARMOUR":3,"HEALTH":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":9,"ARMOUR":3},"bySkill":{}}},{"item":{"id":2002,"name":"Superior Copper Body","image":"items/armor-copper-body.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2400,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":2003,"name":"Superior Copper Gloves","image":"items/armor-copper-gloves.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"ARMOUR":3,"HEALTH":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":9,"ARMOUR":3},"bySkill":{}}},{"item":{"id":2004,"name":"Superior Copper Shield","image":"items/armor-copper-shield.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"ARMOUR":3,"HEALTH":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":9,"ARMOUR":3},"bySkill":{}}},{"item":{"id":2005,"name":"Superior Iron Helmet","image":"items/armor-iron-helmet.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":2006,"name":"Superior Iron Boots","image":"items/armor-iron-boots.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":2007,"name":"Superior Iron Body","image":"items/armor-iron-body.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":25200,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":2008,"name":"Superior Iron Gloves","image":"items/armor-iron-gloves.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":2009,"name":"Superior Iron Shield","image":"items/armor-iron-shield.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"ARMOUR":6,"HEALTH":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":18,"ARMOUR":6},"bySkill":{}}},{"item":{"id":2010,"name":"Superior Silver Helmet","image":"items/armor-silver-helmet.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"ARMOUR":9,"HEALTH":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":27,"ARMOUR":9},"bySkill":{}}},{"item":{"id":2011,"name":"Superior Silver Boots","image":"items/armor-silver-boots.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"ARMOUR":9,"HEALTH":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":27,"ARMOUR":9},"bySkill":{}}},{"item":{"id":2012,"name":"Superior Silver Body","image":"items/armor-silver-body.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":133200,"UNTRADEABLE":false,"ARMOUR":18,"HEALTH":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":54,"ARMOUR":18},"bySkill":{}}},{"item":{"id":2013,"name":"Superior Silver Gloves","image":"items/armor-silver-gloves.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"ARMOUR":9,"HEALTH":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":27,"ARMOUR":9},"bySkill":{}}},{"item":{"id":2014,"name":"Superior Silver Shield","image":"items/armor-silver-shield.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"ARMOUR":9,"HEALTH":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":27,"ARMOUR":9},"bySkill":{}}},{"item":{"id":2015,"name":"Superior Gold Helmet","image":"items/armor-gold-helmet.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":2016,"name":"Superior Gold Boots","image":"items/armor-gold-boots.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":2017,"name":"Superior Gold Body","image":"items/armor-gold-body.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":457200,"UNTRADEABLE":false,"ARMOUR":24,"HEALTH":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":72,"ARMOUR":24},"bySkill":{}}},{"item":{"id":2018,"name":"Superior Gold Gloves","image":"items/armor-gold-gloves.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":2019,"name":"Superior Gold Shield","image":"items/armor-gold-shield.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"ARMOUR":12,"HEALTH":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":36,"ARMOUR":12},"bySkill":{}}},{"item":{"id":2020,"name":"Superior Cobalt Body","image":"items/armor-cobalt-body.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1177200,"UNTRADEABLE":false,"ARMOUR":30,"HEALTH":90}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":90,"ARMOUR":30},"bySkill":{}}},{"item":{"id":2021,"name":"Superior Cobalt Boots","image":"items/armor-cobalt-boots.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"ARMOUR":15,"HEALTH":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":45,"ARMOUR":15},"bySkill":{}}},{"item":{"id":2022,"name":"Superior Cobalt Helmet","image":"items/armor-cobalt-helmet.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"ARMOUR":15,"HEALTH":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":45,"ARMOUR":15},"bySkill":{}}},{"item":{"id":2023,"name":"Superior Cobalt Gloves","image":"items/armor-cobalt-gloves.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"ARMOUR":15,"HEALTH":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":45,"ARMOUR":15},"bySkill":{}}},{"item":{"id":2024,"name":"Superior Cobalt Shield","image":"items/armor-cobalt-shield.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"ARMOUR":15,"HEALTH":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":45,"ARMOUR":15},"bySkill":{}}},{"item":{"id":2025,"name":"Superior Obsidian Body","image":"items/armor-obsidian-body.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2485200,"UNTRADEABLE":false,"ARMOUR":36,"HEALTH":108}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":108,"ARMOUR":36},"bySkill":{}}},{"item":{"id":2026,"name":"Superior Obsidian Boots","image":"items/armor-obsidian-boots.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"ARMOUR":18,"HEALTH":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":54,"ARMOUR":18},"bySkill":{}}},{"item":{"id":2027,"name":"Superior Obsidian Helmet","image":"items/armor-obsidian-helmet.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"ARMOUR":18,"HEALTH":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":54,"ARMOUR":18},"bySkill":{}}},{"item":{"id":2028,"name":"Superior Obsidian Gloves","image":"items/armor-obsidian-gloves.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"ARMOUR":18,"HEALTH":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":54,"ARMOUR":18},"bySkill":{}}},{"item":{"id":2029,"name":"Superior Obsidian Shield","image":"items/armor-obsidian-shield.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"ARMOUR":18,"HEALTH":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":54,"ARMOUR":18},"bySkill":{}}},{"item":{"id":2030,"name":"Superior Copper Hammer","image":"items/hammer-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":36,"COMBAT_EXP_PERCENT":9,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":9,"DAMAGE":36,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2031,"name":"Superior Copper Hatchet","image":"items/hatchet-copper.png","skill":"Woodcutting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"SKILL_SPEED":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":9}}}},{"item":{"id":2032,"name":"Superior Copper Sword","image":"items/sword-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":36,"COMBAT_EXP_PERCENT":9,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":9,"DAMAGE":36,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2033,"name":"Superior Copper Rod","image":"items/tool-copper-rod.png","skill":"Fishing","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"SKILL_SPEED":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":9}}}},{"item":{"id":2034,"name":"Superior Copper Pickaxe","image":"items/pickaxe-copper.png","skill":"Mining","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"SKILL_SPEED":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":9}}}},{"item":{"id":2035,"name":"Superior Copper Spade","image":"items/tool-copper-spade.png","skill":"Farming","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"SKILL_SPEED":9}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":9}}}},{"item":{"id":2036,"name":"Superior Iron Hammer","image":"items/hammer-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2037,"name":"Superior Iron Hatchet","image":"items/hatchet-iron.png","skill":"Woodcutting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":18}}}},{"item":{"id":2038,"name":"Superior Iron Sword","image":"items/sword-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2039,"name":"Superior Iron Rod","image":"items/tool-iron-rod.png","skill":"Fishing","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":18}}}},{"item":{"id":2040,"name":"Superior Iron Pickaxe","image":"items/pickaxe-iron.png","skill":"Mining","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":18}}}},{"item":{"id":2041,"name":"Superior Iron Spade","image":"items/tool-iron-spade.png","skill":"Farming","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"SKILL_SPEED":18}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":18}}}},{"item":{"id":2042,"name":"Superior Silver Hammer","image":"items/hammer-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":108,"COMBAT_EXP_PERCENT":27,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":27,"DAMAGE":108,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2043,"name":"Superior Silver Hatchet","image":"items/hatchet-silver.png","skill":"Woodcutting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"SKILL_SPEED":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":27}}}},{"item":{"id":2044,"name":"Superior Silver Sword","image":"items/sword-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":108,"COMBAT_EXP_PERCENT":27,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":27,"DAMAGE":108,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2045,"name":"Superior Silver Rod","image":"items/tool-silver-rod.png","skill":"Fishing","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"SKILL_SPEED":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":27}}}},{"item":{"id":2046,"name":"Superior Silver Pickaxe","image":"items/pickaxe-silver.png","skill":"Mining","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"SKILL_SPEED":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":27}}}},{"item":{"id":2047,"name":"Superior Silver Spade","image":"items/tool-silver-spade.png","skill":"Farming","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"SKILL_SPEED":27}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":27}}}},{"item":{"id":2048,"name":"Superior Gold Hammer","image":"items/hammer-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2049,"name":"Superior Gold Hatchet","image":"items/hatchet-gold.png","skill":"Woodcutting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":36}}}},{"item":{"id":2050,"name":"Superior Gold Sword","image":"items/sword-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2051,"name":"Superior Gold Rod","image":"items/tool-gold-rod.png","skill":"Fishing","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":36}}}},{"item":{"id":2052,"name":"Superior Gold Pickaxe","image":"items/pickaxe-gold.png","skill":"Mining","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":36}}}},{"item":{"id":2053,"name":"Superior Gold Spade","image":"items/tool-gold-spade.png","skill":"Farming","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"SKILL_SPEED":36}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":36}}}},{"item":{"id":2054,"name":"Superior Cobalt Hammer","image":"items/hammer-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":180,"COMBAT_EXP_PERCENT":45,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":45,"DAMAGE":180,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2055,"name":"Superior Cobalt Hatchet","image":"items/hatchet-cobalt.png","skill":"Woodcutting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"SKILL_SPEED":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":45}}}},{"item":{"id":2056,"name":"Superior Cobalt Sword","image":"items/sword-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":180,"COMBAT_EXP_PERCENT":45,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":45,"DAMAGE":180,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2057,"name":"Superior Cobalt Rod","image":"items/tool-cobalt-rod.png","skill":"Fishing","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"SKILL_SPEED":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":45}}}},{"item":{"id":2058,"name":"Superior Cobalt Pickaxe","image":"items/pickaxe-cobalt.png","skill":"Mining","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"SKILL_SPEED":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":45}}}},{"item":{"id":2059,"name":"Superior Cobalt Spade","image":"items/tool-cobalt-spade.png","skill":"Farming","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"SKILL_SPEED":45}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":45}}}},{"item":{"id":2060,"name":"Superior Obsidian Hammer","image":"items/hammer-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":216,"COMBAT_EXP_PERCENT":54,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":54,"DAMAGE":216,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2061,"name":"Superior Obsidian Hatchet","image":"items/hatchet-obsidian.png","skill":"Woodcutting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"SKILL_SPEED":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":54}}}},{"item":{"id":2062,"name":"Superior Obsidian Sword","image":"items/sword-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":216,"COMBAT_EXP_PERCENT":54,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":54,"DAMAGE":216,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2063,"name":"Superior Obsidian Rod","image":"items/tool-obsidian-rod.png","skill":"Fishing","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"SKILL_SPEED":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":54}}}},{"item":{"id":2064,"name":"Superior Obsidian Pickaxe","image":"items/pickaxe-obsidian.png","skill":"Mining","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"SKILL_SPEED":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":54}}}},{"item":{"id":2065,"name":"Superior Obsidian Spade","image":"items/tool-obsidian-spade.png","skill":"Farming","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"SKILL_SPEED":54}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":54}}}},{"item":{"id":2066,"name":"Superior Copper Bow","image":"items/bow-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":36,"COMBAT_EXP_PERCENT":9,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":9,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":36,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2067,"name":"Superior Iron Bow","image":"items/bow-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":18,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2068,"name":"Superior Silver Bow","image":"items/bow-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":108,"COMBAT_EXP_PERCENT":27,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":27,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":108,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2069,"name":"Superior Gold Bow","image":"items/bow-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":36,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2070,"name":"Superior Cobalt Bow","image":"items/bow-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":180,"COMBAT_EXP_PERCENT":45,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":45,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":180,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2071,"name":"Superior Obsidian Bow","image":"items/bow-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":216,"COMBAT_EXP_PERCENT":54,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":54,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":216,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2072,"name":"Superior Astral Bow","image":"items/bow-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":252,"COMBAT_EXP_PERCENT":63,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":63,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":252,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2073,"name":"Superior Astral Hammer","image":"items/hammer-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":252,"COMBAT_EXP_PERCENT":63,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":63,"DAMAGE":252,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2074,"name":"Superior Astral Hatchet","image":"items/hatchet-astral.png","skill":"Woodcutting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"SKILL_SPEED":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":63}}}},{"item":{"id":2075,"name":"Superior Astral Sword","image":"items/sword-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":252,"COMBAT_EXP_PERCENT":63,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":63,"DAMAGE":252,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2076,"name":"Superior Astral Rod","image":"items/tool-astral-rod.png","skill":"Fishing","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"SKILL_SPEED":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":63}}}},{"item":{"id":2077,"name":"Superior Astral Pickaxe","image":"items/pickaxe-astral.png","skill":"Mining","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"SKILL_SPEED":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":63}}}},{"item":{"id":2078,"name":"Superior Astral Spade","image":"items/tool-astral-spade.png","skill":"Farming","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"SKILL_SPEED":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":63}}}},{"item":{"id":2079,"name":"Superior Astral Body","image":"items/armor-astral-body.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4621200,"UNTRADEABLE":false,"ARMOUR":42,"HEALTH":126}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":126,"ARMOUR":42},"bySkill":{}}},{"item":{"id":2080,"name":"Superior Astral Boots","image":"items/armor-astral-boots.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"ARMOUR":21,"HEALTH":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":63,"ARMOUR":21},"bySkill":{}}},{"item":{"id":2081,"name":"Superior Astral Helmet","image":"items/armor-astral-helmet.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"ARMOUR":21,"HEALTH":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":63,"ARMOUR":21},"bySkill":{}}},{"item":{"id":2082,"name":"Superior Astral Gloves","image":"items/armor-astral-gloves.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"ARMOUR":21,"HEALTH":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":63,"ARMOUR":21},"bySkill":{}}},{"item":{"id":2083,"name":"Superior Astral Shield","image":"items/armor-astral-shield.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"ARMOUR":21,"HEALTH":63}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":63,"ARMOUR":21},"bySkill":{}}},{"item":{"id":2084,"name":"Superior Copper Spear","image":"items/spear-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":36,"COMBAT_EXP_PERCENT":9,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":9,"DAMAGE":36,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2085,"name":"Superior Iron Spear","image":"items/spear-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2086,"name":"Superior Silver Spear","image":"items/spear-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":108,"COMBAT_EXP_PERCENT":27,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":27,"DAMAGE":108,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2087,"name":"Superior Gold Spear","image":"items/spear-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2088,"name":"Superior Cobalt Spear","image":"items/spear-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":180,"COMBAT_EXP_PERCENT":45,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":45,"DAMAGE":180,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2089,"name":"Superior Obsidian Spear","image":"items/spear-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":216,"COMBAT_EXP_PERCENT":54,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":54,"DAMAGE":216,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2090,"name":"Superior Astral Spear","image":"items/spear-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":252,"COMBAT_EXP_PERCENT":63,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":63,"DAMAGE":252,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2091,"name":"Superior Copper Scythe","image":"items/scythe-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":36,"COMBAT_EXP_PERCENT":9,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":9,"DAMAGE":36,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2092,"name":"Superior Iron Scythe","image":"items/scythe-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2093,"name":"Superior Silver Scythe","image":"items/scythe-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":108,"COMBAT_EXP_PERCENT":27,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":27,"DAMAGE":108,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2094,"name":"Superior Gold Scythe","image":"items/scythe-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2095,"name":"Superior Cobalt Scythe","image":"items/scythe-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":180,"COMBAT_EXP_PERCENT":45,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":45,"DAMAGE":180,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2096,"name":"Superior Obsidian Scythe","image":"items/scythe-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":216,"COMBAT_EXP_PERCENT":54,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":54,"DAMAGE":216,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2097,"name":"Superior Astral Scythe","image":"items/scythe-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":252,"COMBAT_EXP_PERCENT":63,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":63,"DAMAGE":252,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2098,"name":"Superior Copper Boomerang","image":"items/boomerang-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1600,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":36,"COMBAT_EXP_PERCENT":9,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":9,"DAMAGE":36,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2099,"name":"Superior Iron Boomerang","image":"items/boomerang-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":16800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":72,"COMBAT_EXP_PERCENT":18,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":18,"DAMAGE":72,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2100,"name":"Superior Silver Boomerang","image":"items/boomerang-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":88800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":108,"COMBAT_EXP_PERCENT":27,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":27,"DAMAGE":108,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2101,"name":"Superior Gold Boomerang","image":"items/boomerang-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":304800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":144,"COMBAT_EXP_PERCENT":36,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":36,"DAMAGE":144,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2102,"name":"Superior Cobalt Boomerang","image":"items/boomerang-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":784800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":180,"COMBAT_EXP_PERCENT":45,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":45,"DAMAGE":180,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2103,"name":"Superior Obsidian Boomerang","image":"items/boomerang-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1656800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":216,"COMBAT_EXP_PERCENT":54,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":54,"DAMAGE":216,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2104,"name":"Superior Astral Boomerang","image":"items/boomerang-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3080800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":252,"COMBAT_EXP_PERCENT":63,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":63,"DAMAGE":252,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2105,"name":"Superior Infernal Bow","image":"items/bow-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":288,"COMBAT_EXP_PERCENT":72,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":72,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":288,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2106,"name":"Superior Infernal Hammer","image":"items/hammer-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":288,"COMBAT_EXP_PERCENT":72,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":72,"DAMAGE":288,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2107,"name":"Superior Infernal Hatchet","image":"items/hatchet-infernal.png","skill":"Woodcutting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"SKILL_SPEED":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":72}}}},{"item":{"id":2108,"name":"Superior Infernal Sword","image":"items/sword-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":288,"COMBAT_EXP_PERCENT":72,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":72,"DAMAGE":288,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2109,"name":"Superior Infernal Rod","image":"items/tool-infernal-rod.png","skill":"Fishing","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"SKILL_SPEED":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":72}}}},{"item":{"id":2110,"name":"Superior Infernal Pickaxe","image":"items/pickaxe-infernal.png","skill":"Mining","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"SKILL_SPEED":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":72}}}},{"item":{"id":2111,"name":"Superior Infernal Spade","image":"items/tool-infernal-spade.png","skill":"Farming","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"SKILL_SPEED":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":72}}}},{"item":{"id":2112,"name":"Superior Infernal Body","image":"items/armor-infernal-body.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":8161200,"UNTRADEABLE":false,"ARMOUR":48,"HEALTH":144}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":144,"ARMOUR":48},"bySkill":{}}},{"item":{"id":2113,"name":"Superior Infernal Boots","image":"items/armor-infernal-boots.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"ARMOUR":24,"HEALTH":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":72,"ARMOUR":24},"bySkill":{}}},{"item":{"id":2114,"name":"Superior Infernal Helmet","image":"items/armor-infernal-helmet.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"ARMOUR":24,"HEALTH":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":72,"ARMOUR":24},"bySkill":{}}},{"item":{"id":2115,"name":"Superior Infernal Gloves","image":"items/armor-infernal-gloves.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"ARMOUR":24,"HEALTH":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":72,"ARMOUR":24},"bySkill":{}}},{"item":{"id":2116,"name":"Superior Infernal Shield","image":"items/armor-infernal-shield.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"ARMOUR":24,"HEALTH":72}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":72,"ARMOUR":24},"bySkill":{}}},{"item":{"id":2117,"name":"Superior Infernal Spear","image":"items/spear-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":288,"COMBAT_EXP_PERCENT":72,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":72,"DAMAGE":288,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2118,"name":"Superior Infernal Scythe","image":"items/scythe-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":288,"COMBAT_EXP_PERCENT":72,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":72,"DAMAGE":288,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2119,"name":"Superior Infernal Boomerang","image":"items/boomerang-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5440800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":288,"COMBAT_EXP_PERCENT":72,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":72,"DAMAGE":288,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2400,"name":"Exquisite Copper Helmet","image":"items/armor-copper-helmet.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":2401,"name":"Exquisite Copper Boots","image":"items/armor-copper-boots.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":2402,"name":"Exquisite Copper Body","image":"items/armor-copper-body.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":2403,"name":"Exquisite Copper Gloves","image":"items/armor-copper-gloves.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":2404,"name":"Exquisite Copper Shield","image":"items/armor-copper-shield.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"ARMOUR":4,"HEALTH":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":12,"ARMOUR":4},"bySkill":{}}},{"item":{"id":2405,"name":"Exquisite Iron Helmet","image":"items/armor-iron-helmet.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"ARMOUR":7,"HEALTH":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":21,"ARMOUR":7},"bySkill":{}}},{"item":{"id":2406,"name":"Exquisite Iron Boots","image":"items/armor-iron-boots.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"ARMOUR":7,"HEALTH":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":21,"ARMOUR":7},"bySkill":{}}},{"item":{"id":2407,"name":"Exquisite Iron Body","image":"items/armor-iron-body.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":43200,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":2408,"name":"Exquisite Iron Gloves","image":"items/armor-iron-gloves.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"ARMOUR":7,"HEALTH":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":21,"ARMOUR":7},"bySkill":{}}},{"item":{"id":2409,"name":"Exquisite Iron Shield","image":"items/armor-iron-shield.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"ARMOUR":7,"HEALTH":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":21,"ARMOUR":7},"bySkill":{}}},{"item":{"id":2410,"name":"Exquisite Silver Helmet","image":"items/armor-silver-helmet.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":2411,"name":"Exquisite Silver Boots","image":"items/armor-silver-boots.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":2412,"name":"Exquisite Silver Body","image":"items/armor-silver-body.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":205200,"UNTRADEABLE":false,"ARMOUR":20,"HEALTH":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":60,"ARMOUR":20},"bySkill":{}}},{"item":{"id":2413,"name":"Exquisite Silver Gloves","image":"items/armor-silver-gloves.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":2414,"name":"Exquisite Silver Shield","image":"items/armor-silver-shield.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":2415,"name":"Exquisite Gold Helmet","image":"items/armor-gold-helmet.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"ARMOUR":13,"HEALTH":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":39,"ARMOUR":13},"bySkill":{}}},{"item":{"id":2416,"name":"Exquisite Gold Boots","image":"items/armor-gold-boots.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"ARMOUR":13,"HEALTH":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":39,"ARMOUR":13},"bySkill":{}}},{"item":{"id":2417,"name":"Exquisite Gold Body","image":"items/armor-gold-body.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":637200,"UNTRADEABLE":false,"ARMOUR":26,"HEALTH":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":78,"ARMOUR":26},"bySkill":{}}},{"item":{"id":2418,"name":"Exquisite Gold Gloves","image":"items/armor-gold-gloves.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"ARMOUR":13,"HEALTH":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":39,"ARMOUR":13},"bySkill":{}}},{"item":{"id":2419,"name":"Exquisite Gold Shield","image":"items/armor-gold-shield.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"ARMOUR":13,"HEALTH":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":39,"ARMOUR":13},"bySkill":{}}},{"item":{"id":2420,"name":"Exquisite Cobalt Body","image":"items/armor-cobalt-body.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1537200,"UNTRADEABLE":false,"ARMOUR":32,"HEALTH":96}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":96,"ARMOUR":32},"bySkill":{}}},{"item":{"id":2421,"name":"Exquisite Cobalt Boots","image":"items/armor-cobalt-boots.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":2422,"name":"Exquisite Cobalt Helmet","image":"items/armor-cobalt-helmet.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":2423,"name":"Exquisite Cobalt Gloves","image":"items/armor-cobalt-gloves.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":2424,"name":"Exquisite Cobalt Shield","image":"items/armor-cobalt-shield.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":2425,"name":"Exquisite Obsidian Body","image":"items/armor-obsidian-body.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3073200,"UNTRADEABLE":false,"ARMOUR":38,"HEALTH":114}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":114,"ARMOUR":38},"bySkill":{}}},{"item":{"id":2426,"name":"Exquisite Obsidian Boots","image":"items/armor-obsidian-boots.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"ARMOUR":19,"HEALTH":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":57,"ARMOUR":19},"bySkill":{}}},{"item":{"id":2427,"name":"Exquisite Obsidian Helmet","image":"items/armor-obsidian-helmet.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"ARMOUR":19,"HEALTH":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":57,"ARMOUR":19},"bySkill":{}}},{"item":{"id":2428,"name":"Exquisite Obsidian Gloves","image":"items/armor-obsidian-gloves.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"ARMOUR":19,"HEALTH":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":57,"ARMOUR":19},"bySkill":{}}},{"item":{"id":2429,"name":"Exquisite Obsidian Shield","image":"items/armor-obsidian-shield.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"ARMOUR":19,"HEALTH":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":57,"ARMOUR":19},"bySkill":{}}},{"item":{"id":2430,"name":"Exquisite Copper Hammer","image":"items/hammer-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2431,"name":"Exquisite Copper Hatchet","image":"items/hatchet-copper.png","skill":"Woodcutting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":12}}}},{"item":{"id":2432,"name":"Exquisite Copper Sword","image":"items/sword-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2433,"name":"Exquisite Copper Rod","image":"items/tool-copper-rod.png","skill":"Fishing","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":12}}}},{"item":{"id":2434,"name":"Exquisite Copper Pickaxe","image":"items/pickaxe-copper.png","skill":"Mining","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":12}}}},{"item":{"id":2435,"name":"Exquisite Copper Spade","image":"items/tool-copper-spade.png","skill":"Farming","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"SKILL_SPEED":12}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":12}}}},{"item":{"id":2436,"name":"Exquisite Iron Hammer","image":"items/hammer-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":84,"COMBAT_EXP_PERCENT":21,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":21,"DAMAGE":84,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2437,"name":"Exquisite Iron Hatchet","image":"items/hatchet-iron.png","skill":"Woodcutting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"SKILL_SPEED":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":21}}}},{"item":{"id":2438,"name":"Exquisite Iron Sword","image":"items/sword-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":84,"COMBAT_EXP_PERCENT":21,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":21,"DAMAGE":84,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2439,"name":"Exquisite Iron Rod","image":"items/tool-iron-rod.png","skill":"Fishing","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"SKILL_SPEED":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":21}}}},{"item":{"id":2440,"name":"Exquisite Iron Pickaxe","image":"items/pickaxe-iron.png","skill":"Mining","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"SKILL_SPEED":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":21}}}},{"item":{"id":2441,"name":"Exquisite Iron Spade","image":"items/tool-iron-spade.png","skill":"Farming","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"SKILL_SPEED":21}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":21}}}},{"item":{"id":2442,"name":"Exquisite Silver Hammer","image":"items/hammer-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2443,"name":"Exquisite Silver Hatchet","image":"items/hatchet-silver.png","skill":"Woodcutting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":30}}}},{"item":{"id":2444,"name":"Exquisite Silver Sword","image":"items/sword-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2445,"name":"Exquisite Silver Rod","image":"items/tool-silver-rod.png","skill":"Fishing","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":30}}}},{"item":{"id":2446,"name":"Exquisite Silver Pickaxe","image":"items/pickaxe-silver.png","skill":"Mining","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":30}}}},{"item":{"id":2447,"name":"Exquisite Silver Spade","image":"items/tool-silver-spade.png","skill":"Farming","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"SKILL_SPEED":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":30}}}},{"item":{"id":2448,"name":"Exquisite Gold Hammer","image":"items/hammer-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":156,"COMBAT_EXP_PERCENT":39,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":39,"DAMAGE":156,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2449,"name":"Exquisite Gold Hatchet","image":"items/hatchet-gold.png","skill":"Woodcutting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"SKILL_SPEED":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":39}}}},{"item":{"id":2450,"name":"Exquisite Gold Sword","image":"items/sword-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":156,"COMBAT_EXP_PERCENT":39,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":39,"DAMAGE":156,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2451,"name":"Exquisite Gold Rod","image":"items/tool-gold-rod.png","skill":"Fishing","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"SKILL_SPEED":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":39}}}},{"item":{"id":2452,"name":"Exquisite Gold Pickaxe","image":"items/pickaxe-gold.png","skill":"Mining","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"SKILL_SPEED":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":39}}}},{"item":{"id":2453,"name":"Exquisite Gold Spade","image":"items/tool-gold-spade.png","skill":"Farming","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"SKILL_SPEED":39}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":39}}}},{"item":{"id":2454,"name":"Exquisite Cobalt Hammer","image":"items/hammer-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2455,"name":"Exquisite Cobalt Hatchet","image":"items/hatchet-cobalt.png","skill":"Woodcutting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":48}}}},{"item":{"id":2456,"name":"Exquisite Cobalt Sword","image":"items/sword-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2457,"name":"Exquisite Cobalt Rod","image":"items/tool-cobalt-rod.png","skill":"Fishing","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":48}}}},{"item":{"id":2458,"name":"Exquisite Cobalt Pickaxe","image":"items/pickaxe-cobalt.png","skill":"Mining","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":48}}}},{"item":{"id":2459,"name":"Exquisite Cobalt Spade","image":"items/tool-cobalt-spade.png","skill":"Farming","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"SKILL_SPEED":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":48}}}},{"item":{"id":2460,"name":"Exquisite Obsidian Hammer","image":"items/hammer-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":228,"COMBAT_EXP_PERCENT":57,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":57,"DAMAGE":228,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2461,"name":"Exquisite Obsidian Hatchet","image":"items/hatchet-obsidian.png","skill":"Woodcutting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"SKILL_SPEED":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":57}}}},{"item":{"id":2462,"name":"Exquisite Obsidian Sword","image":"items/sword-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":228,"COMBAT_EXP_PERCENT":57,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":57,"DAMAGE":228,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2463,"name":"Exquisite Obsidian Rod","image":"items/tool-obsidian-rod.png","skill":"Fishing","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"SKILL_SPEED":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":57}}}},{"item":{"id":2464,"name":"Exquisite Obsidian Pickaxe","image":"items/pickaxe-obsidian.png","skill":"Mining","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"SKILL_SPEED":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":57}}}},{"item":{"id":2465,"name":"Exquisite Obsidian Spade","image":"items/tool-obsidian-spade.png","skill":"Farming","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"SKILL_SPEED":57}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":57}}}},{"item":{"id":2466,"name":"Exquisite Copper Bow","image":"items/bow-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":12,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2467,"name":"Exquisite Iron Bow","image":"items/bow-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":84,"COMBAT_EXP_PERCENT":21,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":21,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":84,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2468,"name":"Exquisite Silver Bow","image":"items/bow-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":30,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2469,"name":"Exquisite Gold Bow","image":"items/bow-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":156,"COMBAT_EXP_PERCENT":39,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":39,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":156,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2470,"name":"Exquisite Cobalt Bow","image":"items/bow-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":48,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2471,"name":"Exquisite Obsidian Bow","image":"items/bow-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":228,"COMBAT_EXP_PERCENT":57,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":57,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":228,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2472,"name":"Exquisite Astral Bow","image":"items/bow-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":264,"COMBAT_EXP_PERCENT":66,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":66,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":264,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2473,"name":"Exquisite Astral Hammer","image":"items/hammer-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":264,"COMBAT_EXP_PERCENT":66,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":66,"DAMAGE":264,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2474,"name":"Exquisite Astral Hatchet","image":"items/hatchet-astral.png","skill":"Woodcutting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"SKILL_SPEED":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":66}}}},{"item":{"id":2475,"name":"Exquisite Astral Sword","image":"items/sword-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":264,"COMBAT_EXP_PERCENT":66,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":66,"DAMAGE":264,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2476,"name":"Exquisite Astral Rod","image":"items/tool-astral-rod.png","skill":"Fishing","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"SKILL_SPEED":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":66}}}},{"item":{"id":2477,"name":"Exquisite Astral Pickaxe","image":"items/pickaxe-astral.png","skill":"Mining","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"SKILL_SPEED":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":66}}}},{"item":{"id":2478,"name":"Exquisite Astral Spade","image":"items/tool-astral-spade.png","skill":"Farming","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"SKILL_SPEED":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":66}}}},{"item":{"id":2479,"name":"Exquisite Astral Body","image":"items/armor-astral-body.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":5581200,"UNTRADEABLE":false,"ARMOUR":44,"HEALTH":132}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":132,"ARMOUR":44},"bySkill":{}}},{"item":{"id":2480,"name":"Exquisite Astral Boots","image":"items/armor-astral-boots.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"ARMOUR":22,"HEALTH":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":66,"ARMOUR":22},"bySkill":{}}},{"item":{"id":2481,"name":"Exquisite Astral Helmet","image":"items/armor-astral-helmet.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"ARMOUR":22,"HEALTH":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":66,"ARMOUR":22},"bySkill":{}}},{"item":{"id":2482,"name":"Exquisite Astral Gloves","image":"items/armor-astral-gloves.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"ARMOUR":22,"HEALTH":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":66,"ARMOUR":22},"bySkill":{}}},{"item":{"id":2483,"name":"Exquisite Astral Shield","image":"items/armor-astral-shield.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"ARMOUR":22,"HEALTH":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":66,"ARMOUR":22},"bySkill":{}}},{"item":{"id":2484,"name":"Exquisite Copper Spear","image":"items/spear-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2485,"name":"Exquisite Iron Spear","image":"items/spear-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":84,"COMBAT_EXP_PERCENT":21,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":21,"DAMAGE":84,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2486,"name":"Exquisite Silver Spear","image":"items/spear-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2487,"name":"Exquisite Gold Spear","image":"items/spear-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":156,"COMBAT_EXP_PERCENT":39,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":39,"DAMAGE":156,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2488,"name":"Exquisite Cobalt Spear","image":"items/spear-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2489,"name":"Exquisite Obsidian Spear","image":"items/spear-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":228,"COMBAT_EXP_PERCENT":57,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":57,"DAMAGE":228,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2490,"name":"Exquisite Astral Spear","image":"items/spear-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":264,"COMBAT_EXP_PERCENT":66,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":66,"DAMAGE":264,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2491,"name":"Exquisite Copper Scythe","image":"items/scythe-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2492,"name":"Exquisite Iron Scythe","image":"items/scythe-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":84,"COMBAT_EXP_PERCENT":21,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":21,"DAMAGE":84,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2493,"name":"Exquisite Silver Scythe","image":"items/scythe-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2494,"name":"Exquisite Gold Scythe","image":"items/scythe-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":156,"COMBAT_EXP_PERCENT":39,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":39,"DAMAGE":156,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2495,"name":"Exquisite Cobalt Scythe","image":"items/scythe-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2496,"name":"Exquisite Obsidian Scythe","image":"items/scythe-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":228,"COMBAT_EXP_PERCENT":57,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":57,"DAMAGE":228,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2497,"name":"Exquisite Astral Scythe","image":"items/scythe-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":264,"COMBAT_EXP_PERCENT":66,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":66,"DAMAGE":264,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2498,"name":"Exquisite Copper Boomerang","image":"items/boomerang-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3200,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":48,"COMBAT_EXP_PERCENT":12,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":12,"DAMAGE":48,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2499,"name":"Exquisite Iron Boomerang","image":"items/boomerang-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":28800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":84,"COMBAT_EXP_PERCENT":21,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":21,"DAMAGE":84,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2500,"name":"Exquisite Silver Boomerang","image":"items/boomerang-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":136800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":120,"COMBAT_EXP_PERCENT":30,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":30,"DAMAGE":120,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2501,"name":"Exquisite Gold Boomerang","image":"items/boomerang-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":424800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":156,"COMBAT_EXP_PERCENT":39,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":39,"DAMAGE":156,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2502,"name":"Exquisite Cobalt Boomerang","image":"items/boomerang-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1024800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":192,"COMBAT_EXP_PERCENT":48,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":48,"DAMAGE":192,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2503,"name":"Exquisite Obsidian Boomerang","image":"items/boomerang-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2048800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":228,"COMBAT_EXP_PERCENT":57,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":57,"DAMAGE":228,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2504,"name":"Exquisite Astral Boomerang","image":"items/boomerang-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3720800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":264,"COMBAT_EXP_PERCENT":66,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":66,"DAMAGE":264,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2505,"name":"Exquisite Infernal Bow","image":"items/bow-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":300,"COMBAT_EXP_PERCENT":75,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":75,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":300,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2506,"name":"Exquisite Infernal Hammer","image":"items/hammer-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":300,"COMBAT_EXP_PERCENT":75,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":75,"DAMAGE":300,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2507,"name":"Exquisite Infernal Hatchet","image":"items/hatchet-infernal.png","skill":"Woodcutting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"SKILL_SPEED":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":75}}}},{"item":{"id":2508,"name":"Exquisite Infernal Sword","image":"items/sword-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":300,"COMBAT_EXP_PERCENT":75,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":75,"DAMAGE":300,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2509,"name":"Exquisite Infernal Rod","image":"items/tool-infernal-rod.png","skill":"Fishing","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"SKILL_SPEED":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":75}}}},{"item":{"id":2510,"name":"Exquisite Infernal Pickaxe","image":"items/pickaxe-infernal.png","skill":"Mining","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"SKILL_SPEED":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":75}}}},{"item":{"id":2511,"name":"Exquisite Infernal Spade","image":"items/tool-infernal-spade.png","skill":"Farming","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"SKILL_SPEED":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":75}}}},{"item":{"id":2512,"name":"Exquisite Infernal Body","image":"items/armor-infernal-body.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":9781200,"UNTRADEABLE":false,"ARMOUR":50,"HEALTH":150}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":150,"ARMOUR":50},"bySkill":{}}},{"item":{"id":2513,"name":"Exquisite Infernal Boots","image":"items/armor-infernal-boots.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"ARMOUR":25,"HEALTH":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":75,"ARMOUR":25},"bySkill":{}}},{"item":{"id":2514,"name":"Exquisite Infernal Helmet","image":"items/armor-infernal-helmet.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"ARMOUR":25,"HEALTH":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":75,"ARMOUR":25},"bySkill":{}}},{"item":{"id":2515,"name":"Exquisite Infernal Gloves","image":"items/armor-infernal-gloves.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"ARMOUR":25,"HEALTH":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":75,"ARMOUR":25},"bySkill":{}}},{"item":{"id":2516,"name":"Exquisite Infernal Shield","image":"items/armor-infernal-shield.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"ARMOUR":25,"HEALTH":75}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":75,"ARMOUR":25},"bySkill":{}}},{"item":{"id":2517,"name":"Exquisite Infernal Spear","image":"items/spear-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":300,"COMBAT_EXP_PERCENT":75,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":75,"DAMAGE":300,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2518,"name":"Exquisite Infernal Scythe","image":"items/scythe-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":300,"COMBAT_EXP_PERCENT":75,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":75,"DAMAGE":300,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2519,"name":"Exquisite Infernal Boomerang","image":"items/boomerang-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6520800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":300,"COMBAT_EXP_PERCENT":75,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":75,"DAMAGE":300,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2800,"name":"Perfect Copper Helmet","image":"items/armor-copper-helmet.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ARMOUR":5,"HEALTH":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":15,"ARMOUR":5},"bySkill":{}}},{"item":{"id":2801,"name":"Perfect Copper Boots","image":"items/armor-copper-boots.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ARMOUR":5,"HEALTH":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":15,"ARMOUR":5},"bySkill":{}}},{"item":{"id":2802,"name":"Perfect Copper Body","image":"items/armor-copper-body.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7200,"UNTRADEABLE":false,"ARMOUR":10,"HEALTH":30}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":30,"ARMOUR":10},"bySkill":{}}},{"item":{"id":2803,"name":"Perfect Copper Gloves","image":"items/armor-copper-gloves.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ARMOUR":5,"HEALTH":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":15,"ARMOUR":5},"bySkill":{}}},{"item":{"id":2804,"name":"Perfect Copper Shield","image":"items/armor-copper-shield.png","skill":"Defense","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ARMOUR":5,"HEALTH":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":15,"ARMOUR":5},"bySkill":{}}},{"item":{"id":2805,"name":"Perfect Iron Helmet","image":"items/armor-iron-helmet.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":2806,"name":"Perfect Iron Boots","image":"items/armor-iron-boots.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":2807,"name":"Perfect Iron Body","image":"items/armor-iron-body.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":61200,"UNTRADEABLE":false,"ARMOUR":16,"HEALTH":48}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":48,"ARMOUR":16},"bySkill":{}}},{"item":{"id":2808,"name":"Perfect Iron Gloves","image":"items/armor-iron-gloves.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":2809,"name":"Perfect Iron Shield","image":"items/armor-iron-shield.png","skill":"Defense","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"ARMOUR":8,"HEALTH":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":24,"ARMOUR":8},"bySkill":{}}},{"item":{"id":2810,"name":"Perfect Silver Helmet","image":"items/armor-silver-helmet.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"ARMOUR":11,"HEALTH":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":33,"ARMOUR":11},"bySkill":{}}},{"item":{"id":2811,"name":"Perfect Silver Boots","image":"items/armor-silver-boots.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"ARMOUR":11,"HEALTH":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":33,"ARMOUR":11},"bySkill":{}}},{"item":{"id":2812,"name":"Perfect Silver Body","image":"items/armor-silver-body.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":277200,"UNTRADEABLE":false,"ARMOUR":22,"HEALTH":66}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":66,"ARMOUR":22},"bySkill":{}}},{"item":{"id":2813,"name":"Perfect Silver Gloves","image":"items/armor-silver-gloves.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"ARMOUR":11,"HEALTH":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":33,"ARMOUR":11},"bySkill":{}}},{"item":{"id":2814,"name":"Perfect Silver Shield","image":"items/armor-silver-shield.png","skill":"Defense","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"ARMOUR":11,"HEALTH":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":33,"ARMOUR":11},"bySkill":{}}},{"item":{"id":2815,"name":"Perfect Gold Helmet","image":"items/armor-gold-helmet.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":2816,"name":"Perfect Gold Boots","image":"items/armor-gold-boots.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":2817,"name":"Perfect Gold Body","image":"items/armor-gold-body.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":817200,"UNTRADEABLE":false,"ARMOUR":28,"HEALTH":84}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":84,"ARMOUR":28},"bySkill":{}}},{"item":{"id":2818,"name":"Perfect Gold Gloves","image":"items/armor-gold-gloves.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":2819,"name":"Perfect Gold Shield","image":"items/armor-gold-shield.png","skill":"Defense","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"ARMOUR":14,"HEALTH":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":42,"ARMOUR":14},"bySkill":{}}},{"item":{"id":2820,"name":"Perfect Cobalt Body","image":"items/armor-cobalt-body.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1897200,"UNTRADEABLE":false,"ARMOUR":34,"HEALTH":102}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":102,"ARMOUR":34},"bySkill":{}}},{"item":{"id":2821,"name":"Perfect Cobalt Boots","image":"items/armor-cobalt-boots.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"ARMOUR":17,"HEALTH":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":51,"ARMOUR":17},"bySkill":{}}},{"item":{"id":2822,"name":"Perfect Cobalt Helmet","image":"items/armor-cobalt-helmet.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"ARMOUR":17,"HEALTH":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":51,"ARMOUR":17},"bySkill":{}}},{"item":{"id":2823,"name":"Perfect Cobalt Gloves","image":"items/armor-cobalt-gloves.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"ARMOUR":17,"HEALTH":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":51,"ARMOUR":17},"bySkill":{}}},{"item":{"id":2824,"name":"Perfect Cobalt Shield","image":"items/armor-cobalt-shield.png","skill":"Defense","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"ARMOUR":17,"HEALTH":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":51,"ARMOUR":17},"bySkill":{}}},{"item":{"id":2825,"name":"Perfect Obsidian Body","image":"items/armor-obsidian-body.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":3661200,"UNTRADEABLE":false,"ARMOUR":40,"HEALTH":120}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":120,"ARMOUR":40},"bySkill":{}}},{"item":{"id":2826,"name":"Perfect Obsidian Boots","image":"items/armor-obsidian-boots.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"ARMOUR":20,"HEALTH":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":60,"ARMOUR":20},"bySkill":{}}},{"item":{"id":2827,"name":"Perfect Obsidian Helmet","image":"items/armor-obsidian-helmet.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"ARMOUR":20,"HEALTH":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":60,"ARMOUR":20},"bySkill":{}}},{"item":{"id":2828,"name":"Perfect Obsidian Gloves","image":"items/armor-obsidian-gloves.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"ARMOUR":20,"HEALTH":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":60,"ARMOUR":20},"bySkill":{}}},{"item":{"id":2829,"name":"Perfect Obsidian Shield","image":"items/armor-obsidian-shield.png","skill":"Defense","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"ARMOUR":20,"HEALTH":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":60,"ARMOUR":20},"bySkill":{}}},{"item":{"id":2830,"name":"Perfect Copper Hammer","image":"items/hammer-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":60,"COMBAT_EXP_PERCENT":15,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":15,"DAMAGE":60,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2831,"name":"Perfect Copper Hatchet","image":"items/hatchet-copper.png","skill":"Woodcutting","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"SKILL_SPEED":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":15}}}},{"item":{"id":2832,"name":"Perfect Copper Sword","image":"items/sword-copper.png","skill":"OneHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":60,"COMBAT_EXP_PERCENT":15,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":15,"DAMAGE":60,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2833,"name":"Perfect Copper Rod","image":"items/tool-copper-rod.png","skill":"Fishing","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"SKILL_SPEED":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":15}}}},{"item":{"id":2834,"name":"Perfect Copper Pickaxe","image":"items/pickaxe-copper.png","skill":"Mining","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"SKILL_SPEED":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":15}}}},{"item":{"id":2835,"name":"Perfect Copper Spade","image":"items/tool-copper-spade.png","skill":"Farming","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"SKILL_SPEED":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":15}}}},{"item":{"id":2836,"name":"Perfect Iron Hammer","image":"items/hammer-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2837,"name":"Perfect Iron Hatchet","image":"items/hatchet-iron.png","skill":"Woodcutting","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":24}}}},{"item":{"id":2838,"name":"Perfect Iron Sword","image":"items/sword-iron.png","skill":"OneHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2839,"name":"Perfect Iron Rod","image":"items/tool-iron-rod.png","skill":"Fishing","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":24}}}},{"item":{"id":2840,"name":"Perfect Iron Pickaxe","image":"items/pickaxe-iron.png","skill":"Mining","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":24}}}},{"item":{"id":2841,"name":"Perfect Iron Spade","image":"items/tool-iron-spade.png","skill":"Farming","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"SKILL_SPEED":24}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":24}}}},{"item":{"id":2842,"name":"Perfect Silver Hammer","image":"items/hammer-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":132,"COMBAT_EXP_PERCENT":33,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":33,"DAMAGE":132,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2843,"name":"Perfect Silver Hatchet","image":"items/hatchet-silver.png","skill":"Woodcutting","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"SKILL_SPEED":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":33}}}},{"item":{"id":2844,"name":"Perfect Silver Sword","image":"items/sword-silver.png","skill":"OneHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":132,"COMBAT_EXP_PERCENT":33,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":33,"DAMAGE":132,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2845,"name":"Perfect Silver Rod","image":"items/tool-silver-rod.png","skill":"Fishing","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"SKILL_SPEED":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":33}}}},{"item":{"id":2846,"name":"Perfect Silver Pickaxe","image":"items/pickaxe-silver.png","skill":"Mining","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"SKILL_SPEED":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":33}}}},{"item":{"id":2847,"name":"Perfect Silver Spade","image":"items/tool-silver-spade.png","skill":"Farming","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"SKILL_SPEED":33}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":33}}}},{"item":{"id":2848,"name":"Perfect Gold Hammer","image":"items/hammer-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2849,"name":"Perfect Gold Hatchet","image":"items/hatchet-gold.png","skill":"Woodcutting","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":42}}}},{"item":{"id":2850,"name":"Perfect Gold Sword","image":"items/sword-gold.png","skill":"OneHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2851,"name":"Perfect Gold Rod","image":"items/tool-gold-rod.png","skill":"Fishing","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":42}}}},{"item":{"id":2852,"name":"Perfect Gold Pickaxe","image":"items/pickaxe-gold.png","skill":"Mining","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":42}}}},{"item":{"id":2853,"name":"Perfect Gold Spade","image":"items/tool-gold-spade.png","skill":"Farming","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"SKILL_SPEED":42}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":42}}}},{"item":{"id":2854,"name":"Perfect Cobalt Hammer","image":"items/hammer-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":204,"COMBAT_EXP_PERCENT":51,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":51,"DAMAGE":204,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2855,"name":"Perfect Cobalt Hatchet","image":"items/hatchet-cobalt.png","skill":"Woodcutting","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"SKILL_SPEED":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":51}}}},{"item":{"id":2856,"name":"Perfect Cobalt Sword","image":"items/sword-cobalt.png","skill":"OneHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":204,"COMBAT_EXP_PERCENT":51,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":51,"DAMAGE":204,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2857,"name":"Perfect Cobalt Rod","image":"items/tool-cobalt-rod.png","skill":"Fishing","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"SKILL_SPEED":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":51}}}},{"item":{"id":2858,"name":"Perfect Cobalt Pickaxe","image":"items/pickaxe-cobalt.png","skill":"Mining","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"SKILL_SPEED":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":51}}}},{"item":{"id":2859,"name":"Perfect Cobalt Spade","image":"items/tool-cobalt-spade.png","skill":"Farming","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"SKILL_SPEED":51}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":51}}}},{"item":{"id":2860,"name":"Perfect Obsidian Hammer","image":"items/hammer-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":240,"COMBAT_EXP_PERCENT":60,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":60,"DAMAGE":240,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2861,"name":"Perfect Obsidian Hatchet","image":"items/hatchet-obsidian.png","skill":"Woodcutting","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"SKILL_SPEED":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":60}}}},{"item":{"id":2862,"name":"Perfect Obsidian Sword","image":"items/sword-obsidian.png","skill":"OneHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":240,"COMBAT_EXP_PERCENT":60,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":60,"DAMAGE":240,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2863,"name":"Perfect Obsidian Rod","image":"items/tool-obsidian-rod.png","skill":"Fishing","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"SKILL_SPEED":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":60}}}},{"item":{"id":2864,"name":"Perfect Obsidian Pickaxe","image":"items/pickaxe-obsidian.png","skill":"Mining","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"SKILL_SPEED":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":60}}}},{"item":{"id":2865,"name":"Perfect Obsidian Spade","image":"items/tool-obsidian-spade.png","skill":"Farming","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"SKILL_SPEED":60}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":60}}}},{"item":{"id":2866,"name":"Perfect Copper Bow","image":"items/bow-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":60,"COMBAT_EXP_PERCENT":15,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":15,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":60,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2867,"name":"Perfect Iron Bow","image":"items/bow-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":24,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2868,"name":"Perfect Silver Bow","image":"items/bow-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":132,"COMBAT_EXP_PERCENT":33,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":33,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":132,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2869,"name":"Perfect Gold Bow","image":"items/bow-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":42,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2870,"name":"Perfect Cobalt Bow","image":"items/bow-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":204,"COMBAT_EXP_PERCENT":51,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":51,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":204,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2871,"name":"Perfect Obsidian Bow","image":"items/bow-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":240,"COMBAT_EXP_PERCENT":60,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":60,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":240,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2872,"name":"Perfect Astral Bow","image":"items/bow-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":276,"COMBAT_EXP_PERCENT":69,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":69,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":276,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2873,"name":"Perfect Astral Hammer","image":"items/hammer-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":276,"COMBAT_EXP_PERCENT":69,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":69,"DAMAGE":276,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2874,"name":"Perfect Astral Hatchet","image":"items/hatchet-astral.png","skill":"Woodcutting","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"SKILL_SPEED":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":69}}}},{"item":{"id":2875,"name":"Perfect Astral Sword","image":"items/sword-astral.png","skill":"OneHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":276,"COMBAT_EXP_PERCENT":69,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":69,"DAMAGE":276,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2876,"name":"Perfect Astral Rod","image":"items/tool-astral-rod.png","skill":"Fishing","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"SKILL_SPEED":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":69}}}},{"item":{"id":2877,"name":"Perfect Astral Pickaxe","image":"items/pickaxe-astral.png","skill":"Mining","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"SKILL_SPEED":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":69}}}},{"item":{"id":2878,"name":"Perfect Astral Spade","image":"items/tool-astral-spade.png","skill":"Farming","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"SKILL_SPEED":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":69}}}},{"item":{"id":2879,"name":"Perfect Astral Body","image":"items/armor-astral-body.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":6541200,"UNTRADEABLE":false,"ARMOUR":46,"HEALTH":138}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":138,"ARMOUR":46},"bySkill":{}}},{"item":{"id":2880,"name":"Perfect Astral Boots","image":"items/armor-astral-boots.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"ARMOUR":23,"HEALTH":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":69,"ARMOUR":23},"bySkill":{}}},{"item":{"id":2881,"name":"Perfect Astral Helmet","image":"items/armor-astral-helmet.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"ARMOUR":23,"HEALTH":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":69,"ARMOUR":23},"bySkill":{}}},{"item":{"id":2882,"name":"Perfect Astral Gloves","image":"items/armor-astral-gloves.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"ARMOUR":23,"HEALTH":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":69,"ARMOUR":23},"bySkill":{}}},{"item":{"id":2883,"name":"Perfect Astral Shield","image":"items/armor-astral-shield.png","skill":"Defense","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"ARMOUR":23,"HEALTH":69}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":69,"ARMOUR":23},"bySkill":{}}},{"item":{"id":2884,"name":"Perfect Copper Spear","image":"items/spear-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":60,"COMBAT_EXP_PERCENT":15,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":15,"DAMAGE":60,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2885,"name":"Perfect Iron Spear","image":"items/spear-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2886,"name":"Perfect Silver Spear","image":"items/spear-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":132,"COMBAT_EXP_PERCENT":33,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":33,"DAMAGE":132,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2887,"name":"Perfect Gold Spear","image":"items/spear-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2888,"name":"Perfect Cobalt Spear","image":"items/spear-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":204,"COMBAT_EXP_PERCENT":51,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":51,"DAMAGE":204,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2889,"name":"Perfect Obsidian Spear","image":"items/spear-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":240,"COMBAT_EXP_PERCENT":60,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":60,"DAMAGE":240,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2890,"name":"Perfect Astral Spear","image":"items/spear-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":276,"COMBAT_EXP_PERCENT":69,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":69,"DAMAGE":276,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2891,"name":"Perfect Copper Scythe","image":"items/scythe-copper.png","skill":"TwoHanded","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":60,"COMBAT_EXP_PERCENT":15,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":15,"DAMAGE":60,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2892,"name":"Perfect Iron Scythe","image":"items/scythe-iron.png","skill":"TwoHanded","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2893,"name":"Perfect Silver Scythe","image":"items/scythe-silver.png","skill":"TwoHanded","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":132,"COMBAT_EXP_PERCENT":33,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":33,"DAMAGE":132,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2894,"name":"Perfect Gold Scythe","image":"items/scythe-gold.png","skill":"TwoHanded","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2895,"name":"Perfect Cobalt Scythe","image":"items/scythe-cobalt.png","skill":"TwoHanded","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":204,"COMBAT_EXP_PERCENT":51,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":51,"DAMAGE":204,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2896,"name":"Perfect Obsidian Scythe","image":"items/scythe-obsidian.png","skill":"TwoHanded","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":240,"COMBAT_EXP_PERCENT":60,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":60,"DAMAGE":240,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2897,"name":"Perfect Astral Scythe","image":"items/scythe-astral.png","skill":"TwoHanded","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":276,"COMBAT_EXP_PERCENT":69,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":69,"DAMAGE":276,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2898,"name":"Perfect Copper Boomerang","image":"items/boomerang-copper.png","skill":"Ranged","tier":1,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":60,"COMBAT_EXP_PERCENT":15,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":15,"DAMAGE":60,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2899,"name":"Perfect Iron Boomerang","image":"items/boomerang-iron.png","skill":"Ranged","tier":2,"attributes":{"BUY_PRICE":0,"SELL_PRICE":40800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":96,"COMBAT_EXP_PERCENT":24,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":24,"DAMAGE":96,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2900,"name":"Perfect Silver Boomerang","image":"items/boomerang-silver.png","skill":"Ranged","tier":3,"attributes":{"BUY_PRICE":0,"SELL_PRICE":184800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":132,"COMBAT_EXP_PERCENT":33,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":33,"DAMAGE":132,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2901,"name":"Perfect Gold Boomerang","image":"items/boomerang-gold.png","skill":"Ranged","tier":4,"attributes":{"BUY_PRICE":0,"SELL_PRICE":544800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":168,"COMBAT_EXP_PERCENT":42,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":42,"DAMAGE":168,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2902,"name":"Perfect Cobalt Boomerang","image":"items/boomerang-cobalt.png","skill":"Ranged","tier":5,"attributes":{"BUY_PRICE":0,"SELL_PRICE":1264800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":204,"COMBAT_EXP_PERCENT":51,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":51,"DAMAGE":204,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2903,"name":"Perfect Obsidian Boomerang","image":"items/boomerang-obsidian.png","skill":"Ranged","tier":6,"attributes":{"BUY_PRICE":0,"SELL_PRICE":2440800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":240,"COMBAT_EXP_PERCENT":60,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":60,"DAMAGE":240,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2904,"name":"Perfect Astral Boomerang","image":"items/boomerang-astral.png","skill":"Ranged","tier":7,"attributes":{"BUY_PRICE":0,"SELL_PRICE":4360800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":276,"COMBAT_EXP_PERCENT":69,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":69,"DAMAGE":276,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2905,"name":"Perfect Infernal Bow","image":"items/bow-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":312,"COMBAT_EXP_PERCENT":78,"FOREST_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":78,"FOREST_DAMAGE_PERCENT":15,"DAMAGE":312,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2906,"name":"Perfect Infernal Hammer","image":"items/hammer-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":312,"COMBAT_EXP_PERCENT":78,"MOUNTAIN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"MOUNTAIN_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":78,"DAMAGE":312,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2907,"name":"Perfect Infernal Hatchet","image":"items/hatchet-infernal.png","skill":"Woodcutting","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"SKILL_SPEED":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Woodcutting":78}}}},{"item":{"id":2908,"name":"Perfect Infernal Sword","image":"items/sword-infernal.png","skill":"OneHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":312,"COMBAT_EXP_PERCENT":78,"MOUNTAIN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":78,"DAMAGE":312,"MOUNTAIN_DAMAGE_PERCENT":15,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2909,"name":"Perfect Infernal Rod","image":"items/tool-infernal-rod.png","skill":"Fishing","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"SKILL_SPEED":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Fishing":78}}}},{"item":{"id":2910,"name":"Perfect Infernal Pickaxe","image":"items/pickaxe-infernal.png","skill":"Mining","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"SKILL_SPEED":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Mining":78}}}},{"item":{"id":2911,"name":"Perfect Infernal Spade","image":"items/tool-infernal-spade.png","skill":"Farming","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"SKILL_SPEED":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{},"bySkill":{"SKILL_SPEED":{"Farming":78}}}},{"item":{"id":2912,"name":"Perfect Infernal Body","image":"items/armor-infernal-body.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":11401200,"UNTRADEABLE":false,"ARMOUR":52,"HEALTH":156}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":156,"ARMOUR":52},"bySkill":{}}},{"item":{"id":2913,"name":"Perfect Infernal Boots","image":"items/armor-infernal-boots.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"ARMOUR":26,"HEALTH":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":78,"ARMOUR":26},"bySkill":{}}},{"item":{"id":2914,"name":"Perfect Infernal Helmet","image":"items/armor-infernal-helmet.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"ARMOUR":26,"HEALTH":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":78,"ARMOUR":26},"bySkill":{}}},{"item":{"id":2915,"name":"Perfect Infernal Gloves","image":"items/armor-infernal-gloves.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"ARMOUR":26,"HEALTH":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":78,"ARMOUR":26},"bySkill":{}}},{"item":{"id":2916,"name":"Perfect Infernal Shield","image":"items/armor-infernal-shield.png","skill":"Defense","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"ARMOUR":26,"HEALTH":78}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"HEALTH":78,"ARMOUR":26},"bySkill":{}}},{"item":{"id":2917,"name":"Perfect Infernal Spear","image":"items/spear-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":312,"COMBAT_EXP_PERCENT":78,"OCEAN_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"COMBAT_EXP_PERCENT":78,"DAMAGE":312,"ATTACK_SPEED":2.5,"OCEAN_BLOCK_PERCENT":15},"bySkill":{}}},{"item":{"id":2918,"name":"Perfect Infernal Scythe","image":"items/scythe-infernal.png","skill":"TwoHanded","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"TWO_HANDED":true,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":312,"COMBAT_EXP_PERCENT":78,"OCEAN_DAMAGE_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"OCEAN_DAMAGE_PERCENT":15,"COMBAT_EXP_PERCENT":78,"DAMAGE":312,"ATTACK_SPEED":2.5},"bySkill":{}}},{"item":{"id":2919,"name":"Perfect Infernal Boomerang","image":"items/boomerang-infernal.png","skill":"Ranged","tier":8,"attributes":{"BUY_PRICE":0,"SELL_PRICE":7600800,"UNTRADEABLE":false,"ATTACK_SPEED":2.5,"DAMAGE":312,"COMBAT_EXP_PERCENT":78,"FOREST_BLOCK_PERCENT":15}},"charcoal":0,"compost":0,"arcanePowder":0,"petSnacks":0,"metalParts":0,"stats":{"global":{"FOREST_BLOCK_PERCENT":15,"COMBAT_EXP_PERCENT":78,"DAMAGE":312,"ATTACK_SPEED":2.5},"bySkill":{}}}]', 'public/list/item');
    request.listItemAttributes = () => requestWithFallback('[{"image":"/assets/misc/merchant.png","name":"Buy Price","technicalName":"BUY_PRICE"},{"image":"/assets/misc/coin.png","name":"Sell Price","technicalName":"SELL_PRICE"},{"image":"https://cdn-icons-png.flaticon.com/512/5448/5448211.png","name":"Duration","technicalName":"DURATION"},{"image":"https://cdn-icons-png.flaticon.com/512/9742/9742828.png","name":"Level","technicalName":"LEVEL"},{"image":"https://cdn-icons-png.flaticon.com/512/2842/2842219.png","name":"Two Handed","technicalName":"TWO_HANDED"},{"image":"/assets/misc/market.png","name":"Untradeable","technicalName":"UNTRADEABLE"},{"image":"https://cdn-icons-png.flaticon.com/512/3563/3563395.png","name":"Speed","technicalName":"SKILL_SPEED"},{"image":"https://cdn-icons-png.flaticon.com/512/3563/3563395.png","name":"Speed","technicalName":"ATTACK_SPEED"},{"image":"https://cdn-icons-png.flaticon.com/512/9743/9743017.png","name":"Damage","technicalName":"DAMAGE"},{"image":"https://cdn-icons-png.flaticon.com/512/2592/2592488.png","name":"Armour","technicalName":"ARMOUR"},{"image":"https://cdn-icons-png.flaticon.com/512/2589/2589054.png","name":"Health","technicalName":"HEALTH"},{"image":"https://cdn-icons-png.flaticon.com/512/1635/1635524.png","name":"Heal","technicalName":"HEAL"},{"image":"https://cdn-icons-png.flaticon.com/512/724/724811.png","name":"Bonus Level","technicalName":"BONUS_LEVEL"},{"image":"https://img.icons8.com/?size=48&id=12869&format=png","name":"Passive food consumption","technicalName":"PASSIVE_FOOD_CONSUMPTION"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Potion effect increase","technicalName":"INCREASED_POTION_EFFECT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Potion duration decrease","technicalName":"DECREASED_POTION_DURATION"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Base Combat Exp","technicalName":"COMBAT_EXP_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Percent Health","technicalName":"HEALTH_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Food Effect","technicalName":"FOOD_EFFECT_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Dungeon Damage","technicalName":"DUNGEON_DAMAGE_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Dungeon Block Chance","technicalName":"DUNGEON_BLOCK_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Key Preservation Chance","technicalName":"KEY_PRESERVATION_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Opulent chance","technicalName":"OPULENT_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Tier variety chance","technicalName":"TIER_VARIETY_CHANCE"},{"image":"https://img.icons8.com/?size=48&id=51821&format=png","name":"Bone carve chance","technicalName":"CARVE_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Multi Craft","technicalName":"MULTICRAFT_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Forest Damage","technicalName":"FOREST_DAMAGE_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Mountain Damage","technicalName":"MOUNTAIN_DAMAGE_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Ocean Damage","technicalName":"OCEAN_DAMAGE_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Forest Block Chance","technicalName":"FOREST_BLOCK_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Mountain Block Chance","technicalName":"MOUNTAIN_BLOCK_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Ocean Block Chance","technicalName":"OCEAN_BLOCK_PERCENT"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Gather Exp","technicalName":"DOUBLE_GATHER_EXP_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Crafting Exp","technicalName":"DOUBLE_CRAFT_EXP_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Combat Exp","technicalName":"DOUBLE_COMBAT_EXP_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Gather Loot","technicalName":"DOUBLE_GATHER_DROP_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Combat Loot","technicalName":"DOUBLE_COMBAT_DROP_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Global Efficiency","technicalName":"ALL_SKILL_EFFICIENCY_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Skill Efficiency","technicalName":"SPECIFIC_SKILL_EFFICIENCY_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Global Exp","technicalName":"ALL_SKILL_EXP_CHANCE"},{"image":"https://cdn-icons-png.flaticon.com/512/3012/3012388.png","name":"Crafting Preservation","technicalName":"CRAFT_PRESERVATION_CHANCE"}]', 'public/list/itemAttribute');
    request.listItemStats = () => requestWithFallback('["BONUS_LEVEL","DOUBLE_DROP_CHANCE","DOUBLE_EXP_CHANCE","EFFICIENCY_CHANCE","PRESERVATION_CHANCE","SKILL_SPEED","ARMOUR","COMBAT_EXP_PERCENT","DAMAGE","DECREASED_POTION_DURATION","DUNGEON_DAMAGE_PERCENT","FOOD_EFFECT_PERCENT","HEAL","HEALTH","HEALTH_PERCENT","INCREASED_POTION_EFFECT","PASSIVE_FOOD_CONSUMPTION","CARVE_CHANCE","OPULENT_CHANCE","TIER_VARIETY_CHANCE","MULTICRAFT_CHANCE","DUNGEON_BLOCK_PERCENT","KEY_PRESERVATION_CHANCE","ATTACK_SPEED","FOREST_DAMAGE_PERCENT","MOUNTAIN_DAMAGE_PERCENT","OCEAN_DAMAGE_PERCENT","FOREST_BLOCK_PERCENT","MOUNTAIN_BLOCK_PERCENT","OCEAN_BLOCK_PERCENT"]', 'public/list/itemStat');
    request.listMonsters = () => requestWithFallback('[{"id":1,"name":"Red Frog","image":"monsters/red-frog.png","attackStyle":"TwoHanded","level":10,"health":500,"attack":10,"armour":0,"speed":2.5},{"id":2,"name":"Leaf Hopper","image":"monsters/leaf-hopper.png","attackStyle":"TwoHanded","level":55,"health":1100,"attack":40,"armour":0,"speed":2},{"id":3,"name":"Snake","image":"monsters/black-snake.png","attackStyle":"Ranged","level":1,"health":300,"attack":5,"armour":0,"speed":3},{"id":4,"name":"Skeleton","image":"monsters/skeleton.png","attackStyle":"Ranged","level":10,"health":500,"attack":10,"armour":0,"speed":2.5},{"id":5,"name":"Tree Stump","image":"monsters/tree-stump.png","attackStyle":"TwoHanded","level":70,"health":1300,"attack":60,"armour":0,"speed":2},{"id":6,"name":"Ogre","image":"monsters/ogre.png","attackStyle":"Ranged","level":55,"health":1100,"attack":40,"armour":0,"speed":2},{"id":7,"name":"Goblin","image":"monsters/goblin.png","attackStyle":"Ranged","level":25,"health":700,"attack":15,"armour":0,"speed":2},{"id":8,"name":"Snail","image":"monsters/snail.png","attackStyle":"TwoHanded","level":1,"health":300,"attack":5,"armour":0,"speed":3},{"id":9,"name":"Green Slime","image":"monsters/green-slime.png","attackStyle":"TwoHanded","level":25,"health":700,"attack":15,"armour":0,"speed":2},{"id":10,"name":"Venus Flytrap","image":"monsters/venus-flytrap.png","attackStyle":"TwoHanded","level":85,"health":1500,"attack":90,"armour":0,"speed":2},{"id":11,"name":"Grey Wolf","image":"monsters/grey-wolf.png","attackStyle":"Ranged","level":70,"health":1300,"attack":60,"armour":0,"speed":2},{"id":12,"name":"Lady Beetle","image":"monsters/lady-beetle.png","attackStyle":"TwoHanded","level":40,"health":900,"attack":25,"armour":0,"speed":2},{"id":15,"name":"Goblin Chief","image":"monsters/goblin-chief.png","attackStyle":"Ranged","level":40,"health":900,"attack":25,"armour":0,"speed":2},{"id":17,"name":"Sea Jelly","image":"monsters/sea-jelly.png","attackStyle":"OneHanded","level":1,"health":300,"attack":5,"armour":0,"speed":3},{"id":18,"name":"Blue Slime","image":"monsters/blue-slime.png","attackStyle":"OneHanded","level":25,"health":700,"attack":15,"armour":0,"speed":2},{"id":19,"name":"Jellyfish","image":"monsters/jellyfish.png","attackStyle":"OneHanded","level":70,"health":1300,"attack":60,"armour":0,"speed":2},{"id":20,"name":"Ice Fairy","image":"monsters/ice-fairy.png","attackStyle":"OneHanded","level":40,"health":900,"attack":25,"armour":0,"speed":2},{"id":21,"name":"Hermit Crab","image":"monsters/hermit-crab.png","attackStyle":"OneHanded","level":10,"health":500,"attack":10,"armour":0,"speed":2.5},{"id":22,"name":"Coral Snail","image":"monsters/coral-snail.png","attackStyle":"OneHanded","level":55,"health":1100,"attack":40,"armour":0,"speed":2},{"id":23,"name":"Rock Dweller","image":"monsters/rock-dweller.png","attackStyle":"OneHanded","level":85,"health":1500,"attack":90,"armour":0,"speed":2},{"id":24,"name":"Griffin","image":"monsters/griffin.png","attackStyle":"Ranged","level":85,"health":1500,"attack":90,"armour":0,"speed":2},{"id":25,"name":"Treant","image":"monsters/treant.png","attackStyle":"TwoHanded","level":100,"health":1700,"attack":140,"armour":0,"speed":2},{"id":26,"name":"Efreet","image":"monsters/efreet.png","attackStyle":"Ranged","level":100,"health":1700,"attack":140,"armour":0,"speed":2},{"id":27,"name":"Frost Wolf","image":"monsters/frost-wolf.png","attackStyle":"OneHanded","level":100,"health":1700,"attack":140,"armour":0,"speed":2},{"id":200,"name":"Enraged Green Slime","image":"monsters/green-slime.png","attackStyle":"TwoHanded","level":25,"health":700,"attack":25,"armour":0,"speed":2},{"id":201,"name":"Lady Bettle the Beetle","image":"monsters/lady-beetle.png","attackStyle":"TwoHanded","level":40,"health":900,"attack":35,"armour":0,"speed":2},{"id":202,"name":"Enraged Leaf Hopper","image":"monsters/leaf-hopper.png","attackStyle":"TwoHanded","level":55,"health":1100,"attack":55,"armour":0,"speed":2},{"id":203,"name":"Enraged Tree Stump","image":"monsters/tree-stump.png","attackStyle":"TwoHanded","level":70,"health":1300,"attack":75,"armour":0,"speed":2},{"id":204,"name":"Enraged Venus Flytrap","image":"monsters/venus-flytrap.png","attackStyle":"TwoHanded","level":85,"health":1500,"attack":110,"armour":0,"speed":2},{"id":205,"name":"Enraged Treant","image":"monsters/treant.png","attackStyle":"TwoHanded","level":100,"health":1700,"attack":155,"armour":0,"speed":2},{"id":210,"name":"Enraged Goblin","image":"monsters/goblin.png","attackStyle":"Ranged","level":25,"health":700,"attack":25,"armour":0,"speed":2},{"id":211,"name":"Enraged Goblin Chief","image":"monsters/goblin-chief.png","attackStyle":"Ranged","level":40,"health":900,"attack":35,"armour":0,"speed":2},{"id":212,"name":"Enraged Ogre","image":"monsters/ogre.png","attackStyle":"Ranged","level":55,"health":1100,"attack":55,"armour":0,"speed":2},{"id":213,"name":"Enraged Grey Wolf","image":"monsters/grey-wolf.png","attackStyle":"Ranged","level":70,"health":1300,"attack":75,"armour":0,"speed":2},{"id":214,"name":"Enraged Griffin","image":"monsters/griffin.png","attackStyle":"Ranged","level":85,"health":1500,"attack":110,"armour":0,"speed":2},{"id":215,"name":"Enraged Efreet","image":"monsters/efreet.png","attackStyle":"Ranged","level":100,"health":1700,"attack":155,"armour":0,"speed":2},{"id":220,"name":"Enraged Blue Slime","image":"monsters/blue-slime.png","attackStyle":"OneHanded","level":25,"health":700,"attack":25,"armour":0,"speed":2},{"id":221,"name":"Enraged Ice Fairy","image":"monsters/ice-fairy.png","attackStyle":"OneHanded","level":40,"health":900,"attack":35,"armour":0,"speed":2},{"id":222,"name":"Enraged Coral Snail","image":"monsters/coral-snail.png","attackStyle":"OneHanded","level":55,"health":1100,"attack":55,"armour":0,"speed":2},{"id":223,"name":"Enraged Jellyfish","image":"monsters/jellyfish.png","attackStyle":"OneHanded","level":70,"health":1300,"attack":75,"armour":0,"speed":2},{"id":224,"name":"Enraged Rock Dweller","image":"monsters/rock-dweller.png","attackStyle":"OneHanded","level":85,"health":1500,"attack":110,"armour":0,"speed":2},{"id":225,"name":"Enraged Frost Wolf","image":"monsters/frost-wolf.png","attackStyle":"OneHanded","level":100,"health":1700,"attack":155,"armour":0,"speed":2},{"id":100,"name":"Dungeon Icicle","image":"monsters/icicle.png","attackStyle":null,"level":25,"health":900,"attack":25,"armour":0,"speed":2},{"id":101,"name":"Dungeon Ice Serpent","image":"monsters/ice-serpent.png","attackStyle":null,"level":25,"health":900,"attack":25,"armour":0,"speed":2},{"id":102,"name":"Dungeon Ice Fairy","image":"monsters/ice-fairy.png","attackStyle":null,"level":25,"health":900,"attack":25,"armour":0,"speed":2},{"id":103,"name":"Dungeon Hermit Crab","image":"monsters/hermit-crab.png","attackStyle":null,"level":55,"health":1300,"attack":60,"armour":0,"speed":2},{"id":104,"name":"Dungeon Sea Snail","image":"monsters/sea-snail.png","attackStyle":null,"level":55,"health":1300,"attack":60,"armour":0,"speed":2},{"id":105,"name":"Dungeon Rock Dweller","image":"monsters/rock-dweller.png","attackStyle":null,"level":55,"health":1300,"attack":60,"armour":0,"speed":2},{"id":106,"name":"Dungeon Grey Wolf","image":"monsters/grey-wolf.png","attackStyle":null,"level":70,"health":1500,"attack":90,"armour":0,"speed":2},{"id":107,"name":"Dungeon Ogre","image":"monsters/ogre.png","attackStyle":null,"level":70,"health":1500,"attack":90,"armour":0,"speed":2},{"id":108,"name":"Dungeon Cyclops","image":"monsters/cyclops.png","attackStyle":null,"level":70,"health":1500,"attack":90,"armour":0,"speed":2},{"id":109,"name":"Dungeon Ghoul","image":"monsters/ghoul.png","attackStyle":null,"level":40,"health":1100,"attack":40,"armour":0,"speed":2},{"id":110,"name":"Dungeon Spectre","image":"monsters/spectre.png","attackStyle":null,"level":40,"health":1100,"attack":40,"armour":0,"speed":2},{"id":111,"name":"Dungeon Skeleton","image":"monsters/skeleton.png","attackStyle":null,"level":40,"health":1100,"attack":40,"armour":0,"speed":2},{"id":112,"name":"Dungeon Red Imp","image":"monsters/red-imp.png","attackStyle":null,"level":85,"health":1700,"attack":140,"armour":0,"speed":2},{"id":113,"name":"Dungeon Efreet","image":"monsters/efreet.png","attackStyle":null,"level":85,"health":1700,"attack":140,"armour":0,"speed":2},{"id":114,"name":"Dungeon Cerberus","image":"monsters/cerberus.png","attackStyle":null,"level":85,"health":1700,"attack":140,"armour":0,"speed":2},{"id":115,"name":"Dungeon Mimic","image":"monsters/mimic.png","attackStyle":null,"level":100,"health":1900,"attack":210,"armour":0,"speed":2},{"id":116,"name":"Dungeon Genie","image":"monsters/genie.png","attackStyle":null,"level":100,"health":1900,"attack":210,"armour":0,"speed":2},{"id":117,"name":"Dungeon Wizard","image":"monsters/wizard.png","attackStyle":null,"level":100,"health":1900,"attack":210,"armour":0,"speed":2}]', 'public/list/monster');
    request.listPets = () => requestWithFallback('[{"id":10,"name":"Ghostab","family":"Ghostab","image":"pets/t1/ghostab.gif","tier":2,"power":150,"abilityName1":"ore","abilityValue1":2,"abilityName2":"flowers","abilityValue2":2},{"id":11,"name":"Caterpillow","family":"Caterpillow","image":"pets/t1/caterpillow.gif","tier":1,"power":100,"abilityName1":"flowers","abilityValue1":1,"abilityName2":"wood","abilityValue2":1},{"id":12,"name":"Darkwing","family":"Darkwing","image":"pets/t1/darkwing.gif","tier":1,"power":100,"abilityName1":"bones","abilityValue1":1,"abilityName2":"veges","abilityValue2":1},{"id":13,"name":"Mandrake","family":"Mandrake","image":"pets/t1/mandrake.gif","tier":2,"power":150,"abilityName1":"veges","abilityValue1":2,"abilityName2":"flowers","abilityValue2":2},{"id":14,"name":"Mibox","family":"Mibox","image":"pets/t1/mibox.gif","tier":1,"power":100,"abilityName1":"bones","abilityValue1":1,"abilityName2":"ore","abilityValue2":1},{"id":15,"name":"Napxolotl","family":"Napxolotl","image":"pets/t1/napxolotl.gif","tier":2,"power":150,"abilityName1":"fish","abilityValue1":2,"abilityName2":"wood","abilityValue2":2},{"id":16,"name":"Otomatoad","family":"Otomatoad","image":"pets/t1/otomatoad.gif","tier":1,"power":100,"abilityName1":"flowers","abilityValue1":1,"abilityName2":"fish","abilityValue2":1},{"id":17,"name":"Stoddler","family":"Stoddler","image":"pets/t1/stoddler.gif","tier":1,"power":100,"abilityName1":"ore","abilityValue1":1,"abilityName2":"wood","abilityValue2":1},{"id":18,"name":"Teeblin","family":"Teeblin","image":"pets/t1/teeblin.gif","tier":1,"power":100,"abilityName1":"ore","abilityValue1":1,"abilityName2":"fish","abilityValue2":1},{"id":50,"name":"Blancor","family":"Darkwing","image":"pets/t2/blancor.gif","tier":2,"power":150,"abilityName1":"bones","abilityValue1":2,"abilityName2":"veges","abilityValue2":2},{"id":51,"name":"Larvaby","family":"Caterpillow","image":"pets/t2/larvaby.gif","tier":2,"power":150,"abilityName1":"flowers","abilityValue1":2,"abilityName2":"wood","abilityValue2":2},{"id":52,"name":"Stompadour","family":"Stoddler","image":"pets/t2/stompadour.gif","tier":2,"power":150,"abilityName1":"ore","abilityValue1":2,"abilityName2":"wood","abilityValue2":2},{"id":53,"name":"Fropano","family":"Otomatoad","image":"pets/t2/fropano.gif","tier":2,"power":150,"abilityName1":"flowers","abilityValue1":2,"abilityName2":"fish","abilityValue2":2},{"id":54,"name":"Michest","family":"Mibox","image":"pets/t2/michest.gif","tier":2,"power":150,"abilityName1":"bones","abilityValue1":2,"abilityName2":"ore","abilityValue2":2},{"id":55,"name":"Boo","family":"Boo","image":"pets/t2/boo.gif","tier":2,"power":150,"abilityName1":"ore","abilityValue1":2,"abilityName2":"veges","abilityValue2":2},{"id":56,"name":"Frufu","family":"Frufu","image":"pets/t2/frufu.gif","tier":2,"power":150,"abilityName1":"veges","abilityValue1":2,"abilityName2":"wood","abilityValue2":2},{"id":57,"name":"Flumph","family":"Flumph","image":"pets/t2/flumph.gif","tier":2,"power":150,"abilityName1":"veges","abilityValue1":2,"abilityName2":"fish","abilityValue2":2},{"id":58,"name":"Byte","family":"Teeblin","image":"pets/t2/byte.gif","tier":2,"power":150,"abilityName1":"ore","abilityValue1":2,"abilityName2":"fish","abilityValue2":2},{"id":100,"name":"Necroth","family":"Darkwing","image":"pets/t3/necroth.gif","tier":3,"power":200,"abilityName1":"bones","abilityValue1":3,"abilityName2":"veges","abilityValue2":3},{"id":101,"name":"Cottonfly","family":"Caterpillow","image":"pets/t3/cottonfly.gif","tier":3,"power":200,"abilityName1":"flowers","abilityValue1":3,"abilityName2":"wood","abilityValue2":3},{"id":102,"name":"Baulder","family":"Stoddler","image":"pets/t3/baulder.gif","tier":3,"power":200,"abilityName1":"ore","abilityValue1":3,"abilityName2":"wood","abilityValue2":3},{"id":103,"name":"Croakle","family":"Otomatoad","image":"pets/t3/croakle.gif","tier":3,"power":200,"abilityName1":"flowers","abilityValue1":3,"abilityName2":"fish","abilityValue2":3},{"id":104,"name":"Mimic","family":"Mibox","image":"pets/t3/mimic.gif","tier":3,"power":200,"abilityName1":"bones","abilityValue1":3,"abilityName2":"ore","abilityValue2":3},{"id":105,"name":"Wraithmare","family":"Boo","image":"pets/t3/wraithmare.gif","tier":3,"power":200,"abilityName1":"ore","abilityValue1":3,"abilityName2":"veges","abilityValue2":3},{"id":106,"name":"Hexcalibur","family":"Ghostab","image":"pets/t3/hexcalibur.gif","tier":3,"power":200,"abilityName1":"ore","abilityValue1":3,"abilityName2":"flowers","abilityValue2":3},{"id":107,"name":"Boxolotl","family":"Napxolotl","image":"pets/t3/boxolotl.gif","tier":3,"power":200,"abilityName1":"fish","abilityValue1":3,"abilityName2":"wood","abilityValue2":3},{"id":108,"name":"Zero","family":"Teeblin","image":"pets/t3/zero.gif","tier":3,"power":200,"abilityName1":"ore","abilityValue1":3,"abilityName2":"fish","abilityValue2":3},{"id":109,"name":"Sweetpea","family":"Mandrake","image":"pets/t3/sweetpea.gif","tier":3,"power":200,"abilityName1":"veges","abilityValue1":3,"abilityName2":"flowers","abilityValue2":3},{"id":110,"name":"Willow","family":"Frufu","image":"pets/t3/willow.gif","tier":3,"power":200,"abilityName1":"wood","abilityValue1":3,"abilityName2":"veges","abilityValue2":3},{"id":111,"name":"Chefers","family":"Flumph","image":"pets/t3/chefers.gif","tier":3,"power":200,"abilityName1":"veges","abilityValue1":3,"abilityName2":"fish","abilityValue2":3},{"id":112,"name":"Hypneko","family":"Hypneko","image":"pets/t3/hypneko.gif","tier":3,"power":200,"abilityName1":"bones","abilityValue1":3,"abilityName2":"fish","abilityValue2":3},{"id":113,"name":"Strawjack","family":"Strawjack","image":"pets/t3/strawjack.gif","tier":3,"power":200,"abilityName1":"veges","abilityValue1":6,"abilityName2":null,"abilityValue2":null},{"id":114,"name":"Wanderer","family":"Wanderer","image":"pets/t3/wanderer.gif","tier":3,"power":200,"abilityName1":"fish","abilityValue1":6,"abilityName2":null,"abilityValue2":null},{"id":115,"name":"Teddy","family":"Teddy","image":"pets/t3/teddy.gif","tier":3,"power":200,"abilityName1":"wood","abilityValue1":6,"abilityName2":null,"abilityValue2":null},{"id":116,"name":"Daisy","family":"Daisy","image":"pets/t3/daisy.gif","tier":3,"power":200,"abilityName1":"flowers","abilityValue1":6,"abilityName2":null,"abilityValue2":null},{"id":117,"name":"Grimbone","family":"Grimbone","image":"pets/t3/grimbone.gif","tier":3,"power":200,"abilityName1":"bones","abilityValue1":6,"abilityName2":null,"abilityValue2":null},{"id":118,"name":"Shroom","family":"Shroom","image":"pets/t3/shroom.gif","tier":3,"power":200,"abilityName1":"bones","abilityValue1":3,"abilityName2":"flowers","abilityValue2":3},{"id":119,"name":"Deowl","family":"Deowl","image":"pets/t3/deowl.gif","tier":3,"power":200,"abilityName1":"bones","abilityValue1":3,"abilityName2":"wood","abilityValue2":3},{"id":120,"name":"Rageon","family":"Rageon","image":"pets/t3/rageon.gif","tier":3,"power":200,"abilityName1":"ore","abilityValue1":6,"abilityName2":null,"abilityValue2":null}]', 'public/list/pet');
    request.listPetPassives = () => requestWithFallback('[{"id":10,"name":"Melee Block 1","tier":1,"statName":"meleeDefense","statValue":2},{"id":11,"name":"Melee Block 2","tier":2,"statName":"meleeDefense","statValue":4},{"id":12,"name":"Melee Block 3","tier":3,"statName":"meleeDefense","statValue":6},{"id":13,"name":"Melee Block 4","tier":4,"statName":"meleeDefense","statValue":8},{"id":20,"name":"Ranged Evade 1","tier":1,"statName":"rangedDefense","statValue":2},{"id":21,"name":"Ranged Evade 2","tier":2,"statName":"rangedDefense","statValue":4},{"id":22,"name":"Ranged Evade 3","tier":3,"statName":"rangedDefense","statValue":6},{"id":23,"name":"Ranged Evade 4","tier":4,"statName":"rangedDefense","statValue":8},{"id":30,"name":"Magic Resist 1","tier":1,"statName":"magicDefense","statValue":2},{"id":31,"name":"Magic Resist 2","tier":2,"statName":"magicDefense","statValue":4},{"id":32,"name":"Magic Resist 3","tier":3,"statName":"magicDefense","statValue":6},{"id":33,"name":"Magic Resist 4","tier":4,"statName":"magicDefense","statValue":8},{"id":40,"name":"Hunger 1","tier":1,"statName":"hunger","statValue":6},{"id":41,"name":"Hunger 2","tier":2,"statName":"hunger","statValue":12},{"id":42,"name":"Hunger 3","tier":3,"statName":"hunger","statValue":18},{"id":43,"name":"Hunger 4","tier":4,"statName":"hunger","statValue":24},{"id":50,"name":"Egg Find 1","tier":1,"statName":"eggFind","statValue":2},{"id":51,"name":"Egg Find 2","tier":2,"statName":"eggFind","statValue":4},{"id":52,"name":"Egg Find 3","tier":3,"statName":"eggFind","statValue":6},{"id":53,"name":"Egg Find 4","tier":4,"statName":"eggFind","statValue":8},{"id":60,"name":"Loot Find 1","tier":1,"statName":"itemFind","statValue":2},{"id":61,"name":"Loot Find 2","tier":2,"statName":"itemFind","statValue":4},{"id":62,"name":"Loot Find 3","tier":3,"statName":"itemFind","statValue":6},{"id":63,"name":"Loot Find 4","tier":4,"statName":"itemFind","statValue":8}]', 'public/list/petPassive');
    request.listRecipes = () => requestWithFallback('[{"id":10,"name":"Pine Log","image":"items/wood-pine.png","url":"/skill/1/action/10"},{"id":11,"name":"Spruce Log","image":"items/wood-spruce.png","url":"/skill/1/action/11"},{"id":12,"name":"Birch Log","image":"items/wood-birch.png","url":"/skill/1/action/12"},{"id":13,"name":"Teak Log","image":"items/wood-teak.png","url":"/skill/1/action/13"},{"id":14,"name":"Mahogany Log","image":"items/wood-mahogany.png","url":"/skill/1/action/14"},{"id":15,"name":"Ironbark Log","image":"items/wood-ironbark.png","url":"/skill/1/action/15"},{"id":16,"name":"Redwood Log","image":"items/wood-redwood.png","url":"/skill/1/action/16"},{"id":17,"name":"Ancient Log","image":"items/wood-ancient.png","url":"/skill/1/action/17"},{"id":20,"name":"Copper Ore","image":"items/rock-copper.png","url":"/skill/2/action/20"},{"id":21,"name":"Iron Ore","image":"items/rock-iron.png","url":"/skill/2/action/21"},{"id":22,"name":"Silver Ore","image":"items/rock-silver.png","url":"/skill/2/action/22"},{"id":23,"name":"Gold Ore","image":"items/rock-gold.png","url":"/skill/2/action/23"},{"id":24,"name":"Cobalt Ore","image":"items/rock-cobalt.png","url":"/skill/2/action/24"},{"id":26,"name":"Obsidian Ore","image":"items/rock-obsidian.png","url":"/skill/2/action/25"},{"id":27,"name":"Astral Ore","image":"items/rock-astral.png","url":"/skill/2/action/26"},{"id":28,"name":"Infernal Ore","image":"items/rock-infernal.png","url":"/skill/2/action/27"},{"id":40,"name":"Copper Bar","image":"items/bar-copper.png","url":"/skill/3/action/30"},{"id":41,"name":"Iron Bar","image":"items/bar-iron.png","url":"/skill/3/action/31"},{"id":42,"name":"Silver Bar","image":"items/bar-silver.png","url":"/skill/3/action/32"},{"id":43,"name":"Gold Bar","image":"items/bar-gold.png","url":"/skill/3/action/33"},{"id":44,"name":"Cobalt Bar","image":"items/bar-cobalt.png","url":"/skill/3/action/34"},{"id":45,"name":"Obsidian Bar","image":"items/bar-obsidian.png","url":"/skill/3/action/35"},{"id":46,"name":"Astral Bar","image":"items/bar-astral.png","url":"/skill/3/action/36"},{"id":47,"name":"Infernal Bar","image":"items/bar-infernal.png","url":"/skill/3/action/37"},{"id":305,"name":"Raw Shrimp","image":"items/raw-shrimp.png","url":"/skill/9/action/40"},{"id":308,"name":"Raw Cod","image":"items/raw-cod.png","url":"/skill/9/action/41"},{"id":311,"name":"Raw Salmon","image":"items/raw-salmon.png","url":"/skill/9/action/42"},{"id":314,"name":"Raw Bass","image":"items/raw-bass.png","url":"/skill/9/action/43"},{"id":317,"name":"Raw Lobster","image":"items/raw-lobster.png","url":"/skill/9/action/44"},{"id":320,"name":"Raw Swordfish","image":"items/raw-swordfish.png","url":"/skill/9/action/45"},{"id":325,"name":"Raw Shark","image":"items/raw-shark.png","url":"/skill/9/action/46"},{"id":342,"name":"Raw King Crab","image":"items/raw-king-crab.png","url":"/skill/9/action/47"},{"id":306,"name":"Cooked Shrimp","image":"items/food-cooked-shrimp.png","url":"/skill/10/action/50"},{"id":309,"name":"Cooked Cod","image":"items/food-cooked-cod.png","url":"/skill/10/action/51"},{"id":312,"name":"Cooked Salmon","image":"items/food-cooked-salmon.png","url":"/skill/10/action/52"},{"id":315,"name":"Cooked Bass","image":"items/food-cooked-bass.png","url":"/skill/10/action/53"},{"id":318,"name":"Cooked Lobster","image":"items/food-cooked-lobster.png","url":"/skill/10/action/54"},{"id":321,"name":"Cooked Swordfish","image":"items/food-cooked-swordfish.png","url":"/skill/10/action/55"},{"id":326,"name":"Cooked Shark","image":"items/food-cooked-shark.png","url":"/skill/10/action/57"},{"id":343,"name":"Cooked King Crab","image":"items/food-cooked-king-crab.png","url":"/skill/10/action/58"},{"id":328,"name":"Shrimp Pie","image":"items/pie-shrimp.png","url":"/skill/10/action/60"},{"id":329,"name":"Cod Pie","image":"items/pie-cod.png","url":"/skill/10/action/61"},{"id":330,"name":"Salmon Pie","image":"items/pie-salmon.png","url":"/skill/10/action/62"},{"id":331,"name":"Bass Pie","image":"items/pie-bass.png","url":"/skill/10/action/63"},{"id":332,"name":"Lobster Pie","image":"items/pie-lobster.png","url":"/skill/10/action/64"},{"id":333,"name":"Swordfish Pie","image":"items/pie-swordfish.png","url":"/skill/10/action/65"},{"id":334,"name":"Shark Pie","image":"items/pie-shark.png","url":"/skill/10/action/66"},{"id":345,"name":"King Crab Pie","image":"items/pie-king-crab.png","url":"/skill/10/action/67"},{"id":70,"name":"Ruby Essence","image":"items/essence-ruby.png","url":"/skill/11/action/70"},{"id":71,"name":"Topaz Essence","image":"items/essence-topaz.png","url":"/skill/11/action/71"},{"id":72,"name":"Emerald Essence","image":"items/essence-emerald.png","url":"/skill/11/action/72"},{"id":73,"name":"Amethyst Essence","image":"items/essence-amethyst.png","url":"/skill/11/action/73"},{"id":74,"name":"Citrine Essence","image":"items/essence-citrine.png","url":"/skill/11/action/74"},{"id":75,"name":"Diamond Essence","image":"items/essence-diamond.png","url":"/skill/11/action/75"},{"id":76,"name":"Moonstone Essence","image":"items/essence-moonstone.png","url":"/skill/11/action/76"},{"id":77,"name":"Onyx Essence","image":"items/essence-onyx.png","url":"/skill/11/action/77"},{"id":1100,"name":"Savage Looting Tome 1","image":"items/tome-one-savage-looting.png","url":"/skill/11/action/80"},{"id":1101,"name":"Bountiful Harvest Tome 1","image":"items/tome-one-bountiful-harvest.png","url":"/skill/11/action/81"},{"id":1102,"name":"Opulent Crafting Tome 1","image":"items/tome-one-opulent-crafting.png","url":"/skill/11/action/82"},{"id":1104,"name":"Insatiable Power Tome 1","image":"items/tome-one-insatiable-power.png","url":"/skill/11/action/84"},{"id":1105,"name":"Potent Concoction Tome 1","image":"items/tome-one-potent-concoction.png","url":"/skill/11/action/85"},{"id":80,"name":"Dungeon Key 25","image":"items/key-emerald.png","url":"/skill/11/action/90"},{"id":81,"name":"Dungeon Key 40","image":"items/key-amethyst.png","url":"/skill/11/action/91"},{"id":82,"name":"Dungeon Key 55","image":"items/key-citrine.png","url":"/skill/11/action/92"},{"id":83,"name":"Dungeon Key 70","image":"items/key-diamond.png","url":"/skill/11/action/93"},{"id":84,"name":"Dungeon Key 85","image":"items/key-moonstone.png","url":"/skill/11/action/94"},{"id":85,"name":"Dungeon Key 100","image":"items/key-onyx.png","url":"/skill/11/action/95"},{"id":100,"name":"Copper Helmet","image":"items/armor-copper-helmet.png","url":"/skill/4/action/100"},{"id":101,"name":"Copper Boots","image":"items/armor-copper-boots.png","url":"/skill/4/action/101"},{"id":102,"name":"Copper Body","image":"items/armor-copper-body.png","url":"/skill/4/action/102"},{"id":103,"name":"Copper Gloves","image":"items/armor-copper-gloves.png","url":"/skill/4/action/103"},{"id":104,"name":"Copper Shield","image":"items/armor-copper-shield.png","url":"/skill/4/action/104"},{"id":110,"name":"Iron Helmet","image":"items/armor-iron-helmet.png","url":"/skill/4/action/110"},{"id":111,"name":"Iron Boots","image":"items/armor-iron-boots.png","url":"/skill/4/action/111"},{"id":112,"name":"Iron Body","image":"items/armor-iron-body.png","url":"/skill/4/action/112"},{"id":113,"name":"Iron Gloves","image":"items/armor-iron-gloves.png","url":"/skill/4/action/113"},{"id":114,"name":"Iron Shield","image":"items/armor-iron-shield.png","url":"/skill/4/action/114"},{"id":120,"name":"Silver Helmet","image":"items/armor-silver-helmet.png","url":"/skill/4/action/120"},{"id":121,"name":"Silver Boots","image":"items/armor-silver-boots.png","url":"/skill/4/action/121"},{"id":122,"name":"Silver Body","image":"items/armor-silver-body.png","url":"/skill/4/action/122"},{"id":123,"name":"Silver Gloves","image":"items/armor-silver-gloves.png","url":"/skill/4/action/123"},{"id":124,"name":"Silver Shield","image":"items/armor-silver-shield.png","url":"/skill/4/action/124"},{"id":130,"name":"Gold Helmet","image":"items/armor-gold-helmet.png","url":"/skill/4/action/130"},{"id":131,"name":"Gold Boots","image":"items/armor-gold-boots.png","url":"/skill/4/action/131"},{"id":132,"name":"Gold Body","image":"items/armor-gold-body.png","url":"/skill/4/action/132"},{"id":133,"name":"Gold Gloves","image":"items/armor-gold-gloves.png","url":"/skill/4/action/133"},{"id":134,"name":"Gold Shield","image":"items/armor-gold-shield.png","url":"/skill/4/action/134"},{"id":140,"name":"Cobalt Body","image":"items/armor-cobalt-body.png","url":"/skill/4/action/140"},{"id":141,"name":"Cobalt Boots","image":"items/armor-cobalt-boots.png","url":"/skill/4/action/141"},{"id":142,"name":"Cobalt Helmet","image":"items/armor-cobalt-helmet.png","url":"/skill/4/action/142"},{"id":143,"name":"Cobalt Gloves","image":"items/armor-cobalt-gloves.png","url":"/skill/4/action/143"},{"id":144,"name":"Cobalt Shield","image":"items/armor-cobalt-shield.png","url":"/skill/4/action/144"},{"id":150,"name":"Obsidian Body","image":"items/armor-obsidian-body.png","url":"/skill/4/action/150"},{"id":151,"name":"Obsidian Boots","image":"items/armor-obsidian-boots.png","url":"/skill/4/action/151"},{"id":152,"name":"Obsidian Helmet","image":"items/armor-obsidian-helmet.png","url":"/skill/4/action/152"},{"id":153,"name":"Obsidian Gloves","image":"items/armor-obsidian-gloves.png","url":"/skill/4/action/153"},{"id":154,"name":"Obsidian Shield","image":"items/armor-obsidian-shield.png","url":"/skill/4/action/154"},{"id":160,"name":"Astral Body","image":"items/armor-astral-body.png","url":"/skill/4/action/160"},{"id":161,"name":"Astral Boots","image":"items/armor-astral-boots.png","url":"/skill/4/action/161"},{"id":162,"name":"Astral Helmet","image":"items/armor-astral-helmet.png","url":"/skill/4/action/162"},{"id":163,"name":"Astral Gloves","image":"items/armor-astral-gloves.png","url":"/skill/4/action/163"},{"id":164,"name":"Astral Shield","image":"items/armor-astral-shield.png","url":"/skill/4/action/164"},{"id":170,"name":"Infernal Body","image":"items/armor-infernal-body.png","url":"/skill/4/action/170"},{"id":171,"name":"Infernal Boots","image":"items/armor-infernal-boots.png","url":"/skill/4/action/171"},{"id":172,"name":"Infernal Helmet","image":"items/armor-infernal-helmet.png","url":"/skill/4/action/172"},{"id":173,"name":"Infernal Gloves","image":"items/armor-infernal-gloves.png","url":"/skill/4/action/173"},{"id":174,"name":"Infernal Shield","image":"items/armor-infernal-shield.png","url":"/skill/4/action/174"},{"id":203,"name":"Copper Hammer","image":"items/hammer-copper.png","url":"/skill/4/action/200"},{"id":201,"name":"Copper Hatchet","image":"items/hatchet-copper.png","url":"/skill/4/action/201"},{"id":202,"name":"Copper Sword","image":"items/sword-copper.png","url":"/skill/4/action/202"},{"id":204,"name":"Copper Rod","image":"items/tool-copper-rod.png","url":"/skill/4/action/203"},{"id":200,"name":"Copper Pickaxe","image":"items/pickaxe-copper.png","url":"/skill/4/action/204"},{"id":205,"name":"Copper Spade","image":"items/tool-copper-spade.png","url":"/skill/4/action/205"},{"id":206,"name":"Copper Bow","image":"items/bow-copper.png","url":"/skill/4/action/206"},{"id":207,"name":"Copper Spear","image":"items/spear-copper.png","url":"/skill/4/action/207"},{"id":208,"name":"Copper Scythe","image":"items/scythe-copper.png","url":"/skill/4/action/208"},{"id":209,"name":"Copper Boomerang","image":"items/boomerang-copper.png","url":"/skill/4/action/209"},{"id":213,"name":"Iron Hammer","image":"items/hammer-iron.png","url":"/skill/4/action/210"},{"id":211,"name":"Iron Hatchet","image":"items/hatchet-iron.png","url":"/skill/4/action/211"},{"id":212,"name":"Iron Sword","image":"items/sword-iron.png","url":"/skill/4/action/212"},{"id":214,"name":"Iron Rod","image":"items/tool-iron-rod.png","url":"/skill/4/action/213"},{"id":210,"name":"Iron Pickaxe","image":"items/pickaxe-iron.png","url":"/skill/4/action/214"},{"id":215,"name":"Iron Spade","image":"items/tool-iron-spade.png","url":"/skill/4/action/215"},{"id":216,"name":"Iron Bow","image":"items/bow-iron.png","url":"/skill/4/action/216"},{"id":217,"name":"Iron Spear","image":"items/spear-iron.png","url":"/skill/4/action/217"},{"id":218,"name":"Iron Scythe","image":"items/scythe-iron.png","url":"/skill/4/action/218"},{"id":219,"name":"Iron Boomerang","image":"items/boomerang-iron.png","url":"/skill/4/action/219"},{"id":223,"name":"Silver Hammer","image":"items/hammer-silver.png","url":"/skill/4/action/220"},{"id":221,"name":"Silver Hatchet","image":"items/hatchet-silver.png","url":"/skill/4/action/221"},{"id":222,"name":"Silver Sword","image":"items/sword-silver.png","url":"/skill/4/action/222"},{"id":224,"name":"Silver Rod","image":"items/tool-silver-rod.png","url":"/skill/4/action/223"},{"id":220,"name":"Silver Pickaxe","image":"items/pickaxe-silver.png","url":"/skill/4/action/224"},{"id":225,"name":"Silver Spade","image":"items/tool-silver-spade.png","url":"/skill/4/action/225"},{"id":226,"name":"Silver Bow","image":"items/bow-silver.png","url":"/skill/4/action/226"},{"id":227,"name":"Silver Spear","image":"items/spear-silver.png","url":"/skill/4/action/227"},{"id":228,"name":"Silver Scythe","image":"items/scythe-silver.png","url":"/skill/4/action/228"},{"id":229,"name":"Silver Boomerang","image":"items/boomerang-silver.png","url":"/skill/4/action/229"},{"id":233,"name":"Gold Hammer","image":"items/hammer-gold.png","url":"/skill/4/action/230"},{"id":231,"name":"Gold Hatchet","image":"items/hatchet-gold.png","url":"/skill/4/action/231"},{"id":232,"name":"Gold Sword","image":"items/sword-gold.png","url":"/skill/4/action/232"},{"id":234,"name":"Gold Rod","image":"items/tool-gold-rod.png","url":"/skill/4/action/233"},{"id":230,"name":"Gold Pickaxe","image":"items/pickaxe-gold.png","url":"/skill/4/action/234"},{"id":235,"name":"Gold Spade","image":"items/tool-gold-spade.png","url":"/skill/4/action/235"},{"id":236,"name":"Gold Bow","image":"items/bow-gold.png","url":"/skill/4/action/236"},{"id":237,"name":"Gold Spear","image":"items/spear-gold.png","url":"/skill/4/action/237"},{"id":238,"name":"Gold Scythe","image":"items/scythe-gold.png","url":"/skill/4/action/238"},{"id":239,"name":"Gold Boomerang","image":"items/boomerang-gold.png","url":"/skill/4/action/239"},{"id":243,"name":"Cobalt Hammer","image":"items/hammer-cobalt.png","url":"/skill/4/action/240"},{"id":241,"name":"Cobalt Hatchet","image":"items/hatchet-cobalt.png","url":"/skill/4/action/241"},{"id":242,"name":"Cobalt Sword","image":"items/sword-cobalt.png","url":"/skill/4/action/242"},{"id":244,"name":"Cobalt Rod","image":"items/tool-cobalt-rod.png","url":"/skill/4/action/243"},{"id":240,"name":"Cobalt Pickaxe","image":"items/pickaxe-cobalt.png","url":"/skill/4/action/244"},{"id":245,"name":"Cobalt Spade","image":"items/tool-cobalt-spade.png","url":"/skill/4/action/245"},{"id":246,"name":"Cobalt Bow","image":"items/bow-cobalt.png","url":"/skill/4/action/246"},{"id":247,"name":"Cobalt Spear","image":"items/spear-cobalt.png","url":"/skill/4/action/247"},{"id":248,"name":"Cobalt Scythe","image":"items/scythe-cobalt.png","url":"/skill/4/action/248"},{"id":249,"name":"Cobalt Boomerang","image":"items/boomerang-cobalt.png","url":"/skill/4/action/249"},{"id":263,"name":"Obsidian Hammer","image":"items/hammer-obsidian.png","url":"/skill/4/action/250"},{"id":261,"name":"Obsidian Hatchet","image":"items/hatchet-obsidian.png","url":"/skill/4/action/251"},{"id":262,"name":"Obsidian Sword","image":"items/sword-obsidian.png","url":"/skill/4/action/252"},{"id":264,"name":"Obsidian Rod","image":"items/tool-obsidian-rod.png","url":"/skill/4/action/253"},{"id":260,"name":"Obsidian Pickaxe","image":"items/pickaxe-obsidian.png","url":"/skill/4/action/254"},{"id":265,"name":"Obsidian Spade","image":"items/tool-obsidian-spade.png","url":"/skill/4/action/255"},{"id":266,"name":"Obsidian Bow","image":"items/bow-obsidian.png","url":"/skill/4/action/256"},{"id":267,"name":"Obsidian Spear","image":"items/spear-obsidian.png","url":"/skill/4/action/257"},{"id":268,"name":"Obsidian Scythe","image":"items/scythe-obsidian.png","url":"/skill/4/action/258"},{"id":269,"name":"Obsidian Boomerang","image":"items/boomerang-obsidian.png","url":"/skill/4/action/259"},{"id":273,"name":"Astral Hammer","image":"items/hammer-astral.png","url":"/skill/4/action/260"},{"id":271,"name":"Astral Hatchet","image":"items/hatchet-astral.png","url":"/skill/4/action/261"},{"id":272,"name":"Astral Sword","image":"items/sword-astral.png","url":"/skill/4/action/262"},{"id":274,"name":"Astral Rod","image":"items/tool-astral-rod.png","url":"/skill/4/action/263"},{"id":270,"name":"Astral Pickaxe","image":"items/pickaxe-astral.png","url":"/skill/4/action/264"},{"id":275,"name":"Astral Spade","image":"items/tool-astral-spade.png","url":"/skill/4/action/265"},{"id":276,"name":"Astral Bow","image":"items/bow-astral.png","url":"/skill/4/action/266"},{"id":277,"name":"Astral Spear","image":"items/spear-astral.png","url":"/skill/4/action/267"},{"id":278,"name":"Astral Scythe","image":"items/scythe-astral.png","url":"/skill/4/action/268"},{"id":279,"name":"Astral Boomerang","image":"items/boomerang-astral.png","url":"/skill/4/action/269"},{"id":283,"name":"Infernal Hammer","image":"items/hammer-infernal.png","url":"/skill/4/action/270"},{"id":281,"name":"Infernal Hatchet","image":"items/hatchet-infernal.png","url":"/skill/4/action/271"},{"id":282,"name":"Infernal Sword","image":"items/sword-infernal.png","url":"/skill/4/action/272"},{"id":284,"name":"Infernal Rod","image":"items/tool-infernal-rod.png","url":"/skill/4/action/273"},{"id":280,"name":"Infernal Pickaxe","image":"items/pickaxe-infernal.png","url":"/skill/4/action/274"},{"id":285,"name":"Infernal Spade","image":"items/tool-infernal-spade.png","url":"/skill/4/action/275"},{"id":286,"name":"Infernal Bow","image":"items/bow-infernal.png","url":"/skill/4/action/276"},{"id":287,"name":"Infernal Spear","image":"items/spear-infernal.png","url":"/skill/4/action/277"},{"id":288,"name":"Infernal Scythe","image":"items/scythe-infernal.png","url":"/skill/4/action/278"},{"id":289,"name":"Infernal Boomerang","image":"items/boomerang-infernal.png","url":"/skill/4/action/279"},{"id":350,"name":"Peony","image":"items/flower-peony.png","url":"/skill/13/action/350"},{"id":351,"name":"Tulip","image":"items/flower-tulip.png","url":"/skill/13/action/351"},{"id":352,"name":"Rose","image":"items/flower-rose.png","url":"/skill/13/action/352"},{"id":353,"name":"Daisy","image":"items/flower-daisy.png","url":"/skill/13/action/353"},{"id":354,"name":"Lilac","image":"items/flower-lilac.png","url":"/skill/13/action/354"},{"id":355,"name":"Hyacinth","image":"items/flower-hyacinth.png","url":"/skill/13/action/355"},{"id":356,"name":"Nemesia","image":"items/flower-nemesia.png","url":"/skill/13/action/356"},{"id":357,"name":"Snapdragon","image":"items/flower-snapdragon.png","url":"/skill/13/action/357"},{"id":360,"name":"Potato","image":"items/food-potato.png","url":"/skill/13/action/360"},{"id":361,"name":"Radish","image":"items/food-radish.png","url":"/skill/13/action/361"},{"id":362,"name":"Onion","image":"items/food-onion.png","url":"/skill/13/action/362"},{"id":363,"name":"Carrot","image":"items/food-carrot.png","url":"/skill/13/action/363"},{"id":364,"name":"Tomato","image":"items/food-tomato.png","url":"/skill/13/action/364"},{"id":365,"name":"Corn","image":"items/food-corn.png","url":"/skill/13/action/365"},{"id":366,"name":"Pumpkin","image":"items/food-pumpkin.png","url":"/skill/13/action/366"},{"id":367,"name":"Chilli","image":"items/food-chilli.png","url":"/skill/13/action/367"},{"id":760,"name":"Basic Health Potion","image":"items/potion-basic-health.png","url":"/skill/12/action/710"},{"id":766,"name":"Basic Combat Loot Potion","image":"items/potion-basic-combat-loot.png","url":"/skill/12/action/711"},{"id":765,"name":"Basic Combat XP Potion","image":"items/potion-basic-combat-efficiency.png","url":"/skill/12/action/712"},{"id":763,"name":"Basic Gather Level Potion","image":"items/potion-basic-gather-level.png","url":"/skill/12/action/713"},{"id":768,"name":"Basic Gather Yield Potion","image":"items/potion-basic-gather-yield.png","url":"/skill/12/action/714"},{"id":761,"name":"Basic Gather XP Potion","image":"items/potion-basic-gather-efficiency.png","url":"/skill/12/action/715"},{"id":764,"name":"Basic Craft Level Potion","image":"items/potion-basic-craft-level.png","url":"/skill/12/action/716"},{"id":767,"name":"Basic Multi Craft Potion","image":"items/potion-basic-preservation.png","url":"/skill/12/action/717"},{"id":762,"name":"Basic Craft XP Potion","image":"items/potion-basic-craft-efficiency.png","url":"/skill/12/action/718"},{"id":710,"name":"Health Potion","image":"items/potion-health.png","url":"/skill/12/action/720"},{"id":716,"name":"Combat Loot Potion","image":"items/potion-combat-loot.png","url":"/skill/12/action/721"},{"id":715,"name":"Combat XP Potion","image":"items/potion-combat-efficiency.png","url":"/skill/12/action/722"},{"id":713,"name":"Gather Level Potion","image":"items/potion-gather-level.png","url":"/skill/12/action/723"},{"id":718,"name":"Gather Yield Potion","image":"items/potion-gather-yield.png","url":"/skill/12/action/724"},{"id":711,"name":"Gather XP Potion","image":"items/potion-gather-efficiency.png","url":"/skill/12/action/725"},{"id":714,"name":"Craft Level Potion","image":"items/potion-craft-level.png","url":"/skill/12/action/726"},{"id":717,"name":"Multi Craft Potion","image":"items/potion-preservation.png","url":"/skill/12/action/727"},{"id":712,"name":"Craft XP Potion","image":"items/potion-craft-efficiency.png","url":"/skill/12/action/728"},{"id":720,"name":"Super Health Potion","image":"items/potion-super-health.png","url":"/skill/12/action/730"},{"id":726,"name":"Super Combat Loot Potion","image":"items/potion-super-combat-loot.png","url":"/skill/12/action/731"},{"id":725,"name":"Super Combat XP Potion","image":"items/potion-super-combat-efficiency.png","url":"/skill/12/action/732"},{"id":723,"name":"Super Gather Level Potion","image":"items/potion-super-gather-level.png","url":"/skill/12/action/733"},{"id":728,"name":"Super Gather Yield Potion","image":"items/potion-super-gather-yield.png","url":"/skill/12/action/734"},{"id":721,"name":"Super Gather XP Potion","image":"items/potion-super-gather-efficiency.png","url":"/skill/12/action/735"},{"id":724,"name":"Super Craft Level Potion","image":"items/potion-super-craft-level.png","url":"/skill/12/action/736"},{"id":727,"name":"Super Multi Craft Potion","image":"items/potion-super-preservation.png","url":"/skill/12/action/737"},{"id":722,"name":"Super Craft XP Potion","image":"items/potion-super-craft-efficiency.png","url":"/skill/12/action/738"},{"id":740,"name":"Divine Health Potion","image":"items/potion-divine-health.png","url":"/skill/12/action/740"},{"id":746,"name":"Divine Combat Loot Potion","image":"items/potion-divine-combat-loot.png","url":"/skill/12/action/741"},{"id":745,"name":"Divine Combat XP Potion","image":"items/potion-divine-combat-efficiency.png","url":"/skill/12/action/742"},{"id":743,"name":"Divine Gather Level Potion","image":"items/potion-divine-gather-level.png","url":"/skill/12/action/743"},{"id":748,"name":"Divine Gather Yield Potion","image":"items/potion-divine-gather-yield.png","url":"/skill/12/action/744"},{"id":741,"name":"Divine Gather XP Potion","image":"items/potion-divine-gather-efficiency.png","url":"/skill/12/action/745"},{"id":744,"name":"Divine Craft Level Potion","image":"items/potion-divine-craft-level.png","url":"/skill/12/action/746"},{"id":747,"name":"Divine Multi Craft Potion","image":"items/potion-divine-preservation.png","url":"/skill/12/action/747"},{"id":742,"name":"Divine Craft XP Potion","image":"items/potion-divine-craft-efficiency.png","url":"/skill/12/action/748"},{"id":12,"name":"Birch Log","image":"items/wood-birch.png","url":"/skill/1/action/1000"},{"id":13,"name":"Teak Log","image":"items/wood-teak.png","url":"/skill/1/action/1001"},{"id":14,"name":"Mahogany Log","image":"items/wood-mahogany.png","url":"/skill/1/action/1002"},{"id":15,"name":"Ironbark Log","image":"items/wood-ironbark.png","url":"/skill/1/action/1003"},{"id":16,"name":"Redwood Log","image":"items/wood-redwood.png","url":"/skill/1/action/1004"},{"id":17,"name":"Ancient Log","image":"items/wood-ancient.png","url":"/skill/1/action/1005"},{"id":22,"name":"Silver Ore","image":"items/rock-silver.png","url":"/skill/2/action/1010"},{"id":23,"name":"Gold Ore","image":"items/rock-gold.png","url":"/skill/2/action/1011"},{"id":24,"name":"Cobalt Ore","image":"items/rock-cobalt.png","url":"/skill/2/action/1012"},{"id":26,"name":"Obsidian Ore","image":"items/rock-obsidian.png","url":"/skill/2/action/1013"},{"id":27,"name":"Astral Ore","image":"items/rock-astral.png","url":"/skill/2/action/1014"},{"id":28,"name":"Infernal Ore","image":"items/rock-infernal.png","url":"/skill/2/action/1015"},{"id":311,"name":"Raw Salmon","image":"items/raw-salmon.png","url":"/skill/9/action/1020"},{"id":317,"name":"Raw Lobster","image":"items/raw-lobster.png","url":"/skill/9/action/1022"},{"id":320,"name":"Raw Swordfish","image":"items/raw-swordfish.png","url":"/skill/9/action/1023"},{"id":325,"name":"Raw Shark","image":"items/raw-shark.png","url":"/skill/9/action/1024"},{"id":342,"name":"Raw King Crab","image":"items/raw-king-crab.png","url":"/skill/9/action/1025"},{"id":352,"name":"Rose","image":"items/flower-rose.png","url":"/skill/13/action/1030"},{"id":353,"name":"Daisy","image":"items/flower-daisy.png","url":"/skill/13/action/1031"},{"id":354,"name":"Lilac","image":"items/flower-lilac.png","url":"/skill/13/action/1032"},{"id":355,"name":"Hyacinth","image":"items/flower-hyacinth.png","url":"/skill/13/action/1033"},{"id":356,"name":"Nemesia","image":"items/flower-nemesia.png","url":"/skill/13/action/1034"},{"id":362,"name":"Onion","image":"items/food-onion.png","url":"/skill/13/action/1035"},{"id":363,"name":"Carrot","image":"items/food-carrot.png","url":"/skill/13/action/1036"},{"id":364,"name":"Tomato","image":"items/food-tomato.png","url":"/skill/13/action/1037"},{"id":365,"name":"Corn","image":"items/food-corn.png","url":"/skill/13/action/1038"},{"id":366,"name":"Pumpkin","image":"items/food-pumpkin.png","url":"/skill/13/action/1039"},{"id":367,"name":"Chilli","image":"items/food-chilli.png","url":"/skill/13/action/1040"},{"id":357,"name":"Snapdragon","image":"items/flower-snapdragon.png","url":"/skill/13/action/1041"},{"id":314,"name":"Raw Bass","image":"items/raw-bass.png","url":"/skill/9/action/10201"},{"id":3,"name":"Stardust","image":"items/stardust.png","url":"/merchant"},{"id":100,"name":"Copper Helmet","image":"items/armor-copper-helmet.png","url":"/merchant"},{"id":101,"name":"Copper Boots","image":"items/armor-copper-boots.png","url":"/merchant"},{"id":102,"name":"Copper Body","image":"items/armor-copper-body.png","url":"/merchant"},{"id":103,"name":"Copper Gloves","image":"items/armor-copper-gloves.png","url":"/merchant"},{"id":104,"name":"Copper Shield","image":"items/armor-copper-shield.png","url":"/merchant"},{"id":200,"name":"Copper Pickaxe","image":"items/pickaxe-copper.png","url":"/merchant"},{"id":201,"name":"Copper Hatchet","image":"items/hatchet-copper.png","url":"/merchant"},{"id":202,"name":"Copper Sword","image":"items/sword-copper.png","url":"/merchant"},{"id":203,"name":"Copper Hammer","image":"items/hammer-copper.png","url":"/merchant"},{"id":204,"name":"Copper Rod","image":"items/tool-copper-rod.png","url":"/merchant"},{"id":205,"name":"Copper Spade","image":"items/tool-copper-spade.png","url":"/merchant"},{"id":206,"name":"Copper Bow","image":"items/bow-copper.png","url":"/merchant"},{"id":207,"name":"Copper Spear","image":"items/spear-copper.png","url":"/merchant"},{"id":208,"name":"Copper Scythe","image":"items/scythe-copper.png","url":"/merchant"},{"id":209,"name":"Copper Boomerang","image":"items/boomerang-copper.png","url":"/merchant"},{"id":403,"name":"Fishing Bait","image":"items/fishing-bait.png","url":"/merchant"},{"id":404,"name":"Seeds","image":"items/seeds.png","url":"/merchant"},{"id":703,"name":"Vial","image":"items/vial.png","url":"/merchant"}]', 'public/list/recipe');
    request.listSkills = () => requestWithFallback('[{"id":-4,"displayName":"Challenges","technicalName":"Challenges","type":"Other","color":"#b6b77a","image":"misc/challenges.png","defaultActionId":null},{"id":-3,"displayName":"Total-exp","technicalName":"TotalExp","type":"Other","color":"#b6b77a","image":"misc/rank-one.png","defaultActionId":null},{"id":-2,"displayName":"Total-level","technicalName":"TotalLevel","type":"Other","color":"#b6b77a","image":"misc/rank-one.png","defaultActionId":null},{"id":-1,"displayName":"Combat","technicalName":"Combat","type":"Other","color":"#000000","image":"misc/one-handed.png","defaultActionId":302},{"id":15,"displayName":"Taming","technicalName":"Taming","type":"Other","color":"#637a71","image":"misc/taming.png","defaultActionId":null},{"id":1,"displayName":"Woodcutting","technicalName":"Woodcutting","type":"Gathering","color":"#647a63","image":"misc/woodcutting.png","defaultActionId":10},{"id":2,"displayName":"Mining","technicalName":"Mining","type":"Gathering","color":"#637a76","image":"misc/mining.png","defaultActionId":20},{"id":3,"displayName":"Smelting","technicalName":"Smelting","type":"Crafting","color":"#63657a","image":"misc/smelting.png","defaultActionId":30},{"id":4,"displayName":"Smithing","technicalName":"Smithing","type":"Crafting","color":"#7a7676","image":"misc/smithing.png","defaultActionId":100},{"id":11,"displayName":"Enchanting","technicalName":"Enchanting","type":"Crafting","color":"#63657a","image":"misc/enchanting.png","defaultActionId":70},{"id":13,"displayName":"Farming","technicalName":"Farming","type":"Gathering","color":"#637a71","image":"misc/farming.png","defaultActionId":350},{"id":12,"displayName":"Alchemy","technicalName":"Alchemy","type":"Crafting","color":"#7a7363","image":"misc/alchemy.png","defaultActionId":710},{"id":9,"displayName":"Fishing","technicalName":"Fishing","type":"Gathering","color":"#60808f","image":"misc/fishing.png","defaultActionId":40},{"id":10,"displayName":"Cooking","technicalName":"Cooking","type":"Crafting","color":"#637a71","image":"misc/cooking.png","defaultActionId":50},{"id":6,"displayName":"One-handed","technicalName":"OneHanded","type":"Combat","color":"#7a6363","image":"misc/one-handed.png","defaultActionId":302},{"id":7,"displayName":"Two-handed","technicalName":"TwoHanded","type":"Combat","color":"#7a7563","image":"misc/two-handed.png","defaultActionId":302},{"id":14,"displayName":"Ranged","technicalName":"Ranged","type":"Combat","color":"#637a70","image":"misc/ranged.png","defaultActionId":302},{"id":8,"displayName":"Defense","technicalName":"Defense","type":"Combat","color":"#767672","image":"misc/defense.png","defaultActionId":302}]', 'public/list/skill');
    request.listSkillSets = () => requestWithFallback('[{"skills":[1,2,13,9],"name":"Gathering","id":1},{"skills":[3,4,12,10,11],"name":"Crafting","id":2},{"skills":[6,7,14,8],"name":"Combat","id":3},{"skills":[1,13,12,14,8],"name":"Forest","id":4},{"skills":[2,3,4,6,8],"name":"Mountain","id":5},{"skills":[9,10,11,7,8],"name":"Ocean","id":6},{"skills":[1,2,13,9,3,4,12,10,11,6,7,14,8],"name":"All","id":-1},{"skills":[-4,-3,-2,-1,15],"name":"Other","id":-2}]', 'public/list/skillSet');
    request.listStructures = () => requestWithFallback('[{"id":1,"name":"Cooking Pot","regular":{"global":{},"bySkill":{"SKILL_SPEED":{"Cooking":9}}},"enchant":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Cooking":1}}}},{"id":2,"name":"Furnace","regular":{"global":{},"bySkill":{"SKILL_SPEED":{"Smelting":9}}},"enchant":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Smelting":1}}}},{"id":4,"name":"Anvil","regular":{"global":{},"bySkill":{"SKILL_SPEED":{"Smithing":9}}},"enchant":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Smithing":1}}}},{"id":5,"name":"Enchanting Table","regular":{"global":{},"bySkill":{"SKILL_SPEED":{"Enchanting":9}}},"enchant":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Enchanting":1}}}},{"id":6,"name":"Alchemy Lab","regular":{"global":{},"bySkill":{"SKILL_SPEED":{"Alchemy":9}}},"enchant":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Alchemy":1}}}},{"id":7,"name":"Smelter","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":8,"name":"Spit Roast","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":9,"name":"Cauldron","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":10,"name":"Kiln","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":1001,"name":"Guild Hall","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":1002,"name":"Guild Library","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":1003,"name":"Guild Bank","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":1004,"name":"Guild Storehouse","regular":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Mining":1,"Woodcutting":1,"Fishing":1,"Farming":1}}},"enchant":{"global":{},"bySkill":{}}},{"id":1005,"name":"Guild Workshop","regular":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Enchanting":1,"Cooking":1,"Alchemy":1,"Smelting":1,"Smithing":1}}},"enchant":{"global":{},"bySkill":{}}},{"id":1006,"name":"Guild Armoury","regular":{"global":{},"bySkill":{"EFFICIENCY_CHANCE":{"Ranged":1,"TwoHanded":1,"OneHanded":1,"Defense":1}}},"enchant":{"global":{},"bySkill":{}}},{"id":1007,"name":"Guild Event Hall","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":2001,"name":"Pet Barn","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}},{"id":2002,"name":"Pet Training Grounds","regular":{"global":{},"bySkill":{}},"enchant":{"global":{},"bySkill":{}}}]', 'public/list/structure');

    request.report = (data) => request('public/report', data);

    request.getChangelogs = () => request('public/settings/changelog');
    request.getPetVersion = () => requestWithFallback('2', 'public/settings/petVersion');
    request.getVersion = () => request('public/settings/version');

    return request;

}
);
// toast
window.moduleRegistry.add('toast', (util, elementCreator) => {

    const exports = {
        create,
        copyToClipboard,
        readFromClipboard
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

    function copyToClipboard(text, message) {
        navigator.clipboard.writeText(text);
        create({
            text: message,
            image: 'https://img.icons8.com/?size=48&id=22244'
        });
    }

    function readFromClipboard(message) {
        const text = navigator.clipboard.readText();
        create({
            text: message,
            image: 'https://img.icons8.com/?size=48&id=22244'
        });
        return text;
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
window.moduleRegistry.add('util', (elementWatcher, Promise) => {

    const exports = {
        levelToExp,
        expToLevel,
        expToCurrentExp,
        expToNextLevel,
        expToNextTier,
        expToSpecificLevel,
        tierToLevel,
        levelToTier,
        formatNumber,
        parseNumber,
        secondsToDuration,
        parseDuration,
        divmod,
        sleep,
        goToPage,
        compareObjects,
        deltaObjects,
        debounce,
        distinct,
        getDuplicates,
        sumObjects,
        startOfWeek,
        startOfYear,
        generateCombinations,
        roundToMultiple,
        compress,
        decompress,
        log,
        clamp
    };

    function levelToExp(level) {
        if(level === 1) {
            return 0;
        }
        if(level <= 100) {
            return Math.floor(Math.pow(level, 3.5) * 6 / 5);
        }
        return Math.round(12_000_000 * Math.pow(Math.pow(3500, .01), level - 100));
    }

    function expToLevel(exp) {
        if(exp <= 0) {
            return 1;
        }
        if(exp <= 12_000_000) {
            return Math.floor(Math.pow((exp + 1) / 1.2, 1 / 3.5));
        }
        return 100 + Math.floor(Math.log((exp + 1) / 12_000_000) / Math.log(Math.pow(3500, .01)));
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

    function expToSpecificLevel(exp, goalLevel) {
        return levelToExp(goalLevel) - exp;
    }

    function tierToLevel(tier) {
        if(tier <= 1) {
            return tier;
        }
        return tier * 15 - 20;
    }

    function levelToTier(level) {
        if(level <= 1) {
            return level;
        }
        return (level + 20) / 15;
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
        if(text.includes('Empty')) {
            return 0;
        }
        const regexMatch = /\d+[^\s]*/.exec(text);
        if(!regexMatch) {
            return 0;
        }
        text = regexMatch[0];
        text = text.replaceAll(/,/g, '');
        text = text.replaceAll(/&.*$/g, '');
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
        return roundToMultiple((parseFloat(text) || 0) * multiplier, 1 / 100);
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
            if(part.endsWith('s')) {
                seconds += value;
            } else if(part.endsWith('m')) {
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

    async function goToPage(page) {
        if(page === 'settings') {
            goToPage('merchant');
            await elementWatcher.exists('merchant-page');
        }
        window.history.pushState({}, '', page);
        window.history.pushState({}, '', page);
        window.history.back();
    }

    async function sleep(millis) {
        await new window.Promise(r => window.setTimeout(r, millis));
    }

    function compareObjects(object1, object2, doLog) {
        const keys1 = Object.keys(object1);
        const keys2 = Object.keys(object2);
        if(keys1.length !== keys2.length) {
            if(doLog) {
                console.warn(`key length not matching`, object1, object2);
            }
            return false;
        }
        keys1.sort();
        keys2.sort();
        for(let i=0;i<keys1.length;i++) {
            if(keys1[i] !== keys2[i]) {
                if(doLog) {
                    console.warn(`keys not matching`, keys1[i], keys2[i], object1, object2);
                }
                return false;
            }
            if(typeof object1[keys1[i]] === 'object' && typeof object2[keys2[i]] === 'object') {
                if(!compareObjects(object1[keys1[i]], object2[keys2[i]], doLog)) {
                    return false;
                }
            } else if(object1[keys1[i]] !== object2[keys2[i]]) {
                if(doLog) {
                    console.warn(`values not matching`, object1[keys1[i]], object2[keys2[i]], object1, object2);
                }
                return false;
            }
        }
        return true;
    }

    function deltaObjects(object1, object2) {
        const delta = {};

        for (const key in object1) {
            if (object1.hasOwnProperty(key)) {
                delta[key] = object2[key] - object1[key];
            }
        }

        for (const key in object2) {
            if (object2.hasOwnProperty(key) && !object1.hasOwnProperty(key)) {
                delta[key] = object2[key];
            }
        }

        return delta;
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

    function distinct(array) {
        return array.filter((value, index) => {
          return array.indexOf(value) === index;
        });
    }

    function getDuplicates(array) {
        const sorted = array.slice().sort();
        const result = [];
        for(let i=0;i<sorted.length-1;i++) {
            if(sorted[i+1] == sorted[i]) {
                result.push(sorted[i]);
            }
        }
        return result;
    }

    function sumObjects(array) {
        const result = {};
        for(const element of array) {
            for(const key of Object.keys(element)) {
                if(typeof element[key] === 'number') {
                    result[key] = (result[key] || 0) + element[key];
                }
            }
        }
        return result;
    }

    function startOfWeek(date) {
        const result = new Date();
        result.setDate(date.getDate() - date.getDay());
        result.setHours(0,0,0,0);
        return result;
    }

    function startOfYear(date) {
        const result = new Date(date.getFullYear(), 0, 1);
        return result;
    }

    function generateCombinations(objects, count, grouper) {
        const objectsByGroup = {};
        for(const object of objects) {
            const group = grouper(object);
            if(!objectsByGroup[group]) {
                objectsByGroup[group] = [];
            }
            objectsByGroup[group].push(object);
        }
        const result = [];
        const groups = Object.keys(objectsByGroup);
        addOneCombination(result, objectsByGroup, groups, count);
        return result;
    }

    function addOneCombination(result, objectsByGroup, groups, count, combination = [], groupStart = 0) {
        if(!count) {
            result.push(combination);
            return;
        }
        for(let i=groupStart;i<groups.length-count+1;i++) {
            const contents = objectsByGroup[groups[i]];
            for(let j=0;j<contents.length;j++) {
                addOneCombination(result, objectsByGroup, groups, count-1, combination.concat([contents[j]]), i+1);
            }
        }
    }

    function roundToMultiple(number, multiple) {
        return Math.round(number / multiple) * multiple;
    }

    function arrayBufferToText(arrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }

    async function textToArrayBuffer(text) {
        const result = new Promise.Deferred();
        var req = new XMLHttpRequest;
        req.open('GET', "data:application/octet;base64," + text);
        req.responseType = 'arraybuffer';
        req.onload = a => result.resolve(new Uint8Array(a.target.response));
        req.onerror = () => result.reject('Failed to convert text to array buffer');
        req.send();
        return result;
    }

    async function compress(string) {
        const byteArray = new TextEncoder().encode(string);
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(byteArray);
        writer.close();
        const arrayBuffer = await new Response(cs.readable).arrayBuffer();
        return arrayBufferToText(arrayBuffer);
    }

    async function decompress(text) {
        const arrayBuffer = await textToArrayBuffer(text);
        const cs = new DecompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(arrayBuffer);
        writer.close();
        const byteArray = await new Response(cs.readable).arrayBuffer();
        return new TextDecoder().decode(byteArray);
    }

    function log(x, base) {
        return Math.log(x) / Math.log(base);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    return exports;

}
);
// enchantmentsReader
window.moduleRegistry.add('enchantmentsReader', (events, util, structuresCache) => {

    const emitEvent = events.emit.bind(null, 'reader-enchantments');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'enchantment' && $('home-page .categories .category-active').text() === 'Enchant') {
            readEnchantmentsScreen();
        }
    }

    function readEnchantmentsScreen() {
        const enchantments = {};
        $('home-page .categories + .card button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const structure = structuresCache.byName[name];
            if(!structure) {
                return;
            }
            const level = util.parseNumber(element.find('.level').text());
            enchantments[structure.id] = level;
        });
        emitEvent({
            type: 'full',
            value: enchantments
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
        if(page.type === 'taming') {
            readTamingScreen();
        }
        readSidebar();
    }

    function readActionScreen(id) {
        const text = $('skill-page .tabs > button:contains("Stats")')
            .closest('.card')
            .find('.row > .name:contains("Total"):contains("XP")')
            .closest('.row')
            .find('.value')
            .text();
        const exp = text ? util.parseNumber(text) : readActionScreenFallback();
        emitEvent([{ id, exp }]);
    }

    function readActionScreenFallback() {
        const level = util.parseNumber($('tracker-component .level').text());
        const exp = util.parseNumber($('tracker-component .exp').text());
        return util.levelToExp(level) + exp;
    }

    function readTamingScreen() {
        const text = $('taming-page .header > .name:contains("Stats")')
            .closest('.card')
            .find('.row > .name:contains("Total"):contains("XP")')
            .closest('.row')
            .find('.amount')
            .text();
        const exp = util.parseNumber(text);
        emitEvent([{
            exp,
            id: skillCache.byName['Taming'].id
        }]);
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
// guildEventReader
window.moduleRegistry.add('guildEventReader', (events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-guild-event');
    const ONE_MINUTE = 1000 * 60;
    const TWO_DAYS = 1000 * 60 * 60 * 24 * 2;

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'guild' && $('guild-page .tracker ~ div button.row-active .name').text() === 'Events') {
            readScreen();
        }
    }

    function readScreen() {
        const eventRunning = $('guild-page .header:contains("Event")').parent().text().includes('Guild Credits');
        let eventStartMillis = null;
        let eventType = null;
        if(eventRunning) {
            const time = [];
            $('guild-page .header:contains("Event")').parent().find('.date').children().each((index, element) => time.push($(element).text()));
            const eventSecondsRemaining = util.parseDuration(time.join(' '));
            eventStartMillis = Date.now() - TWO_DAYS + 1000 * eventSecondsRemaining;
            eventStartMillis = util.roundToMultiple(eventStartMillis, ONE_MINUTE);
            eventType = $('guild-page .header:contains("Event")').parent().find('.date').prev().text().split(' Event')[0];
        }
        const data = {
            eventRunning,
            eventStartMillis,
            eventType
        };
        emitEvent({
            type: 'full',
            value: data
        });
    }

    initialise();

}
);
// guildReader
window.moduleRegistry.add('guildReader', (events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-guild');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'guild') {
            readScreen();
        }
    }

    function readScreen() {
        const data = {
            name: $('guild-page .tracker .name').text(),
            level: util.parseNumber($('guild-page .tracker .level').text())
        };
        if(!data.name) {
            return;
        }
        emitEvent({
            type: 'full',
            value: data
        });
    }

    initialise();

}
);
// guildStructuresReader
window.moduleRegistry.add('guildStructuresReader', (events, util, structuresCache) => {

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
        if(page.type === 'guild' && $('guild-page .tracker ~ div button.row-active .name').text() === 'Buildings') {
            readGuildStructuresScreen();
        }
    }

    function readGuildStructuresScreen() {
        const structures = {};
        $('guild-page .card').first().find('button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const structure = structuresCache.byName[name];
            if(!structure) {
                return;
            }
            const level = util.parseNumber(element.find('.amount').text());
            structures[structure.id] = level;
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
        if(page.type === 'taming' && page.menu === 'expeditions') {
            readExpeditionsScreen();
        }
    }

    function readInventoryScreen() {
        const inventory = {};
        $('inventory-page .items > .item').each((_i,element) => {
            itemUtil.extractItem(element, inventory, true);
        });
        emitEvent({
            type: 'full',
            value: inventory
        });
    }

    function readActionScreen() {
        const inventory = {};
        $('skill-page .header > .name:contains("Materials")').closest('.card').find('.row').each((_i,element) => {
            itemUtil.extractItem(element, inventory);
        });
        const stardustRow = $('skill-page .header > .name:contains("Consumables")').closest('.card').find('.row > .name:contains("Stardust")').closest('.row')[0];
        if(stardustRow) {
            itemUtil.extractItem(stardustRow, inventory);
        }
        emitEvent({
            type: 'partial',
            value: inventory
        });
    }

    function readExpeditionsScreen() {
        const inventory = {};
        $('taming-page .heading:contains("Materials") + button').each((_i,element) => {
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
// lootReader
window.moduleRegistry.add('lootReader', (events, itemUtil) => {

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 500);
    }

    function update() {
        const page = events.getLast('page');
        if(!page || page.type !== 'action') {
            return;
        }
        const lootCard = $('skill-page .card:not(:first-child) .header > .name:contains("Loot")')
            .closest('.card');
        if(!lootCard.length) {
            return;
        }
        const loot = {};
        lootCard.find('.row').each((i,element) => {
            itemUtil.extractItem(element, loot);
        });
        events.emit('reader-loot', {
            skill: page.skill,
            action: page.action,
            loot
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
        trigger
    };

    function initialise() {
        events.register('page', trigger);
        window.setInterval(trigger, 10000);
        $(document).on('keyup', 'market-page input', util.debounce(trigger, 300));
    }

    function trigger() {
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
            await elementWatcher.exists('market-listings-component .search ~ button', undefined, 10000);
            const selectedTab = $('market-listings-component .card > .tabs > button.tab-active').text().toLowerCase();
            const type = selectedTab === 'orders' ? 'BUY' : selectedTab === 'listings' ? 'OWN' : 'SELL';
            const count = util.parseNumber($('market-listings-component .count').text());
            const listings = [];
            $('market-listings-component .search ~ button').each((_i,element) => {
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
                count,
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
// marksReader
window.moduleRegistry.add('marksReader', (events, util, skillCache, skillSetCache) => {

    const emitEvent = events.emit.bind(null, 'reader-marks');
    const sets = ['Forest', 'Mountain', 'Ocean', 'All'].map(name => skillSetCache.byName[name]);

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'marks' && page.menu === 'skill marks') {
            readMarksScreen();
        }
    }

    function readMarksScreen() {
        const marks = {
            exp: {},
            eff: {}
        };
        // singles
        $('marks-page .header:contains("Skill Marks")').parent().find('.row').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text().replace(/ Mark$/, '');
            const amount = util.parseNumber(element.find('.amount').text());
            if(amount) {
                const skill = skillCache.match(name);
                marks.exp[skill.id] = 4;
            }
        });
        // sets
        let oneSetUnlocked = false;
        for(const set of sets) {
            if(containsAllKeys(marks.exp, set.skills)) {
                oneSetUnlocked = true;
                for(const skillId of set.skills) {
                    marks.eff[skillId] = (marks.eff[skillId] || 0) + 2;
                }
            }
        }
        const tamingSkill = skillCache.byName['Taming'];
        if(oneSetUnlocked && marks.exp[tamingSkill.id]) {
            marks.eff[tamingSkill.id] = (marks.eff[tamingSkill.id] || 0) + 2;
        }
        emitEvent({
            type: 'full',
            value: marks
        });
    }

    function containsAllKeys(object, keys) {
        for(const key of keys) {
            if(!object[key]) {
                return false;
            }
        }
        return true;
    }

    initialise();

}
);
// petReader
window.moduleRegistry.add('petReader', (events, petCache, petPassiveCache, elementWatcher, util, petUtil) => {

    const emitEvent = events.emit.bind(null, 'reader-pet');

    function initialise() {
        events.register('page', handlePage);
        elementWatcher.addRecursiveObserver(readPetModal, 'app-component > div.scroll div.wrapper', 'taming-page', 'modal-component');
    }

    function handlePage(page) {
        if(page.type === 'taming' && page.menu === 'pets') {
            readTamingScreen();
        }
    }

    function readTamingScreen() {
        const elements = $('button.row.ng-star-inserted').get();
        const values = [];
        for(let element of elements) {
            element = $(element);
            const image = element.find('.image img').attr('src').split('/').at(-1);
            const name = element.find('.image').next().find('.flex > :nth-child(1)')[0].textContent;
            const level = util.parseNumber(element.find('.image').next().find('.flex > :nth-child(2)')[0].textContent);
            const partOfTeam = !!element.closest('.card').find('.header:contains("Expedition Team")').length;
            const partOfRanch = !!element.closest('.card').find('.header:contains("Ranch")').length;
            values.push({
                parsed: false,
                version: petUtil.VERSION,
                species: petCache.byImage[image].id,
                family: petCache.byImage[image].family,
                name,
                level,
                partOfTeam,
                partOfRanch,
                element: element[0]
            });
        }
        emitEvent({
            type: 'list',
            value: values
        });
    }

    function readPetModal(modal) {
        if(!$(modal).find('.name:contains("Abilities")').length) {
            return; // avoid triggering on other modals
        }
        const image = $(modal).find('.header img').attr('src').split('/').at(-1);
        const name = $(modal).find('.header .description > button').text().trim();
        const level = util.parseNumber($(modal).find('.header .description > div').text().trim());
        const health = +($(modal).find('.name:contains("Health") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const attack = +($(modal).find('.name:contains("Attack") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const defense = +($(modal).find('.name:contains("Defense") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const passives = $(modal).find('.name:contains("Total")').parent().nextAll('.row').find('.name').get().map(a => a.innerText);
        const pet = {
            parsed: true,
            version: petUtil.VERSION,
            species: petCache.byImage[image].id,
            family: petCache.byImage[image].family,
            name,
            level,
            health,
            attack,
            defense,
            passives: passives.map(a => petPassiveCache.byName[a].id)
        };
        const healthRow = $(modal).find('.name:contains("Health") + .mono').parent();
        if(!healthRow.hasClass('stat-health')) {
            $(modal).find('.name:contains("Health") + .mono').parent().addClass('stat-health');
            $(modal).find('.name:contains("Attack") + .mono').parent().addClass('stat-attack');
            $(modal).find('.name:contains("Defense") + .mono').parent().addClass('stat-defense');
            for(const id of pet.passives) {
                const passive = petPassiveCache.byId[id];
                $(modal).find(`.name:contains("${passive.name}")`).parent().addClass(`passive-${passive.stats.name}`);
            }
        }
        emitEvent({
            type: 'single',
            value: pet,
            modal: modal
        });
    }

    initialise();

}
);
// questReader
window.moduleRegistry.add('questReader', (events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-quests');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if (!page) {
            return;
        }
        if (page.type === 'quests') {
            readScreen();
        }
    }

    function readScreen() {
        const statsCard = $('quests-page .card:has(.header .name:contains("Stats"))');

        const data = {
            currentCompletedQuests: util.parseNumber($('quests-page .header > .amount').text().split(' / ')[0]),
            maxCompletedQuests: util.parseNumber($('quests-page .header > .amount').text().split(' / ')[1]),
            currentAutoCompletes: util.parseNumber(statsCard.find('.row:has(.name:contains("Auto Quest Completes")) div:last').text().split(' / ')[0]),
            maxAutoCompletes: util.parseNumber(statsCard.find('.row:has(.name:contains("Auto Quest Completes")) div:last').text().split(' / ')[1]),
            resetTime: util.parseDuration(
                statsCard.find('.row:has(.name:contains("Daily Quest Reset")) .time')
                    .children()
                    .get()
                    .map(a => a.textContent)
                    .join(' ')
            ),
            totalQuestsCompleted: util.parseNumber(statsCard.find('.row:has(.name:contains("Quests Completed")) div:last').text()),
            missingQuestPoints: util.parseNumber(statsCard.find('.row:has(.name:contains("Missing QP")) div:last').text().replace(' QP', '')),
        };
        emitEvent(data);
    }

    initialise();

}
);
// settingsReader
window.moduleRegistry.add('settingsReader', (events) => {

    const emitEvent = events.emit.bind(null, 'reader-settings');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'settings') {
            readScreen();
        }
    }

    function readScreen() {
        const data = {
            name: $('settings-page .name:contains("Username")').next().text()
        };
        if(!data.name) {
            return;
        }
        emitEvent({
            type: 'full',
            value: data
        });
    }

    initialise();

}
);
// structuresReader
window.moduleRegistry.add('structuresReader', (events, util, structuresCache) => {

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
            const structure = structuresCache.byName[name];
            if(!structure) {
                return;
            }
            const level = util.parseNumber(element.find('.level').text());
            structures[structure.id] = level;
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
        if(page.type === 'settings') {
            readSettingsScreen(various);
        }
        emitEvent(various);
    }

    function readActionScreen(various, skillId) {
        const amountText = $('skill-page .header > .name:contains("Loot")').parent().find('.amount').text();
        const amountValue = !amountText ? null : util.parseNumber(amountText.split(' / ')[1]) - util.parseNumber(amountText.split(' / ')[0]);
        various.maxAmount = {
            [skillId]: amountValue
        };
        const opulenceMode = $('skill-page .header > .name:contains("Consumables")').closest('.card').find('.row > .name:contains("Stardust")').closest('.row').find('.use').text();
        if(opulenceMode) {
            various.opulenceMode = opulenceMode;
        }
    }

    function readSettingsScreen(various) {
        const username = $('settings-page .row:contains("Username") :last-child').text();
        if(username) {
            various.username = username;
        }
    }

    initialise();

}
);
// actionEnabler
window.moduleRegistry.add('actionEnabler', (configuration, events) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'action-enabler',
            name: 'Action Enabler',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', handlePage);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePage(page) {
        if(!enabled || page.type !== 'action') {
            return;
        }
        $('skill-page .header > .name:contains("Actions")')
            .closest('.card')
            .find('button[disabled]')
            .not('.container > button')
            .removeAttr('disabled')
            .find('.level')
            .css('color', '#db6565');
    }

    initialise();

}
);
// animatedLoot
window.moduleRegistry.add('animatedLoot', (events, elementWatcher, itemCache, configuration, util) => {
    const THICCNESS = 60;

    const Engine = Matter.Engine;
    const Render = Matter.Render;
    const Runner = Matter.Runner;
    const Bodies = Matter.Bodies;
    const World = Matter.World;
    const Composite = Matter.Composite;

    const CLUMPDENSITY_MIN = 2;
    const CLUMPDENSITY_DEFAULT = 10;
    const CLUMPDENSITY_MAX = 100;

    const MAX_SAME_DENSITY_MIN = 2;
    const MAX_SAME_DENSITY_DEFAULT = 10;
    const MAX_SAME_DENSITY_MAX = 100;

    const ORIGINAL_IMAGESIZE = 32;
    const DESIRED_IMAGESIZE = 24;

    const IMAGESIZE_INCREASE_MIN = 1;
    const IMAGESIZE_INCREASE_DEFAULT = 1.25;
    const IMAGESIZE_INCREASE_MAX = 2;

    const ENABLED_PAGES = ['action']; //,'taming','automation'

    let loadedImages = [];
    let engine;
    let render;
    let killswitch;
    let lastPage;

    let busy = false;
    let enabled = false;
    let backgroundUrl = undefined;
    let clumpsize = CLUMPDENSITY_DEFAULT;
    let max_same_density = MAX_SAME_DENSITY_DEFAULT;
    let imagesize_increase = IMAGESIZE_INCREASE_DEFAULT;

    let items = [];
    let clumpCountsByItem = {};

    async function initialise() {
        addStyles();
        configuration.registerCheckbox({
            category: 'Animated Loot',
            key: 'animated-loot-enabled',
            name: 'Animated Loot Enabled',
            default: false,
            handler: handleConfigEnabledStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-max-same-density',
            name: `[${MAX_SAME_DENSITY_MIN} - ${MAX_SAME_DENSITY_MAX}]`,
            default: MAX_SAME_DENSITY_DEFAULT,
            inputType: 'number',
            text: 'Max amount of items of same type and weight before clumping occurs',
            light: true,
            noHeader: true,
            handler: handleConfigMaxSameDensityStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-clumpdensity',
            name: `[${CLUMPDENSITY_MIN} - ${CLUMPDENSITY_MAX}]`,
            default: CLUMPDENSITY_DEFAULT,
            inputType: 'number',
            text: 'Amount of items that will clump together when threshold is reached',
            noHeader: true,
            handler: handleConfigClumpSizeStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-clump-imagesize-increase',
            name: `[${IMAGESIZE_INCREASE_MIN} - ${IMAGESIZE_INCREASE_MAX}]`,
            default: IMAGESIZE_INCREASE_DEFAULT,
            inputType: 'number',
            text: 'Factor that determines how much larger a clumped item image will be',
            noHeader: true,
            handler: handleConfigClumpImageSizeIncreaseStateChange,
        });
        configuration.registerInput({
            category: 'Animated Loot',
            key: 'animated-loot-background',
            name: 'png, jpeg, webm, gif, etc.',
            default: '',
            inputType: 'text',
            text: 'Background URL',
            layout: '1/3',
            noHeader: true,
            handler: handleConfigBackgroundStateChange,
        });
        events.register('page', handlePage);
        events.register('state-loot', handleLoot);
    }

    function handleConfigEnabledStateChange(state) {
        enabled = state;
    }

    function handleConfigMaxSameDensityStateChange(state) {
        if(!state || state === '') {
            max_same_density = MAX_SAME_DENSITY_DEFAULT;
            return;
        }
        if(state < clumpsize) {
            //just reset it to default to prevent stuck in while
            max_same_density = MAX_SAME_DENSITY_DEFAULT;
            clumpsize = CLUMPDENSITY_DEFAULT;
            return;
        }
        if(state < MAX_SAME_DENSITY_MIN) {
            max_same_density = MAX_SAME_DENSITY_MIN;
            return;
        }
        if(state > MAX_SAME_DENSITY_MAX) {
            max_same_density = MAX_SAME_DENSITY_MAX;
            return;
        }
        max_same_density = state;
    }

    function handleConfigClumpSizeStateChange(state) {
        if(!state || state === '') {
            clumpsize = CLUMPDENSITY_DEFAULT;
            return;
        }
        if(state > max_same_density) {
            //just reset it to default to prevent stuck in while
            clumpsize = CLUMPDENSITY_DEFAULT;
            max_same_density = MAX_SAME_DENSITY_DEFAULT;
            return;
        }
        if(state < CLUMPDENSITY_MIN) {
            clumpsize = CLUMPDENSITY_MIN;
            return;
        }
        if(state > CLUMPDENSITY_MAX) {
            clumpsize = CLUMPDENSITY_MAX;
            return;
        }
        clumpsize = state;
    }

    function handleConfigClumpImageSizeIncreaseStateChange(state) {
        if(!state || state === '') {
            imagesize_increase = IMAGESIZE_INCREASE_DEFAULT;
            return;
        }
        if(state < IMAGESIZE_INCREASE_MIN) {
            imagesize_increase = IMAGESIZE_INCREASE_MIN;
            return;
        }
        if(state > IMAGESIZE_INCREASE_MAX) {
            imagesize_increase = IMAGESIZE_INCREASE_MAX;
            return;
        }
        imagesize_increase = state;
    }

    function handleConfigBackgroundStateChange(state) {
        backgroundUrl = state;
    }

    async function handlePage(page) {
        if (!enabled) return;
        if(isDifferentAction(page)) {
            reset();
        }
        lastPage = page;
        if (!ENABLED_PAGES.includes(page.type)) return;

        //await ensureImagesLoaded(page.action);

        const initial = events.getLast('state-loot');
        await handleLoot(initial);
    }

    async function handleLoot(lootState) {
        if (!enabled) return;
        if (!lootState) return;
        if (busy) {
            return;
        }
        try {
            busy = true;
            const page = events.getLast('page');
            if (lootState.action !== page.action) return;

            const itemWrapper = $('#itemWrapper');
            if (!itemWrapper.length) {
                await createItemWrapper();
            }

            for (const [id, val] of Object.entries(lootState.loot)) {
                if (val > 0) {
                    await loadImage(id);
                    updateItem(+id, val);
                }
            }
        }
        finally {
            busy = false;
        }
    }

    async function createItemWrapper() {
        await elementWatcher.exists('skill-page .header > .name:contains("Loot")');

        const lootCard = $('skill-page .card:not(:first-child) .header > .name:contains("Loot")').closest('.card');
        if (!lootCard.length) {
            return;
        }
        const itemWrapper = $('<div/>').addClass('itemWrapper').attr('id', 'itemWrapper')
        if(backgroundUrl) {
            itemWrapper.css('background-image', 'linear-gradient(0deg, rgba(0, 0, 0, 0) 66%, rgba(13, 34, 52, 1) 100%), url(' + backgroundUrl + ')');
            itemWrapper.css('background-position', 'center');
        } else {
            itemWrapper.addClass('lineAboveCanvas');
        }
        lootCard.append(itemWrapper);

        killswitch = setInterval(() => {
            const itemWrapper = $('#itemWrapper');
            if (!itemWrapper.length) {
                reset();
            }
        }, 1000);

        const matterContainer = document.querySelector('#itemWrapper');

        const actualWidth = matterContainer.clientWidth + 2;
        const actualheigth = matterContainer.clientHeight + 2;

        engine = Engine.create();
        render = Render.create({
            element: matterContainer,
            engine: engine,
            options: {
                width: actualWidth,
                height: actualheigth,
                background: 'transparent',
                wireframes: false,
            },
        });

        let ground = Bodies.rectangle(
            actualWidth / 2,
            actualheigth + THICCNESS / 2,
            27184,
            THICCNESS,
            { isStatic: true }
        );

        let leftWall = Bodies.rectangle(
            0 - THICCNESS / 2,
            actualheigth / 2,
            THICCNESS,
            actualheigth * 10,
            { isStatic: true }
        );

        let rightWall = Bodies.rectangle(
            actualWidth + THICCNESS / 2,
            actualheigth / 2,
            THICCNESS,
            actualheigth * 10,
            { isStatic: true }
        );

        Composite.add(engine.world, [ground, leftWall, rightWall]);

        let mouse = Matter.Mouse.create(render.canvas);
        let mouseConstraint = Matter.MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.2,
                render: {
                    visible: false,
                },
            },
        });

        Composite.add(engine.world, mouseConstraint);

        mouseConstraint.mouse.element.removeEventListener(
            'mousewheel',
            mouseConstraint.mouse.mousewheel
        );
        mouseConstraint.mouse.element.removeEventListener(
            'DOMMouseScroll',
            mouseConstraint.mouse.mousewheel
        );
        // Matter.Events.on(mouseConstraint, 'mousemove', function (event) {
        //     let foundPhysics = Matter.Query.point(items.map(i => i.ref), event.mouse.position);
        // });

        Render.run(render);

        let runner = Runner.create();

        Runner.run(runner, engine);

        function handleResize(matterContainer) {
            if(!render.canvas) {
                return;
            }

            const actualWidth = matterContainer.clientWidth + 2;
            const actualheigth = matterContainer.clientHeight + 2;

            render.canvas.width = actualWidth;
            render.canvas.height = actualheigth;

            Matter.Body.setPosition(
                ground,
                Matter.Vector.create(actualWidth / 2, actualheigth + THICCNESS / 2)
            );

            Matter.Body.setPosition(
                rightWall,
                Matter.Vector.create(actualWidth + THICCNESS / 2, actualheigth / 2)
            );
        }

        window.addEventListener('resize', () => handleResize(matterContainer));
    }

    function reset() {
        if (render) {
            Render.stop(render);
            World.clear(engine.world);
            Engine.clear(engine);
            render.canvas?.remove();
            render.canvas = null;
            render.context = null;
            render.textures = {};
        }
        if (killswitch) {
            clearInterval(killswitch);
            killswitch = undefined;
        }
        $('#itemWrapper').remove();
        items = [];
        clumpCountsByItem = {};
    }

    function updateItem(itemId, amount) {
        const clumps = calculateClumpCounts(amount);

        const previousClumps = clumpCountsByItem[itemId] || [];
        const maxLength = Math.max(clumps.length, previousClumps.length);
        for(let i=0;i<maxLength;i++) {
            const density = Math.pow(clumpsize, i);
            let diff = (clumps[i] || 0) - (previousClumps[i] || 0);
            // cull
            for(let j=0;j>diff;j--) {
                const index = items.findIndex(item => item.id === itemId && item.density === density);
                if(index === -1) {
                    throw `Unexpected : could not cull itemId ${itemId} with density ${density} because no match found`;
                }
                const item = items.splice(index, 1)[0];
                cullItem(item);
            }
            // spawn
            for(let j=0;j<diff;j++) {
                const item = {
                    id: itemId,
                    density
                };
                items.push(item);
                spawnItem(item);
            }
        }

        clumpCountsByItem[itemId] = clumps;
    }

    function calculateClumpCounts(amount) {
        let index = Math.floor(util.log(amount, clumpsize));
        let currentClumpSize = Math.pow(clumpsize, index);

        // minimal clump count first
        const array = [];
        while(currentClumpSize >= 1) {
            array[index] = Math.floor(amount / currentClumpSize);
            amount -= array[index] * currentClumpSize;
            // TODO add to array
            index--;
            currentClumpSize /= clumpsize;
        }

        // then split to reach max_same_density
        for(let i=array.length-2;i>=0;i--) {
            let splitCount = Math.floor((max_same_density - array[i] - 1) / clumpsize);
            splitCount = Math.min(splitCount, array[i+1]);
            array[i+1] -= splitCount;
            array[i] += splitCount * clumpsize;
        }
        return array;
    }

    function cullItem(item) {
        World.remove(engine.world, item.ref);
    }

    function spawnItem(item) {
        const gameItem = itemCache.byId[item.id];

        const matterContainer = document.querySelector('#itemWrapper');
        const spread = randomIntFromInterval(-50, 50) + matterContainer.clientWidth / 2;

        const itemSize = DESIRED_IMAGESIZE + util.log(item.density, clumpsize) * (DESIRED_IMAGESIZE * (imagesize_increase - 1));
        const imageScale = itemSize / DESIRED_IMAGESIZE;
        const scaleCorrection = DESIRED_IMAGESIZE / ORIGINAL_IMAGESIZE;

        const itemObject = Bodies.circle(spread, 50, itemSize / 2, {
            friction: 0.3,
            frictionAir: 0.00001,
            restitution: 0.5, // bouncyness
            render: {
                sprite: {
                    texture: 'assets/' + gameItem.image,
                    xScale: scaleCorrection * imageScale,
                    yScale: scaleCorrection * imageScale,
                },
            },
        });
        World.add(engine.world, itemObject);
        item.ref = itemObject;
    }

    async function loadImage(itemId) {
        const item = itemCache.byId[itemId];
        if(!item) return;
        if(loadedImages.includes(itemId)) {
            return;
        }
        await new Promise((res, rej) => {
            let img = new Image();
            img.onload = () => {
                loadedImages.push(itemId);
                res();
            };
            img.onerror = rej;
            img.src = 'assets/' + item.image;
        });
    }

    function addStyles() {
        const head = document.getElementsByTagName('head')[0];
        if (!head) {
            return;
        }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = styles;
        head.appendChild(style);
    }

    function randomIntFromInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    function isDifferentAction(page) {
        return !lastPage || !page || lastPage.skill !== page.skill || lastPage.action !== page.action;
    }

    const styles = `
        .itemWrapper {
            width: 100%;
            height: 350px;
            background-color: transparent;
            overflow: hidden;
            position: relative;
            border-radius: 0px 0px 4px 4px;

            background-size: cover;
            background-repeat: no-repeat;

            canvas {
                border-radius: 0 0 4px 4px;
                margin: -1px;
            }
        }
        .lineAboveCanvas {
            border-top: 1px solid #263849
        }
    `;

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
    const loaded = new Promise.Deferred('changelog');

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
window.moduleRegistry.add('configurationPage', (pages, components, configuration, elementCreator) => {

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
            case 'button': return createRows_Button(item);
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
        const result = [];

        if (!item.noHeader) {
            result.push({
                type: 'item',
                name: item.name
            });
        }

        result.push({
            type: 'input',
            name: item.name,
            value: value,
            inputType: item.inputType,
            delay: 500,
            text: item.text,
            layout: item.layout || '5/1',
            class: item.class,
            light: true,
            noHeader: true,
            action: (value) => {
                item.handler(value);
            }
        });

        return result;
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

    function createRows_Button(item) {
        return [{
            type: 'buttons',
            buttons: [{
                text: item.name,
                color: 'success',
                action: () => item.handler()
            }]
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
// craftCheatSheet
window.moduleRegistry.add('craftCheatSheet', (configuration, elementCreator, elementWatcher, itemCache, util, events, skillCache) => {

    let enabled = false;
    let element;

    const SKILLS = ['Smelting', 'Smithing', 'Enchanting'];
    const TIERS = [{
        item: itemCache.byName['Copper Bar'],
        amount: 50
    },{
        item: itemCache.byName['Iron Bar'],
        amount: 250
    },{
        item: itemCache.byName['Silver Bar'],
        amount: 750
    },{
        item: itemCache.byName['Gold Bar'],
        amount: 1500
    },{
        item: itemCache.byName['Cobalt Bar'],
        amount: 2500
    },{
        item: itemCache.byName['Obsidian Bar'],
        amount: 3500
    },{
        item: itemCache.byName['Astral Bar'],
        amount: 5000
    },{
        item: itemCache.byName['Infernal Bar'],
        amount: 7500
    }];

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'craft-cheat-sheet',
            name: 'Crafting Cheat Sheet',
            default: true,
            handler: handleConfigStateChange
        });
        element = setup();
        elementWatcher.addRecursiveObserver(onModal, 'app-component > div.scroll div.wrapper', 'skill-page', 'modal-component');
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onModal(modal) {
        if(!enabled) {
            return;
        }
        if(!$(modal).find('button.craft:contains("Craft")').length) {
            return; // avoid triggering on other modals
        }
        const pageEvent = events.getLast('page');
        const skill = skillCache.byId[pageEvent.skill].displayName;
        if(!SKILLS.includes(skill)) {
            return; // only for whitelisted skills
        }
        $(modal).append(element);
    }

    function setup() {
        elementCreator.addStyles(styles);
        const html = TIERS.map(tier => `
            <img src='/assets/${tier.item.image}'/>
            <span>${tier.item.name.split(' ')[0]}</span>
            <span>${util.formatNumber(tier.amount)}</span>
            <span>${util.formatNumber(3*tier.amount)}</span>
        `).join('');
        const element = $(`
            <div id='custom-craft-cheat-sheet'>
                <b style="grid-column:span 2">Tier</b>
                <b>One</b>
                <b>All</b>
                ${html}
            </div>
        `);
        $(element).on('click', () => {
            const old = element.css('opacity');
            if(old === '1') {
                element.css('opacity', 0.05);
            } else {
                element.css('opacity', 1);
            }
        });
        return element;
    }

    const styles = `
        #custom-craft-cheat-sheet {
            position: fixed;
            right: .5em;
            bottom: .5em;
            font-family: Jost,Helvetica Neue,Arial,sans-serif;
            z-index: 3;
            background-color: black;
            padding: .4rem;
            border: 1px solid #3e3e3e;
            border-radius: .4em;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: .4em;
            justify-items: start;
        }
        #custom-craft-cheat-sheet > :nth-child(-n+3) {
            justify-self: center;
        }
        #custom-craft-cheat-sheet > :nth-child(4n+4), #custom-craft-cheat-sheet > :nth-child(4n+5) {
            justify-self: start;
        }
        #custom-craft-cheat-sheet > :nth-child(4n+6), #custom-craft-cheat-sheet > :nth-child(4n+7) {
            justify-self: end;
        }
        #custom-craft-cheat-sheet img {
            width: 32px;
            height: 32px;
            image-rendering: pixelated;
        }
    `;

    initialise();

}
);
// dataForwarder
window.moduleRegistry.add('dataForwarder', (configuration, events, request, discord, util) => {

    let enabled = false;
    const DATA = {};
    const ONE_MINUTE = 1000 * 60;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'data-forwarder',
            name: 'Data Forwarder',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('reader-guild', handleEvent);
        events.register('reader-structures-guild', handleEvent);
        events.register('reader-guild-event', handleEvent);
        events.register('estimator', handleComplexEvent);
        events.register('estimator-expedition', handleComplexEvent);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleEvent(data, eventName) {
        if(!enabled) {
            return;
        }
        if(data.type === 'full') {
            const doForward = JSON.stringify(data.value) !== JSON.stringify(DATA[eventName]);
            DATA[eventName] = data.value;
            if(doForward) {
                forward(eventName);
            }
        }
    }

    function handleComplexEvent(data, eventName) {
        if(!enabled) {
            return;
        }
        switch(eventName) {
            case 'estimator':
            case 'estimator-expedition':
                if(data.isCurrent) {
                    handleEvent({
                        type: 'full',
                        value: {
                            finished: util.roundToMultiple(Date.now() + data.timings.finished * 1000, ONE_MINUTE)
                        }
                    }, eventName);
                }
                break;
            default:
                throw 'Unmapped key : ' + eventName;
        }
    }

    function forward(key) {
        const guildName = DATA['reader-guild']?.name;
        switch(key) {
            case 'reader-guild':
                if(guildName) {
                    request.forwardDataGuildLevel(guildName, DATA[key].level);
                }
                break;
            case 'reader-structures-guild':
                if(guildName) {
                    request.forwardDataGuildStructures(guildName, DATA[key]);
                }
                break;
            case 'reader-guild-event':
                if(guildName && DATA[key].eventRunning) {
                    request.forwardDataGuildEventTime(guildName, DATA[key].eventType, DATA[key].eventStartMillis);
                }
                break;
            case 'estimator':
                forwardEndTime('IDLE_ACTION', DATA[key].finished);
                return;
            case 'estimator-expedition':
                forwardEndTime('TAMING_EXPEDITION', DATA[key].finished);
                return;
            default:
                throw 'Unmapped key : ' + key;
        }
    }

    function forwardEndTime(type, millis) {
        const registrations = discord.getRegistrations().filter(a => a.type === type && !a.errored);
        for(const registration of registrations) {
            request.setTimeDiscordRegistration(registration.id, millis);
        }
    }

    initialise();

    return {forward};

}
);
// debugService
window.moduleRegistry.add('debugService', (request, toast, statsStore, EstimationGenerator, logService, events, util) => {

    const exports = {
        submit
    };

    async function submit() {
        const data = get();
        try {
            await forward(data);
        } catch(e) {
            exportToClipboard(data);
        }
    }

    function get() {
        return {
            stats: statsStore.get(),
            state: (new EstimationGenerator()).export(),
            logs: logService.get(),
            events: events.getLastCache()
        };
    }

    async function forward(data) {
        await request.report(data);
        toast.create({
            text: 'Forwarded debug data',
            image: 'https://img.icons8.com/?size=48&id=13809'
        });
    }

    function exportToClipboard(data) {
        toast.copyToClipboard(JSON.stringify(data), 'Failed to forward, exported to clipboard instead');
    }

    return exports;

});
// discord
window.moduleRegistry.add('discord', (pages, components, configuration, request, localDatabase, toast, logService, events, syncTracker, util) => {

    const PAGE_NAME = 'Discord';
    const STORE_NAME = 'discord';

    const types = [];
    let displayedTypes = [];
    const eventData = {};
    let registrations = [];
    let highlightedRegistration = null;

    const exports = {
        getRegistrations
    };

    async function initialise() {
        await pages.register({
            category: 'Misc',
            after: 'Settings',
            name: PAGE_NAME,
            image: 'https://img.icons8.com/?size=48&id=30998',
            columns: '2',
            render: renderPage
        });
        configuration.registerCheckbox({
            category: 'Pages',
            key: 'discord-enabled',
            name: 'Discord',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('reader-guild', handleEvent);
        events.register('reader-guild-event', handleEvent);
        events.register('reader-settings', handleEvent);
        await load();
        return exports;
    }

    function handleConfigStateChange(state, name) {
        if(state) {
            pages.show(PAGE_NAME);
        } else {
            pages.hide(PAGE_NAME);
        }
    }

    function handleEvent(data, eventName) {
        eventName = eventName.split(/-(.*)/)[1];
        eventData[eventName] = data.value;
        recomputeTypes();
    }

    function getRegistrations() {
        return registrations;
    }

    async function load() {
        types.push(...(await request.getDiscordRegistrationTypes()));
        recomputeTypes();
        registrations = [];
        highlightedRegistration = null;
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        for(const entry of entries) {
            await loadSingle(entry.value);
        }
    }

    async function loadSingle(registration) {
        try {
            registration = await request.getDiscordRegistration(registration.id);
        } catch(e) {
            registration.errored = true;
        }
        await add(registration);
        pages.requestRender(PAGE_NAME);
        return registration;
    }

    async function add(registration) {
        await localDatabase.saveEntry(STORE_NAME, {
            key: registration.id,
            value: registration
        });
        const index = registrations.findIndex(a => a.id === registration.id);
        if(index === -1) {
            registrations.push(registration);
        } else {
            registrations[index] = registration;
        }
    }

    async function remove(registration) {
        await localDatabase.removeEntry(STORE_NAME, registration.id);
        registrations = registrations.filter(a => a.id !== registration.id);
    }

    function getDisplayName(registration, includeExtra) {
        let name = types.find(a => a.value === registration.type)?.text || 'N/A';
        if(registration.errored) {
            name = '[!] ' + name;
        }
        if(registration.name) {
            name += ` (${registration.name})`;
        }
        if(includeExtra) {
            name += ` - ${registration.enabled ? 'enabled' : 'disabled'}`;
            name += ` - ${registration.channel ? 'linked' : 'unlinked'}`;
        }
        return name;
    }

    function clickForward() {
        pages.open(syncTracker.PAGE_NAME);
    }

    function clickInvite() {
        window.open('https://discord.com/api/oauth2/authorize?client_id=1208765131010478081&permissions=2147485696&scope=bot');
    }

    function clickCreate() {
        highlightedRegistration = {
            id: 'NEW',
            type: types[0].value,
            user: eventData.settings.name
        };
        pages.requestRender(PAGE_NAME);
    }

    function clickConfigure(registration) {
        highlightedRegistration = registration;
        pages.requestRender(PAGE_NAME);
    }

    async function tryExecute(executor, messageSuccess, messageError) {
        try {
            await executor();
            if(messageSuccess) {
                toast.create({
                    text: messageSuccess,
                    image: 'https://img.icons8.com/?size=100&id=sz8cPVwzLrMP&format=png&color=000000'
                });
            }
        } catch(e) {
            console.error(e);
            logService.error(e);
            if(messageError) {
                toast.create({
                    text: messageError,
                    image: 'https://img.icons8.com/?size=100&id=63688&format=png&color=000000'
                });
            }
        }
        pages.requestRender(PAGE_NAME);
    }

    async function clickRefresh() {
        tryExecute(async () => {
            highlightedRegistration = await loadSingle(highlightedRegistration);
        }, 'Notification refreshed!', 'Error refreshing notification');
    }

    async function clickEnable() {
        tryExecute(async () => {
            highlightedRegistration.enabled = !highlightedRegistration.enabled;
            highlightedRegistration = await request.setEnabledDiscordRegistration(highlightedRegistration.id, highlightedRegistration.enabled);
            await add(highlightedRegistration);
        }, 'Toggled enabled!', 'Error toggling enabled');
    }

    async function clickLinked() {
        if(!highlightedRegistration.channel) {
            toast.create({
                text: 'Please use the /link command',
                image: 'https://img.icons8.com/?size=100&id=63688&format=png&color=000000'
            });
            return;
        }
        tryExecute(async () => {
            highlightedRegistration = await request.unlinkDiscordRegistration(highlightedRegistration.id);
        }, 'Notification unlinked!', 'Error unlinking notification');
    }

    async function submitCreate() {
        tryExecute(async () => {
            if(highlightedRegistration.type.startsWith('GUILD_')) {
                highlightedRegistration.name = eventData.guild.name;
            }
            const registration = await request.createDiscordRegistration(highlightedRegistration);
            await add(registration);
            highlightedRegistration = null;
        }, 'Notification created!', 'Error creating notification');
    }

    function clickCopyId() {
        toast.copyToClipboard(highlightedRegistration.id, 'Copied id to clipboard!');
    }

    async function clickDelete() {
        tryExecute(async () => {
            await request.deleteDiscordRegistration(highlightedRegistration.id);
            await remove(highlightedRegistration);
            highlightedRegistration = null;
        }, 'Notification deleted!', 'Error deleting notification');
    }

    function clickExport() {
        tryExecute(async () => {
            let text = JSON.stringify(registrations);
            text = await util.compress(text);
            toast.copyToClipboard(text, 'Exported to clipboard!');
        }, null, 'Error exporting to clipboard');
    }

    function clickImport() {
        tryExecute(async () => {
            let text = await toast.readFromClipboard('Copied from clipboard!');
            text = await util.decompress(text);
            const _registrations = JSON.parse(text);
            // cleanup old
            for(const registration of registrations) {
                await remove(registration);
            }
            highlightedRegistration = null;
            // add new
            registrations = [];
            for(const registration of _registrations) {
                await loadSingle(registration);
            }
        }, 'Succesfully imported!', 'Error importing from clipboard');
    }

    function recomputeTypes() {
        displayedTypes = structuredClone(types);
        if(!eventData?.guild?.name) {
            displayedTypes = displayedTypes.filter(a => !a.value.startsWith('GUILD_'));
        }
    }

    function renderPage() {
        components.removeAllComponents();
        if(!eventData?.settings?.name) {
            renderLeftWarning();
        } else {
            renderLeftList();
        }

        if(!highlightedRegistration) {
            return;
        } else if(highlightedRegistration.id === 'NEW') {
            renderRightCreate();
        } else {
            renderRightEdit();
        }
    }

    function renderLeftWarning() {
        components.addComponent(componentBlueprintWarning);
    }

    function renderLeftList() {
        const registrationRows = components.search(componentBlueprintList, 'registrationRows');
        registrationRows.rows = [];
        components.search(componentBlueprintList, 'empty').hidden = !!registrations.length;
        for(const registration of registrations) {
            registrationRows.rows.push({
                type: 'header',
                title: getDisplayName(registration, true),
                name: '>',
                action: clickConfigure.bind(null, registration),
                color: 'primary'
            });
        }
        components.addComponent(componentBlueprintList);
        components.addComponent(componentBlueprintInfo);
    }

    function renderRightCreate() {
        components.search(componentBlueprintCreate, 'dropdown').options = displayedTypes;
        components.addComponent(componentBlueprintCreate);
    }

    function renderRightEdit() {
        components.search(componentBlueprintEdit, 'header').title = 'Configure - ' + getDisplayName(highlightedRegistration, false);
        components.search(componentBlueprintEdit, 'enabled').hidden = !!highlightedRegistration.errored;
        components.search(componentBlueprintEdit, 'enabled').checked = !!highlightedRegistration.enabled;
        components.search(componentBlueprintEdit, 'linked').hidden = !!highlightedRegistration.errored;
        components.search(componentBlueprintEdit, 'linked').checked = !!highlightedRegistration.channel;
        components.search(componentBlueprintEdit, 'name').hidden = !highlightedRegistration.name;
        components.search(componentBlueprintEdit, 'name').value = highlightedRegistration.name;
        components.search(componentBlueprintEdit, 'server').hidden = !highlightedRegistration.server;
        components.search(componentBlueprintEdit, 'server').value = highlightedRegistration.server;
        components.search(componentBlueprintEdit, 'lastSent').hidden = !highlightedRegistration.lastSentTime;
        components.search(componentBlueprintEdit, 'lastSent').value = new Date(highlightedRegistration.lastSentTime).toLocaleString();
        components.search(componentBlueprintEdit, 'nextSent').hidden = !highlightedRegistration.nextTime;
        components.search(componentBlueprintEdit, 'nextSent').value = new Date(highlightedRegistration.nextTime).toLocaleString();

        components.addComponent(componentBlueprintEdit);
    }

    const componentBlueprintWarning = {
        componentId: 'discordComponentWarning',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                type: 'header',
                title: 'Missing info'
            },{
                type: 'item',
                name: 'Some information is missing before you can configure discord notifications'
            },{
                type: 'item',
                name: 'Please go to the sync state page, and run the auto-sync process'
            },{
                type: 'buttons',
                buttons: [{
                    text: 'Go to sync state page',
                    color: 'primary',
                    action: clickForward
                }]
            }]
        }]
    };

    const componentBlueprintList = {
        componentId: 'discordComponentList',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                type: 'header',
                title: 'Notifications',
                action: clickCreate,
                name: 'Create',
                color: 'success'
            },{
                type: 'item',
                id: 'empty',
                extra: '~ No notifications yet ~'
            },{
                type: 'segment',
                id: 'registrationRows',
                rows: []
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Export',
                    color: 'primary',
                    action: clickExport
                },{
                    text: 'Import',
                    color: 'primary',
                    action: clickImport
                }]
            }]
        }]
    };

    const componentBlueprintInfo = {
        componentId: 'discordComponentInfo',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                type: 'header',
                title: 'Information'
            },{
                type: 'item',
                extra: 'Here are some steps you can follow to set up your first notification'
            },{
                type: 'header',
                title: '1. Create a notification',
                action: clickCreate,
                name: 'Create',
                color: 'success'
            },{
                type: 'item',
                extra: 'Create a new notification using the green "Create" button above. Select the desired notification type, and click "Create" again.'
            },{
                type: 'item',
                extra: 'To view it, use the blue ">" button. You can copy the id (needed later) using the "Copy id" button.'
            },{
                type: 'header',
                title: '2. Invite the bot',
                action: clickInvite,
                name: 'Invite',
                color: 'success'
            },{
                type: 'item',
                extra: 'Now you have a choice. You can either choose to receive messages in a text channel in the server [3], or through direct messages [4]'
            },{
                type: 'header',
                title: '3. Through a text channel'
            },{
                type: 'item',
                extra: 'First you have to create a new text channel in your server. It is suggested to secure the channel, so only you, or a limited amount of people can send messages there.'
            },{
                type: 'item',
                extra: 'Now link the notification to the text channel, by executing the following command in the text channel:'
            },{
                type: 'item',
                name: '/link {id}'
            },{
                type: 'header',
                title: '4. Through direct messages'
            },{
                type: 'item',
                extra: 'Now link the notification to your dm\'s, by executing the following command in any text channel of the server, or in a direct message with the bot:'
            },{
                type: 'item',
                name: '/link_dm {id}'
            },{
                type: 'header',
                title: '5. Enable'
            },{
                type: 'item',
                extra: 'To start receiving notifications, you still need to enable it. Select the notification using the blue ">" button, and toggle the "enable" checkbox. If everything went okay, you should also see the server (or direct message) name.'
            },{
                type: 'header',
                title: '6. Other commands'
            },{
                type: 'item',
                name: '/list'
            },{
                type: 'item',
                extra: 'This lists the notifications currently linked to the channel.'
            },{
                type: 'item',
                name: '/unlink {id}'
            },{
                type: 'item',
                extra: 'This unlinks the id from any channel it may be linked to. This works the same as toggling the linked status in this interface.'
            },{
                type: 'item',
                name: '/unlink_all'
            },{
                type: 'item',
                extra: 'This unlinks all notifications linked to the channel the command was executed in.'
            }]
        }]
    };

    const componentBlueprintCreate = {
        componentId: 'discordComponentCreate',
        dependsOn: 'custom-page',
        parent: '.column1',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                type: 'header',
                title: 'Create'
            }, {
                type: 'dropdown',
                id: 'dropdown',
                options: [],
                action: a => highlightedRegistration.type = a
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Create',
                    color: 'success',
                    action: submitCreate
                }]
            }]
        }]
    };

    const componentBlueprintEdit = {
        componentId: 'discordComponentEdit',
        dependsOn: 'custom-page',
        parent: '.column1',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                type: 'header',
                id: 'header',
                title: 'Configure',
                action: clickRefresh,
                name: 'Refresh',
                color: 'success'
            },{
                type: 'buttons',
                buttons: [{
                    text: 'Copy id',
                    color: 'primary',
                    action: clickCopyId
                },{
                    text: 'Delete',
                    color: 'danger',
                    action: clickDelete
                }]
            },{
                type: 'checkbox',
                id: 'enabled',
                text: 'Enabled',
                checked: false,
                action: clickEnable
            },{
                type: 'checkbox',
                id: 'linked',
                text: 'Linked',
                checked: false,
                action: clickLinked
            },{
                type: 'item',
                id: 'name',
                name: 'Associated value',
                value: null
            },{
                type: 'item',
                id: 'server',
                name: 'Server',
                value: null
            },{
                type: 'item',
                id: 'lastSent',
                name: 'Last Sent',
                value: null
            },{
                type: 'item',
                id: 'nextSent',
                name: 'Next send time',
                value: null
            }]
        }]
    };

    return initialise();

}
);
// dropChanceDisplay
window.moduleRegistry.add('dropChanceDisplay', (configuration, events, dropCache, itemCache, util) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'drop-chance-display',
            name: 'Drop Chance Display',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', handlePage);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePage(page) {
        if(!enabled || page.type !== 'action') {
            return;
        }
        const drops = dropCache.byAction[page.action];
        let list = $('action-drops-component .item')
            .toArray()
            .map(element => ({
                element,
                name: $(element).find('.name').text()
            }));
        list.forEach(a => {
            a.item = itemCache.byName[a.name];
            a.drop = drops.find(b => b.item === a.item.id);
        });
        list = list.filter(a => a.drop);
        $('.pancakeChance').remove();
        for(const a of list) {
            $(a.element).find('.chance').after(
                $(`<div class='pancakeChance'>&nbsp;(${util.formatNumber(100 * a.drop.chance)}%)</div>`)
                    .css('color', '#aaa')
            );
        }
    }

    initialise();

}
);
// estimator
window.moduleRegistry.add('estimator', (configuration, events, skillCache, actionCache, itemCache, estimatorOutskirts, estimatorActivity, estimatorCombat, components, util, statsStore, customItemPriceStore) => {

    const emitEvent = events.emit.bind(null, 'estimator');
    let enabled = false;

    const exports = {
        get,
        enrichTimings,
        enrichValues,
        preRenderItems
    }

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
        if (!enabled) {
            return;
        }
        const page = events.getLast('page');
        if (page?.type === 'action') {
            const stats = events.getLast('state-stats');
            if (stats) {
                const estimation = get(page.skill, page.action);
                if(!estimation) {
                    components.removeComponent(componentBlueprint);
                    return;
                }
                estimation.isCurrent = !!$('.header .name:contains("Loot")').length;
                enrichTimings(estimation);
                enrichValues(estimation);
                preRender(estimation, componentBlueprint);
                preRenderItems(estimation, componentBlueprint);
                components.addComponent(componentBlueprint);
                emitEvent(estimation);
            }
        }
    }

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        if (action.type === 'OUTSKIRTS') {
            return estimatorOutskirts.get(skillId, actionId);
        } else if (skill.type === 'Gathering' || skill.type === 'Crafting') {
            return estimatorActivity.get(skillId, actionId);
        } else if (skill.type === 'Combat') {
            return estimatorCombat.get(skillId, actionId);
        }
    }

    function enrichTimings(estimation) {
        const inventory = Object.entries(estimation.ingredients).map(([id, amount]) => ({
            id,
            stored: statsStore.getInventoryItem(id),
            secondsLeft: statsStore.getInventoryItem(id) * 3600 / amount
        })).reduce((a, b) => (a[b.id] = b, a), {});
        const equipment = Object.entries(estimation.equipments).map(([id, amount]) => ({
            id,
            stored: statsStore.getEquipmentItem(id),
            secondsLeft: statsStore.getEquipmentItem(id) * 3600 / amount
        })).reduce((a, b) => (a[b.id] = b, a), {});
        let maxAmount = statsStore.get('MAX_AMOUNT', estimation.skill);
        maxAmount = {
            value: maxAmount,
            secondsLeft: estimation.productionSpeed / 10 * (maxAmount || Infinity)
        };
        const levelState = statsStore.getLevel(estimation.skill);
        const goalTimeRow = components.search(componentBlueprint, 'goalTime');
        estimation.timings = {
            inventory,
            equipment,
            maxAmount,
            finished: Math.min(maxAmount.secondsLeft || Infinity, ...Object.values(inventory).concat(Object.values(equipment)).map(a => a.secondsLeft)),
            level: util.expToNextLevel(levelState.exp) * 3600 / estimation.exp,
            tier: levelState.level >= 100 ? 0 : util.expToNextTier(levelState.exp) * 3600 / estimation.exp,
            goal: util.expToSpecificLevel(levelState.exp, goalTimeRow.inputValue) * 3600 / estimation.exp
        };
    }

    function enrichValues(estimation) {
        estimation.values = {
            drop: getMinMarketPrice(estimation.drops),
            ingredient: getMinMarketPrice(estimation.ingredients),
            equipment: getMinMarketPrice(estimation.equipments),
            net: 0
        };
        estimation.values.net = estimation.values.drop - estimation.values.ingredient - estimation.values.equipment;
    }

    function getMinMarketPrice(object) {
        return Object.entries(object)
            .map(([itemId, itemAmount]) => customItemPriceStore.get(itemId) * itemAmount)
            .filter(Boolean)
            .reduce((sum, current) => sum + current, 0);
    }

    function preRender(estimation, blueprint) {
        components.search(blueprint, 'exp').hidden
            = estimation.exp === 0;
        components.search(blueprint, 'exp').value
            = util.formatNumber(estimation.exp);
        components.search(blueprint, 'survivalChance').hidden
            = true; // TODO replace again by this : estimation.type === 'ACTIVITY'
        components.search(blueprint, 'survivalChance').value
            = util.formatNumber(estimation.survivalChance * 100) + ' %';
        components.search(blueprint, 'finishedTime').value
            = util.secondsToDuration(estimation.timings.finished);
        components.search(blueprint, 'levelTime').hidden
            = estimation.exp === 0 || estimation.timings.level === 0;
        components.search(blueprint, 'levelTime').value
            = util.secondsToDuration(estimation.timings.level);
        components.search(blueprint, 'levelTime').extra
            = util.formatNumber(Math.ceil(estimation.timings.level / 3600 * estimation.actionsPerHour)) + ' actions';
        components.search(blueprint, 'tierTime').hidden
            = estimation.exp === 0 || estimation.timings.tier === 0;
        components.search(blueprint, 'tierTime').value
            = util.secondsToDuration(estimation.timings.tier);
        components.search(blueprint, 'tierTime').extra
            = util.formatNumber(Math.ceil(estimation.timings.tier / 3600 * estimation.actionsPerHour)) + ' actions';
        components.search(blueprint, 'goalTime').value
            = estimation.timings.goal <= 0 ? 'Now' : util.secondsToDuration(estimation.timings.goal);
        components.search(blueprint, 'goalTime').extra
            = estimation.timings.goal <= 0 ? null : util.formatNumber(Math.ceil(estimation.timings.goal / 3600 * estimation.actionsPerHour)) + ' actions';
        components.search(blueprint, 'profitDropValue').value
            = util.formatNumber(estimation.values.drop);
        components.search(blueprint, 'profitIngredientValue').hidden
            = estimation.values.ingredient === 0;
        components.search(blueprint, 'profitIngredientValue').value
            = util.formatNumber(estimation.values.ingredient);
        components.search(blueprint, 'profitEquipmentValue').hidden
            = estimation.values.equipment === 0;
        components.search(blueprint, 'profitEquipmentValue').value
            = util.formatNumber(estimation.values.equipment);
        components.search(blueprint, 'profitNetValue').hidden
            = estimation.values.net === 0;
        components.search(blueprint, 'profitNetValue').value
            = util.formatNumber(estimation.values.net);
        components.search(blueprint, 'tabTime').hidden
            = (estimation.timings.inventory.length + estimation.timings.equipment.length) === 0;
    }

    function preRenderItems(estimation, blueprint) {
        const dropRows = components.search(blueprint, 'dropRows');
        const ingredientRows = components.search(blueprint, 'ingredientRows');
        const timeRows = components.search(blueprint, 'timeRows');
        dropRows.rows = [];
        ingredientRows.rows = [];
        timeRows.rows = [];
        if (estimation.timings.maxAmount.value) {
            timeRows.rows.push({
                type: 'item',
                image: 'https://img.icons8.com/?size=48&id=1HQMXezy5LeT&format=png',
                imageFilter: 'invert(100%)',
                name: `Max amount [${util.formatNumber(estimation.timings.maxAmount.value)}]`,
                value: util.secondsToDuration(estimation.timings.maxAmount.secondsLeft)
            });
        }
        for (const id in estimation.drops) {
            const item = itemCache.byId[id];
            dropRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                value: util.formatNumber(estimation.drops[id]) + ' / hour'
            });
        }
        for (const id in estimation.ingredients) {
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
        for (const id in estimation.equipments) {
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

        const profitProducedRows = components.search(blueprint, 'profitProducedRows');
        profitProducedRows.rows = [];
        for (const id in estimation.drops) {
            const item = itemCache.byId[id];
            const price = customItemPriceStore.get(id);
            const itemsPerHour = estimation.drops[id];
            profitProducedRows.rows.push({
                id: `profit-produced-row-${item.name}`,
                type: 'itemWithInput',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                inputValue: price,
                itemsPerHour: `${util.formatNumber(itemsPerHour)} / hour`,
                value: `${util.formatNumber(itemsPerHour * price)} / hour`,
                inputType: 'number',
                delay: 1000,
                action: updateItemPrice.bind(null, item.id)
            });
        }

        const profitConsumedRows = components.search(blueprint, 'profitConsumedRows');
        profitConsumedRows.rows = [];
        for (const id in estimation.ingredients) {
            const item = itemCache.byId[id];
            const price = customItemPriceStore.get(id);
            const itemsPerHour = estimation.ingredients[id];
            profitConsumedRows.rows.push({
                id: `profit-consumed-row-${item.name}`,
                type: 'itemWithInput',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                inputValue: price,
                itemsPerHour: `${util.formatNumber(itemsPerHour)} / hour`,
                value: `${util.formatNumber(itemsPerHour * price)} / hour`,
                inputType: 'number',
                delay: 1000,
                action: updateItemPrice.bind(null, item.id)
            });
        }
        for (const id in estimation.equipments) {
            const item = itemCache.byId[id];
            const price = customItemPriceStore.get(id);
            const itemsPerHour = estimation.equipments[id];
            profitConsumedRows.rows.push({
                id: `profit-consumed-row-${item.name}`,
                type: 'itemWithInput',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                inputValue: price,
                itemsPerHour: `${util.formatNumber(itemsPerHour)} / hour`,
                value: `${util.formatNumber(itemsPerHour * price)} / hour`,
                inputType: 'number',
                delay: 1000,
                action: updateItemPrice.bind(null, item.id)
            });
        }
    }

    async function updateItemPrice(id, price) {
        await customItemPriceStore.set(id, +price);
        update();
    }

    const componentBlueprint = {
        componentId: 'estimatorComponent',
        dependsOn: 'skill-page',
        parent: 'actions-component',
        selectedTabIndex: 0,
        tabs: [
            {
                title: 'Overview',
                rows: [
                    {
                        type: 'item',
                        id: 'exp',
                        name: 'Exp/hour',
                        image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
                        value: ''
                    },
                    {
                        type: 'item',
                        id: 'survivalChance',
                        name: 'Survival chance',
                        image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
                        value: ''
                    },
                    {
                        type: 'item',
                        id: 'finishedTime',
                        name: 'Finished',
                        image: 'https://cdn-icons-png.flaticon.com/512/1505/1505471.png',
                        value: ''
                    },
                    {
                        type: 'item',
                        id: 'levelTime',
                        name: 'Level up',
                        image: 'https://cdn-icons-png.flaticon.com/512/4614/4614145.png',
                        value: ''
                    },
                    {
                        type: 'item',
                        id: 'tierTime',
                        name: 'Tier up',
                        image: 'https://cdn-icons-png.flaticon.com/512/4789/4789514.png',
                        value: ''
                    },
                    {
                        type: 'itemWithInput',
                        id: 'goalTime',
                        name: 'Goal level',
                        image: 'https://cdn-icons-png.flaticon.com/512/14751/14751729.png',
                        value: '',
                        inputValue: '100',
                        inputType: 'number',
                        delay: 1000,
                        action: () => update()
                    }
                ]
            },
            {
                title: 'Items',
                rows: [
                    {
                        type: 'header',
                        title: 'Produced'
                    },
                    {
                        type: 'segment',
                        id: 'dropRows',
                        rows: []
                    },
                    {
                        type: 'header',
                        title: 'Consumed'
                    },
                    {
                        type: 'segment',
                        id: 'ingredientRows',
                        rows: []
                    }
                ]
            },
            {
                title: 'Profit',
                rows: [
                    {
                        type: 'header',
                        title: 'Produced'
                    },
                    {
                        type: 'segment',
                        id: 'profitProducedRows',
                        rows: []
                    },
                    {
                        type: 'header',
                        title: 'Consumed'
                    },
                    {
                        type: 'segment',
                        id: 'profitConsumedRows',
                        rows: []
                    },
                    {
                        type: 'header',
                        title: 'Profits'
                    },
                    {
                        type: 'segment',
                        rows: [
                            {
                                type: 'item',
                                id: 'profitDropValue',
                                name: 'Gold/hour (produced)',
                                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028024.png',
                                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                                value: ''
                            },
                            {
                                type: 'item',
                                id: 'profitIngredientValue',
                                name: 'Gold/hour (materials)',
                                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                                value: ''
                            },
                            {
                                type: 'item',
                                id: 'profitEquipmentValue',
                                name: 'Gold/hour (equipments)',
                                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                                value: ''
                            },
                            {
                                type: 'item',
                                id: 'profitNetValue',
                                name: 'Gold/hour (total)',
                                image: 'https://cdn-icons-png.flaticon.com/512/11937/11937869.png',
                                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                                value: ''
                            }
                        ]
                    }
                ]
            },
            {
                title: 'Time',
                id: 'tabTime',
                rows: [
                    {
                        type: 'segment',
                        id: 'timeRows',
                        rows: []
                    }
                ]
            }]
    };

    initialise();

    return exports;

}
);
// estimatorAction
window.moduleRegistry.add('estimatorAction', (dropCache, actionCache, ingredientCache, skillCache, itemCache, statsStore) => {

    const SECONDS_PER_HOUR = 60 * 60;
    const LOOPS_PER_HOUR = 10 * SECONDS_PER_HOUR; // 1 second = 10 loops
    const LOOPS_PER_FOOD = 150;

    const exports = {
        LOOPS_PER_HOUR,
        LOOPS_PER_FOOD,
        getDrops,
        getIngredients,
        getEquipmentUses
    };

    function getDrops(skillId, actionId, isCombat, multiplier = 1) {
        const drops = structuredClone(dropCache.byAction[actionId]);
        if(!drops) {
            return [];
        }
        const hasFailDrops = !!drops.find(a => a.type === 'FAILED');
        const hasMonsterDrops = !!drops.find(a => a.type === 'MONSTER');
        const successChance = hasFailDrops ? getSuccessChance(skillId, actionId) / 100 : 1;
        multiplier *= 1 + statsStore.get('MULTICRAFT_CHANCE') / 100;
        if(shouldApplyOpulence(skillId)) {
            const mostCommonDrop = dropCache.getMostCommonDrop(actionId);
            if(isOpulenceItemsMode()) {
                const match = drops.find(a => a.item === mostCommonDrop);
                match.chance += statsStore.get('OPULENT_CHANCE') / 100;
            } else {
                const value = itemCache.byId[mostCommonDrop].attributes.MIN_MARKET_PRICE;
                drops.push({
                    type: 'REGULAR',
                    item: itemCache.specialIds.coins,
                    amount: 1,
                    chance: value * statsStore.get('OPULENT_CHANCE') / 100
                });
            }
        }
        if(shouldApplyTierVariety(skillId)) {
            for(const drop of drops.slice(0)) {
                const mapping = dropCache.tierVarietyMappings[drop.item];
                if(!mapping) {
                    continue;
                }
                for(const other of mapping) {
                    drops.push({
                        type: 'REGULAR',
                        item: other,
                        amount: drop.amount,
                        chance: drop.chance * statsStore.get('TIER_VARIETY_CHANCE') / 100 / mapping.length
                    });
                }
                drop.chance *= 1 - statsStore.get('TIER_VARIETY_CHANCE') / 100;
            }
        }
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
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getSuccessChance(skillId, actionId) {
        const action = actionCache.byId[actionId];
        const level = statsStore.getLevel(skillId).level;
        return Math.min(95, 80 + level - action.level) + Math.floor(level / 20);
    }

    function getIngredients(skillId, actionId, multiplier) {
        const ingredients = ingredientCache.byAction[actionId];
        if(!ingredients) {
            return [];
        }
        multiplier *= 1 + statsStore.get('MULTICRAFT_CHANCE') / 100;
        if(shouldApplyOpulence(skillId)) {
            const mostCommonDrop = dropCache.getMostCommonDrop(actionId);
            const value = itemCache.byId[mostCommonDrop].attributes.MIN_MARKET_PRICE;
            ingredients.push({
                item: itemCache.specialIds.stardust,
                amount: value * statsStore.get('OPULENT_CHANCE') / 100 / 2
            });
        }
        return ingredients.map(ingredient => ({
            id: ingredient.item,
            amount: ingredient.amount * multiplier
        }))
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getEquipmentUses(skillId, actionId, actionCount = 0, isCombat = false, foodPerHour = 0) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const result = {};
        const potionMultiplier = 1 + statsStore.get('DECREASED_POTION_DURATION') / 100;
        if(isCombat) {
            if(action.type !== 'OUTSKIRTS') {
                // combat potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.combatPotion)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
            if(action.type === 'DUNGEON') {
                // dungeon key
                let dungeonKeyCount = actionCount / 3;
                dungeonKeyCount /=  1 + statsStore.get('KEY_PRESERVATION_CHANCE') / 100;
                statsStore.getManyEquipmentItems(itemCache.specialIds.dungeonKey)
                    .forEach(a => result[a.id] = dungeonKeyCount);
            }
            if(foodPerHour && action.type !== 'OUTSKIRTS' && statsStore.get('HEAL')) {
                // active food
                statsStore.getManyEquipmentItems(itemCache.specialIds.food)
                    .forEach(a => result[a.id] = foodPerHour);
            }
        } else {
            if(skill.type === 'Gathering') {
                // gathering potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.gatheringPotion)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
            if(skill.type === 'Crafting') {
                // crafting potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.craftingPotion)
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

    function shouldApplyOpulence(skillId) {
        return skillCache.byId[skillId].type === 'Crafting'
            && statsStore.get('OPULENT_CHANCE')
            && statsStore.getInventoryItem(itemCache.specialIds.stardust);
    }

    function isOpulenceItemsMode() {
        return statsStore.getOpulenceMode() === 'Items';
    }

    function shouldApplyTierVariety(skillId) {
        return skillCache.byId[skillId].type === 'Gathering'
            && statsStore.get('TIER_VARIETY_CHANCE');
    }

    return exports;

}
);
// estimatorActivity
window.moduleRegistry.add('estimatorActivity', (skillCache, actionCache, estimatorAction, statsStore) => {

    const exports = {
        get
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const speed = getSpeed(skill.technicalName, action);
        const actionCount = estimatorAction.LOOPS_PER_HOUR / speed;
        const actualActionCount = actionCount * (1 + statsStore.get('EFFICIENCY_CHANCE', skill.technicalName) / 100);
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP_CHANCE', skill.technicalName) / 100);
        const ingredientCount = actualActionCount * (1 - statsStore.get('PRESERVATION_CHANCE', skill.technicalName) / 100);
        const exp = actualActionCount * action.exp * (1 + statsStore.get('DOUBLE_EXP_CHANCE', skill.technicalName) / 100);
        const drops = estimatorAction.getDrops(skillId, actionId, false, dropCount);
        const ingredients = estimatorAction.getIngredients(skillId, actionId, ingredientCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId);

        return {
            type: 'ACTIVITY',
            skill: skillId,
            action: actionId,
            speed,
            actionsPerHour: dropCount,
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
window.moduleRegistry.add('estimatorCombat', (skillCache, actionCache, monsterCache, itemCache, dropCache, statsStore, Distribution, estimatorAction, util) => {

    const exports = {
        get,
        getDamageDistributions,
        getSurvivalChance
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const monsterId = action.monster ? action.monster : action.monsterGroup[0];
        const playerStats = getPlayerStats();
        const monsterStats = getMonsterStats(monsterId);
        playerStats.damage_ = getInternalDamageDistribution(playerStats, monsterStats);
        monsterStats.damage_ = getInternalDamageDistribution(monsterStats, playerStats);
        const loopsPerKill = playerStats.attackSpeed * playerStats.damage_.expectedRollsUntill(monsterStats.health) * 10 + 5;
        const actionCount = estimatorAction.LOOPS_PER_HOUR / loopsPerKill;
        const efficiency = 1 + statsStore.get('EFFICIENCY_CHANCE', skill.technicalName) / 100;
        const actualActionCount = actionCount * efficiency;
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP_CHANCE', skill.technicalName) / 100);
        const attacksReceivedPerHour = estimatorAction.LOOPS_PER_HOUR / 10 / monsterStats.attackSpeed;
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT_PERCENT') / 100);
        const damagePerHour = attacksReceivedPerHour * monsterStats.damage_.average();
        const foodPerHour = damagePerHour / healPerFood;

        let exp = estimatorAction.LOOPS_PER_HOUR * action.exp / 1000;
        exp *= efficiency;
        exp *= 1 + statsStore.get('DOUBLE_EXP_CHANCE', skill.technicalName) / 100;
        exp *= 1 + statsStore.get('COMBAT_EXP_PERCENT', skill.technicalName) / 100;
        exp *= getTriangleModifier(playerStats, monsterStats);
        // TODO there's also a 1.2 exp multiplier when fighting a monster that was replaced by a dungeon endboss
        const drops = estimatorAction.getDrops(skillId, actionId, true, dropCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId, actionCount, true, foodPerHour);
        const survivalChance = getSurvivalChance(playerStats, monsterStats, loopsPerKill);

        let statCarveChance;
        if(action.type !== 'OUTSKIRTS' && (statCarveChance = statsStore.get('CARVE_CHANCE') / 100)) {
            const boneDrop = dropCache.byAction[actionId].find(a => a.chance === 1);
            const boneDropCount = drops[boneDrop.item];
            drops[boneDrop.item] -= statCarveChance * boneDropCount;
            const mappings = dropCache.boneCarveMappings[boneDrop.item];
            for(const otherBone of mappings) {
                drops[otherBone] = (drops[otherBone] || 0) + statCarveChance * boneDropCount;
            }
        }

        return {
            type: 'COMBAT',
            skill: skillId,
            action: actionId,
            speed: loopsPerKill,
            actionsPerHour: dropCount,
            productionSpeed: loopsPerKill * actionCount / dropCount,
            exp,
            drops,
            ingredients: {},
            equipments,
            player: playerStats,
            monster: monsterStats,
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
            attackLevel,
            defenseLevel,
            bonusAccuracy: 0, // TODO from relics
            bonusEvasion: 0, // TODO from relics
            // spam
            dungeonDamagePercent: statsStore.get('DUNGEON_DAMAGE_PERCENT'),
            dungeonBlockPercent: statsStore.get('DUNGEON_BLOCK_PERCENT'),
            forestDamagePercent: statsStore.get('FOREST_DAMAGE_PERCENT'),
            forestBlockPercent: statsStore.get('FOREST_BLOCK_PERCENT'),
            mountainDamagePercent: statsStore.get('MOUNTAIN_DAMAGE_PERCENT'),
            mountainBlockPercent: statsStore.get('MOUNTAIN_BLOCK_PERCENT'),
            oceanDamagePercent: statsStore.get('OCEAN_DAMAGE_PERCENT'),
            oceanBlockPercent: statsStore.get('OCEAN_BLOCK_PERCENT'),
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
            attackLevel: monster.level,
            defenseLevel: monster.level,
            // TODO
            bonusAccuracy: 0,
            bonusEvasion: 0,
            // spam
            dungeonDamagePercent: 0,
            dungeonBlockPercent: 0,
            forestDamagePercent: 0,
            forestBlockPercent: 0,
            mountainDamagePercent: 0,
            mountainBlockPercent: 0,
            oceanDamagePercent: 0,
            oceanBlockPercent: 0,
        };
    }

    function getInternalDamageDistribution(attacker, defender) {
        let damage = attacker.damage;
        damage *= getTriangleModifier(attacker, defender);
        damage *= 1 + getExtraTriangleModifier(attacker, defender, 'Damage') / 100;
        damage *= 1 - getExtraTriangleModifier(defender, attacker, 'Block') / 100; // this is kindof ugly... I blame miccy
        if(defender.armour > 0) {
            damage *= getDamageArmourRatio(attacker, defender);
        }

        const maxDamage_ = new Distribution(damage);
        // damage range
        const result = maxDamage_.convolutionWithGenerator(
            dmg => Distribution.getRandomOutcomeRounded(dmg * 0.75, dmg),
            (dmg, randomDamage) => randomDamage
        );
        // accuracy
        const accuracy = getAccuracy(attacker, defender);
        result.convolution(
            Distribution.getRandomChance(accuracy),
            (dmg, accurate) => accurate ? dmg : 0
        );
        // done
        return result;
    }

    function getTriangleModifier(attacker, defender) {
        if(!attacker.attackStyle || !defender.attackStyle) {
            return 1;
        }
        if(attacker.attackStyle === 'Ranged') {
            if(defender.attackStyle === 'TwoHanded') {
                return 1;
            }
            if(defender.attackStyle === 'OneHanded') {
                return 1 / 1.2;
            }
        } else if(attacker.attackStyle === 'OneHanded') {
            if(defender.attackStyle === 'Ranged') {
                return 1;
            }
            if(defender.attackStyle === 'TwoHanded') {
                return 1 / 1.2;
            }
        } else {
            if(defender.attackStyle === 'OneHanded') {
                return 1;
            }
            if(defender.attackStyle === 'Ranged') {
                return 1 / 1.2;
            }
        }
        return 1 / 1.1;
    }

    function getExtraTriangleModifier(attacker, defender, type, isDungeon) {
        if(!['Damage', 'Block'].includes(type)) {
            throw `Invalid triangle modifier type : ${type}`;
        }
        // for dungeons, use the (probably) most optimal value, the one your weapon gives
        if(isDungeon) {
            const dungeonEffect = attacker[`dungeon${type}Percent`];
            switch(attacker.attackStyle) {
                case 'Ranged': return dungeonEffect + attacker[`forest${type}Percent`];
                case 'OneHanded': return dungeonEffect + attacker[`mountain${type}Percent`];
                case 'TwoHanded': return dungeonEffect + attacker[`ocean${type}Percent`];
                default: return dungeonEffect;
            }
        }
        // otherwise, depends on the defender
        switch(defender.attackStyle) {
            case 'TwoHanded': return attacker[`forest${type}Percent`];
            case 'Ranged': return attacker[`mountain${type}Percent`];
            case 'OneHanded': return attacker[`ocean${type}Percent`];
            default: return 0;
        }
    }

    function getDamageArmourRatio(attacker, defender) {
        const modifier = Math.min(95, (defender.armour - 30) / 126 * 50 + 25);
        return 1 - modifier / 100;
    }

    function getAccuracy(attacker, defender) {
        let accuracy = 75 + (attacker.attackLevel - defender.defenseLevel + attacker.bonusAccuracy - defender.bonusEvasion) / 2.0;
        accuracy = util.clamp(accuracy, 60, 90);
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
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT_PERCENT') / 100);
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
// estimatorExpeditions
window.moduleRegistry.add('estimatorExpeditions', (events, estimator, components, petUtil, util, skillCache, itemCache, petCache, colorMapper, petHighlighter, configuration, expeditionDropCache) => {

    const emitEvent = events.emit.bind(null, 'estimator-expedition');
    let enabled = false;

    const exports = {
        get
    };

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-estimations',
            name: 'Estimations',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('state-stats', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update() {
        if(!enabled) {
            return;
        }
        const page = events.getLast('page');
        if(page?.type === 'taming' && page.menu === 'expeditions' && page.tier) {
            const estimation = get(page.tier);
            if(!estimation) {
                components.removeComponent(componentBlueprint);
                return;
            }
            estimation.isCurrent = !!$('.heading .name:contains("Loot")').length;
            estimator.enrichTimings(estimation);
            estimator.enrichValues(estimation);
            preRender(estimation, componentBlueprint);
            estimator.preRenderItems(estimation, componentBlueprint);
            components.addComponent(componentBlueprint);
            emitEvent(estimation);
            return;
        }
        components.removeComponent(componentBlueprint);
    }

    function get(tier) {
        const petState = events.getLast('state-pet');
        if(!petState) {
            return;
        }
        const teamStats = petState
            .filter(pet => pet.partOfTeam)
            .map(petUtil.petToStats);
        const totalStats = util.sumObjects(teamStats);
        const expedition = petUtil.getExpeditionStats(tier);
        const successChance = getSuccessChance(totalStats, expedition);

        const ingredients = {
            [itemCache.byName['Pet Snacks'].id]: Math.floor(expedition.food / 4 * (1 + totalStats.hunger / 100)) * 4
        };

        const drops = {};
        const expeditionDrops = expeditionDropCache.byExpedition[expedition.id];
        for(const drop of expeditionDrops) {
            if(totalStats[drop.type]) {
                drops[drop.item] = drop.amount * totalStats[drop.type] * successChance / 100;
            }
        }

        return {
            tier,
            successChance,
            ingredients,
            drops,
            teamStats,
            totalStats,
            exp: expedition.exp * successChance / 100,
            skill: skillCache.byName['Taming'].id,
            equipments: {}
        };
    }

    function getSuccessChance(stats, expedition) {
        let teamValue = stats.health + stats.attack + stats.defense;
        const expeditionValue = expedition.stats.health + expedition.stats.attack + expedition.stats.defense;
        const rotationDefense = stats[expedition.rotation + 'Defense'];
        teamValue *= 1 + (rotationDefense) / 100;
        const successChance = 100 * teamValue / expeditionValue;
        if(successChance < 1) {
          return 0;
        }
        return util.clamp(successChance, 0, 100);
    }

    function preRender(estimation, blueprint) {
        components.search(blueprint, 'successChance').value
            = util.formatNumber(estimation.successChance) + ' %';
        components.search(blueprint, 'exp').value
            = util.formatNumber(estimation.exp);
        components.search(blueprint, 'finishedTime').value
            = util.secondsToDuration(estimation.timings.finished);
        components.search(blueprint, 'levelTime').value
            = util.secondsToDuration(estimation.timings.level);
        components.search(blueprint, 'tierTime').value
            = util.secondsToDuration(estimation.timings.tier);
        components.search(blueprint, 'profitDropValue').value
            = util.formatNumber(estimation.values.drop);
        components.search(blueprint, 'profitIngredientValue').value
            = util.formatNumber(estimation.values.ingredient);
        components.search(blueprint, 'profitNetValue').value
            = util.formatNumber(estimation.values.net);
        components.search(blueprint, 'teamSize').value
            = util.formatNumber(estimation.teamStats.length);
        for(const stat of petUtil.STATS_BASE) {
            components.search(blueprint, `teamStat-${stat}`).value
                = util.formatNumber(estimation.totalStats[stat]);
        }
        for(const stat of petUtil.STATS_SPECIAL) {
            components.search(blueprint, `teamStat-${stat}`).value
                = util.formatNumber(estimation.totalStats[stat]) + ' %';
        }
    }

    function calculateOptimizedTeam() {
        const petsAndStats = events.getLast('state-pet')
            .filter(pet => pet.parsed)
            .map(pet => ({
                pet,
                stats: petUtil.petToStats(pet)
            }));
        // make all combinations of 3 pets of different family
        const combinations = util.generateCombinations(petsAndStats, 3, object => object.pet.family);
        if(!combinations.length) {
            return;
        }
        const tier = events.getLast('page').tier;
        const expedition = petUtil.getExpeditionStats(tier);
        let bestSuccessChance = 0;
        let bestCombination = null;
        for(const combination of combinations) {
            const teamStats = combination.map(a => a.stats);
            const totalStats = util.sumObjects(teamStats);
            const successChance = getSuccessChance(totalStats, expedition);
            if(successChance > bestSuccessChance) {
                bestSuccessChance = successChance;
                bestCombination = combination;
            }
        }

        const teamRows = components.search(componentBlueprint, 'optimalTeamRows');
        teamRows.rows = [{
            type: 'header',
            title: `Expedition T${tier} : ${expedition.name} (${combinations.length} combinations)`,
            name: 'Highlight',
            action: () => {
                const color = colorMapper('success');
                petHighlighter.highlight(color, bestCombination.map(a => a.pet.name));
                $('taming-page .header:contains("Menu") ~ button:contains("Pets")').click()
            }
        }, {
            type: 'item',
            name: `Success chance : ${util.formatNumber(bestSuccessChance)} %`,
            image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png'
        }];
        for(const object of bestCombination) {
            teamRows.rows.push({
                type: 'item',
                name: object.pet.name,
                image: `/assets/${petCache.byId[object.pet.species].image}`,
                imagePixelated: true,
            });
        }
        components.addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId: 'tamingEstimatorComponent',
        dependsOn: 'taming-page',
        parent: 'taming-page > .groups > .group:last-child',
        selectedTabIndex: 0,
        tabs: [{
            title: 'Overview',
            rows: [{
                type: 'item',
                id: 'successChance',
                name: 'Success chance',
                image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
                value: ''
            },{
                type: 'item',
                id: 'exp',
                name: 'Exp/hour',
                image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
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
            title: 'Profit',
            rows: [{
                type: 'header',
                title: 'Produced'
            },{
                type: 'segment',
                id: 'profitProducedRows',
                rows: []
            },{
                type: 'header',
                title: 'Consumed'
            },{
                type: 'segment',
                id: 'profitConsumedRows',
                rows: []
            },{
                type: 'header',
                title: 'Profits'
            },{
                type: 'segment',
                rows: [{
                    type: 'item',
                    id: 'profitDropValue',
                    name: 'Gold/hour (produced)',
                    image: 'https://cdn-icons-png.flaticon.com/512/9028/9028024.png',
                    imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                    value: ''
                },{
                    type: 'item',
                    id: 'profitIngredientValue',
                    name: 'Gold/hour (materials)',
                    image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                    imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                    value: ''
                },{
                    type: 'item',
                    id: 'profitNetValue',
                    name: 'Gold/hour (total)',
                    image: 'https://cdn-icons-png.flaticon.com/512/11937/11937869.png',
                    imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                    value: ''
                }]
            }]
        },{
            title: 'Time',
            rows: [{
                type: 'segment',
                id: 'timeRows',
                rows: []
            }]
        },{
            title: 'Team',
            rows: [{
                type: 'header',
                title: 'Calculate optimal team',
                name: 'Run',
                action: calculateOptimizedTeam
            },{
                type: 'segment',
                id: 'optimalTeamRows',
                rows: []
            },{
                type: 'header',
                title: 'Stats'
            },{
                type: 'item',
                id: 'teamSize',
                name: 'Size',
                image: 'https://img.icons8.com/?size=48&id=8183',
                value: ''
            },{
                type: 'item',
                id: 'teamStat-health',
                name: 'Health',
                image: petUtil.IMAGES.health,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-attack',
                name: 'Attack',
                image: petUtil.IMAGES.attack,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-defense',
                name: 'Defense',
                image: petUtil.IMAGES.defense,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-itemFind',
                name: 'Regular Loot',
                image: petUtil.IMAGES.itemFind,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-eggFind',
                name: 'Egg Loot',
                image: petUtil.IMAGES.eggFind,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-hunger',
                name: 'Hunger',
                image: petUtil.IMAGES.hunger,
                value: ''
            },{
                type: 'header',
                title: 'Traits'
            },{
                type: 'item',
                id: 'teamStat-meleeAttack',
                name: 'Melee Attack',
                image: petUtil.IMAGES.melee,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-meleeDefense',
                name: 'Melee Defense',
                image: petUtil.IMAGES.melee,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-rangedAttack',
                name: 'Ranged Attack',
                image: petUtil.IMAGES.ranged,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-rangedDefense',
                name: 'Ranged Defense',
                image: petUtil.IMAGES.ranged,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-magicAttack',
                name: 'Magic Attack',
                image: petUtil.IMAGES.magic,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-magicDefense',
                name: 'Magic Defense',
                image: petUtil.IMAGES.magic,
                value: ''
            }]
        }]
    };

    initialise();

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

            const activityEstimation = estimatorActivity.get(skillId, actionId);
            // dont count food and combat potions for the outskirts
            const excludedItemIds = itemCache.specialIds.food.concat(itemCache.specialIds.combatPotion);
            statsStore.update(new Set(excludedItemIds));
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
            const actionsPerHour = activityEstimation.actionsPerHour * activityRatio;
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
                action: actionId,
                speed: activityEstimation.speed,
                actionsPerHour,
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
// guildSorts
window.moduleRegistry.add('guildSorts', (events, elementWatcher, util, elementCreator, configuration, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'guild-sorts',
            name: 'Guild sorts',
            default: true,
            handler: handleConfigStateChange
        });
        elementCreator.addStyles(styles);
        events.register('page', setup);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    async function setup() {
        if(!enabled) {
            return;
        }
        try {
            await elementWatcher.exists('.card > .row');
            if(events.getLast('page').type !== 'guild') {
                return;
            }
            await addAdditionGuildSortButtons();
            setupGuildMenuButtons();
        } catch(e) {}
    }

    function setupGuildMenuButtons() {
        $(`button > div.name:contains('Members')`).parent().on('click', async function () {
            await util.sleep(50);
            await addAdditionGuildSortButtons();
        });
    }

    async function addAdditionGuildSortButtons() {
        if($('div.sort > .customButtonGroup').length) {
            return; // skip, already added
        }
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
                    .click(sortByLevel)
            )
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByIdle')
                    .text('Idle')
                    .click(sortByIdle)
            )
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByTotalXP')
                    .text('Total XP')
                    .click(sortByXp)
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
            background-color: ${colorMapper('componentRegular')};
        }
        .customButtonGroupButton:not(:first-of-type) {
            border-left: 1px solid #263849;
        }
        .overrideFlex {
            flex: none !important
        }
        .custom-sort-active {
            background-color: ${colorMapper('componentLight')};
        }
    `;

    initialise();
}
);
// idleBeep
window.moduleRegistry.add('idleBeep', (configuration, util, elementWatcher) => {

    const audio = new Audio('data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU5LjI3LjEwMAAAAAAAAAAAAAAA//tUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAwAABfEAAHBwwMFBQaGh4eJCQpKS4uMzM4OD09QkJISEhNTVJSV1ddXWJiaGhubnNzeXl+foSEioqKj4+UlJqan5+kpKqqr6+0tLm5v7/ExMrKytHR1tbc3OHh5+fs7PHx9vb7+/7+//8AAAAATGF2YzU5LjM3AAAAAAAAAAAAAAAAJAXAAAAAAAAAXxC741j8//ukZAAJ8AAAf4AAAAgAAA/wAAABAaQDBsAAACAAAD/AAAAECsH1vL/k2EKjkBuFzSpsxxqSNyJkAN+rYtSzqowxBIj4+xbhGhea64vJS/6o0N2kCEYcNlam8aciyX0MQgcAGg6B2FaISyYlBuZryuAOO55dekiHA8XlRSciGqOFkSGT0gH29+zXb3qZCGI34YRpQ81xW3BgLk4rmCBx4nica+akAxdtZ9Ecbt0u2tkaAJgsSZxQTHQIBAgUPCoThFGjaYKAGcg5pQAZtFnVm5iyQZUiHmQxhnUUSRlJqaQZAQIMNEzXHwxoXNnIQE0mfgRs4WZMPhQoKNQz2XNTGDERk1R8MzKjbhYeARQDAQuCTEZJQNRmHhYKBUkwaBrXYUY6qmYixlwQYaWjRqXIAgwiyjSy0tq15lyH4CH1VGIrrlLgFlIeS6Y6vt5mmKVs2VuMBExodbOQAyrVL0ZFWw83wUATGRdphe4xYKYGpcW8TfWY7EBw0gEgO3FF9r9ZfTyexAcHuXK4S1/KmZZcuY4dilWvZjk5GJiLy/v/+8P7nv+67vn////61aOYw+SzFTcCoSQAIAMBMJmZS4LQ2CTKw3FR4Z9KJp0JHqmoDheY0ExjImmhlMchSZowzBlg//ukZNcA878wQesMTTAAAA/wAAABINFHBbW9gAAAAD/CgAAEMfgoxqTBGAjCAzM+nEmERhS44BSlBSQPNggqhCLdBGRaaycrEnNVnlRmYQAwKIRIXEoTUoUG1YQ4Yu80qIeZL4SZEh6eJcodBGYGNLEhAKYBcK3RJNNsaBJxtbTCnHCVuaWvdtFAEASRQOIq2pqIB3cUUU6eRdaMq62/UpbC3VkL/tdVPDKfrCHEZ3IXkpYGp6tLZlCLbIYAUwciAWHvwpnB6P0AyR3FH4Yk1FVm6Gtj8sv2JzKtjlllZzjUF8yxsUt/DOxe5lPbr6wsOnzC5yLtvPlGf////6v/ehSKIlwzaOQw5sVfMZnJWTFjh5sw8vjNMA6DATCSu8MyvkaTMYACrTSbBakwU8KEMphGPTAHQJ0x1EgBMZLCnzANwNEyFRNaMMMCajGyzoYzLQXzK0QcNz94UzAiQz7XJaMNcJ40eisDZdPfMdkKMwkjFjXoPuMwERoxCA2zQBaCMcIJIwTQNTFKEMMLQDAwkwtDAvCCMecLwwQwPxQAsxOAzTCDB3EhpTBvBtMD8AkwGwNzA7B8MCEH4wSwIjEiDfAgDpgdgQommAGAUYZYARABQCgZzAGAGEgJjAGASMBo//vUZPWACFpQRn5zRAAAAA/wwAAAO8IjHnn/AAgAAD/DAAAAAIBABDAC5gSAHmCEBeYCgB5gFgPDgBruq2jwBTEqN4jAIAGYoYBQBSdJgGgAkwDpgCgDuwDQBlHAEAMs9LZm1RFZ94KYm49QwIQBzABAdBQHYKAABwF44AADgDB4BMvq7qqrKX1ZK/Dc1hmZMWe1sUTn32MAwAYtAMABBwBjP0+FpuXEYUwclAEVWaUkMSgAU5dtnr/JEM6YFmXeUgsZmMNtdzr71jTczw//23lNufq2bNW/SRyWu2+0OO9EY3S2rGNJT42////95/////z/5zXe7/n////3e0lazT1akvvW5ZTY7vZcy/u/5r+////4c1+V38caelrVKbGvjalVAHbbRMAvAYjAfQIYwCMDFMGQCYTDzhi0zU5O/NFFDoDCVQa4wE0DRMB7AITAoAJEwIQE9HQEUwDgAPeAwB8ByMERCgDBLSGU2LbA2fPoxtBwVAEDBCLBmOgkAQGBQHCMCjCUhzzIYzLYiTEYIwgJVhmpK+jLwJVAEDDC8rkhFLnKv48obVLEVKUcEbn8AQAoaiQCiMB2YsnUtiDRWTR6P1XSrTOT6Sekh2dfWclkrrQrUP2Ypl8Il1M71l9ok/0TgWJT8xPVpVVpoIl2OFbLLsajlLlOW7UapqsZprWUajVy1Wl2VNKsqaml1rVLLbN7cppcd1qa/lqmpsq1nUU1s34WrRXYmzhgAH///8p//+Q/t///////////2oHxqMGAXgFRgHAByYCyAzGBOAZ5gu4XYYswmzGe1hbBg1gFiYDyAACAA5MA5AXDAagM0wBoAlIQAIAgBJgDQA8YDeA/mIGjqxi4KAAA5OdkCR5gSAwVAYHAe3oyA5hwTB1QM5hQEwFAVIRibLSIA6OrDTATCEQyIVXOkOU7Lvyy7RMxXY10v0qVnCl7FWBPqu1ZQwEkKfudPLnlRbTGA/OJDeMrpSxC4ePqTKHOdqoWUTF+G7Z0ZWWRodXFKK9lyeSw//u0ZO6MyDVSSh9/oAoUQAii4AAAG0UnJm/1j6g2gCNIAAAAt1AWqYbTaKK7WdS/QNPZPzjxwKTbQDd7AVgP///5On2/+GforMqACAMJ9rQDBSIkSQQiGMzpgLgQYYMChyGq0iGOJXmHgnGFgOGG4EmFwFGFQBBwPgoAC45hIBh6h0phOJqAl0pTMlAIL6JgTeVN0GGwZuBmBBOFQZLACLTWQRA33dyAzAINWd0lexSzMYlWqWcYc20sbhGJY5kAPtGX9jjmU8EQxLZNVqNd5Dc9LXt+IVpNPxKXzkY3Hbk3B2MZty6N1qalisSuRmHq8crS6ahqQ1t7m6aEX78bor2XO8ytTB0jWBQK47qgCb/ZKk+mr9Cb0b/SpiC0qVDahzplGcQpqTCaGACEBBjf/cwAgKSsDESAwMEEAEwrAYjT1K4NsAKIwzQITBgAyMBoDAAgQmAQCYQgLRF12mDwCRlMjzGHHSYz+u0ooIgVdSLUOshEdEYKJmVlQEB1gm6pKJ53e7lQICiYCovUsONLX6MhyelslDkhFg1IJ6YwkUIiuhn93UUBeHoTj5WBsmHy42jOSEeHx6mWQu3Oca8tROMwHUT91h6hRcmSILh86Wtk0jbWTlbRSK7segKxGUSoUkwBoxba9OprdjJ/QKiBr3/s8bc9el2U/k0Vvk4ASAIJ7ZADADgBcwA8AoMAWATzAMwK4wIQIjMLVTFzG6goUwJECmMAIAQw4BCMA0ADzARwHowCsAUDAAF9G/MAQADT//uUZPsABe9Ay1N/6IghY2jMBAJCFi0HMa9tjyiIgGO0EAAAEOAf0yVzAwSu6GX6Kwd+xIKf1OUwvWPxETRQwHCLJmWjoBI7VzOOA0oZZXweXQq6rGUwCjsosguOg6qVw6JBYDA6MnPOkRbPSadJ8Eg5SppE9bSN1FQdoWMXtl+YzA/cibKx0mcNkdTPThdNvbaPXJ6+x1/paveNjFM0UJBcTgATBythwqaUcTYvaMcnx9kltExgQgULAO2jZdlmNNVF5oJEQmpRQ40BklwAEICCqffYARgGmA8BwYBYDZgVAlGECIKZp1K5pdiumEsDAYKoJJgUgVmDAJGFIhiMDVYHnioFAY6RIAwKDxDZ3VjITS6iOrlUsVAIVEy9Cw1FACqfgRRZ/tc1DIBA0iAW/hVlpn3fkikWoToRJJWOGJKVAMupTr3JHxpxtUmN6lsonxaOIko8iWTI3WVhidpmsfZxayrVrTq5wuHs2K5aQidR9fy/YqfXqbGHp3BLAEmY//u0ZM+ABdhCSlP7Y8gxoAjdAAAAFeEFL691iejBkiN0EI24JHTjbAgrz1Ia+frz8OH7s1rbNL8OtcYKwPAkXSOBI4BAeLvXqWHfzio11CmqQAgCCeRtAwJQHDA4AbMEMB4wfgSzE3EWNuCUo8URGDFiAjMHMBkwCQOQKCMYFgZZgDAgl/lhWHGAIBuaMgUBis+gIOrqd2DA4GtJVxPv4YNKZ0kLGOQOHAhId3EGmAazwj4MFLB9ZwLSzeqWpO3k+5SsuDYCfGncWKOU4bOBgugSFuHDNatJQnVYRGqkqJXizAzh846dKSbZ+J9h0qQtqXDJyeMD+CB4l2Swr3aRMft/tNNzM6cgOYfr43WkAS3W2VCkgDZO8x1JL3yB/y/Gc85c5D2GMhe0/y0wrtqDNec+nT4+ADBM95nADFywwJPEaQMT4VB9jAGUlY6XnAQFWYKCAYQAERDcGEIUCgUBEzhuoXCw87WEwaFQMApxX+eAOANyUWIs0YLlCZJg4YOhiIAElbVEJw8BGrUhZUYLBYNB1Dt+NwxADobvWHdLqXlHIKobLkPRFIy4kXdX4YlE7dv6lFnKZjMmnXuduURG5EZTTxmVzdNPP0/kgnKKlsYV53DV2dnKevKr1mUVL1Hd1MWa/OY97huzfvUzI/UYEVrTXwADHKcUuBh0rU/UxugkwcQB2NKt7qfTW3kMfVXACGML7JECICAwOQHTAkAUMFcEMw3A7jUtnyOFIVQxAQZzBiBCMCIDIwGwMzAOBiBg//ukZPeABeFFSVPcY+gnpVjNBCJ+FyUJJ03/oiiCAGOwEAAEESscMtkFALTKUHWMjVwwZZM2rhhAVOokv0yIUqTIBYxonMBBltruohoF73GgEIo6m/uvval8ru2YYRNf1rzRmdQ3Rv/JGHTsqKBOGZCVQQphNIB+rSq/bdmpzWN5hhYc4vehbU3PymP5+amNsUSTVqdR5dWvFZ2Wlfzk31rt74A2dZu21pJQiJSrUoNXWF3E6nsgfsz6UNLpc449dj2H2b7XCppQrxX/Z/SgAxAYNL/7QDSTN1w0FTv6MIAOEzG4VzX2EHMJUDAIYpCLjAQRAJMMUi4uKoc+JYDR2/LmDBIhE6rNlyhAkWI2tM/wUKoKeBjQDhwKUFYkvlUNzectMGiEmDr34W+6z5Vs0zBofjOMulEvalOzkN5QDQRSRy6rSU07P6h6I0cr1NXashf6VTMsltmZktZ/5uHJ6xetXKk7nVvSSJ3LtqrC8L1qawmrf77lus25ODW6pkBnBkpIKeSAOSj+r4RDzyaHmfyz8/frskI9eYkmiOwjeJ8BcRrKHixAsqLxOTMm/FBJtEJVFRKAAihQYX2yIGAkBySg1BcDMwCgeDA9GFMfLqEyDR7zBOCGMEEFUwLwHzAo//ukZPaABbtCydPbY+gjwBi5AAAAFdj9K6z7gmjgk6O8UJm4AAHgezAlAPCAPCybMBkCUxMiMDHycWFW2ZqncAAMkAH1rRYACpTGk06LCSMC6i+re95qhEQa/fMqSVWr3M9w6tzruO+7UriTgQ3GH/i50E4C8DiwyGxSTg0s2HxFAVzNDMVBghgQlU0QfIRWVbOIXnZk5KCCB5C+DJsUqj0HIpgrqEaUm0iU3T/OKy9iiRWkSApavrc3AoJA2uveUGZdgok95RFoc3+JnYhJmlZ0t/K9rGd3UjmgmZDR5ulTVL3rDQWYrHc1sjBgOgCCQPgkBeYHQAhhRgcmfIcSbVoN5hfAPGC2BeYC4FYEDQJNoWE7YIg6YoFjMPhMaAwOIyWMitEQiYE6+E2FBYBoqZCBAKDaIiV4wAWezs1jQGAAgRAqdtpVULENGtA+PxaILxPgH8sjkWy8WXivQnEviedKiPjpfEYl0Q4h0PLsOwvMueV7pzk+ZfXR12loz2A4YyNdzx93fT44rXnWJasBBSvqCbjubbDkmgGk80yyI4zyUj+XXvnj2jaCjpT/eg0K03LP7bwyTp0oDIKEEjYSmIGDQuF8pM06FSAEILBzta2AYB4ChgIARmAeBYYFANJg//ukZPOIBaQ8SevbS+o4xjjtFCNrFXj5Ka9xieDZGqP0EI247iuGWpmca8I0xhDAymBSBQYCABpgMgHGBsB2YCQEYKAKTbZAFwHzBpJUNS8KIiiMCFQCFBCmytdK+Ix6OcPMc2BoNKZ20JoIB7sV44ITDaV9Q3KuT1t1466KDQVAKDoMhPbNiPxogj7w9EweyuVI6onDhekeSNlaMyAgWi+fOMF1t85WojhESHjm6K62NDQmDcej6lbM2jx5trupe+U1t9dGhtn6sYcscAIDymgnsA5lIA+vL/Pmq0eyi8CsbVB8gnPlwbA0sQai29FU2UUKVQAAQJjqWxQAQgQGAuCqYAgExgSgwmDgKMZdeURolDVGESDuYHQHBgOAMGBCAeYDAHRgSATA4CcvAysKAKGIMQyIl6k5BPugLJZ9WqWuiI/BrxZo1xakuEvEcHpR6x7AIBHkwGXYyS7nvONy+IMlWEs645JgHHnyeEhoeD2mQhILAhlcsqT1Ky4savEfJ3VEFTT1Q/F4T8PFWutHUNH6wsxe2cRrGBJOS1RcsY62Re12zaK9KehJOZxlyMkgXOSnjneTAnkT5eQcPQSbJlBYCFSCQYOxELJer1sXRiXQPakwLI1I71KkBihUd7+6//ukZOmABcVByWvaY9ouRIj9BCJuFo0NJa9pj2jBi6P0EI08gGA8AiYGoAgkA6DgXjBcAXMm8UU0YACxoN8wWgIDAMAsIQSVBIYFEziuXGEjzZsEHA1GM7zdgcA25xbGUiogEkWYpACSL9ZPTDWedNExAE3XqZNqElTuzdQzeL5V0uISonxwlYmioYsH5UQ1YeuS4R0Klk+MUSvK2WbOcUEqwRSuWyucoOuHJ6fWsfDydrCoYn16O07fiY7nFYdRxslFjoEcggARKqiOmYuhg669aW1fv6HASPwoDTInXHLmICY9TRsBiwFpFRrGMcBo5yXiZPwEFVpnluEyoqUc207931pYAggMHd1sgBgJAPmAeBwDAHTADBOMCQRUxJaiTLmFbMCkFIVBnDgcw4QmFRQYhAwcBWlQ2XsO4UMKi2CbkMtjDgk0WgxnU6h6FByGIhS5cO3EF/uVY0AAgiVjPrkl2H224wCOHyxOVDcSi4DcuA2fWqCUJxkflay1YpPmEyfi5VQfra2ZICx5YjVQFsVvLztDstdPUyinp9VWelajho4t67/1ZbvH1U1abLEQKrRIAhF1bWj/zVe39rsY6PmVTzWo6GO9/qMQ+Txr7/AXf1QPM/bypjPj731lgAAQ//ukZOGABRw+S2vcYnpDw1jNBExrFPUJJ69xiejEE6O0Iw8FDHNtjYAJALMCoDgwDwFzAwBIMI0P8ziKMzWvFVMKoGAwQwNTAbAdMBgBgwLQSywAmoI19+EFzINE6Ahg+0phpgI0KMBbTscC5+cSAGgjIcCMrlLbO9nrkwFxJpmd8SRJWGZgWimZADiSQzqM5JQrHgcjwkjgtTmRwSUi8ntlN18tksuVD4gn1jZr9WyuYcWFpm0ZjAnXstO57ry9zWO3LS+1c/aa2sF2AksdP/BShj0Km4ABgcERMnMejp+ISPCIo6VP/9hBuZCo7nZb9XLLZLKlOrOZnIf67KwJoco5orM0owIOXWkgDBNA+MGQEcwJwEjBQA1MNMNI03HzjjxDuMPQB8wRwAwSA+CQKjAcCXMAIDtIZ8n7QJGVwH6YSjsNfZaJCAGCBa9VCJUz4dizOxAws3RCTTGAYRAgVDLlL2MgUPSZtVYzdi7yMuyAMV0x1GPbo9oQljSBIoRk5aKySev2Cqz7WtvKlHJWpL20iQ08WRk1W7Chxj9V89xYcxR0gfjJjC9REs+KvxsxIBF0BmaZqtqOpNdgBVqVSpADua/LoOQWI9u534ggchvi12vXhooNiL1UWQrgXbdm//ukZN+IBXVBSOvbY8o2BjjdFGLEVqj/H69tjyDUGuMwII3lgk45eSXhnYioe8vow9UgqkAAIAhxJEkAYB4EBgCAfiMDghCBIRpDA7+yMYchAKhHmAkBkYDAARWBWYHQBRWBIPAT2ZMg8ZT4IRhiEoM/sPSgmGoOVbKmlCCBNQDDOCswUMLutSEIcOg2H9lYgDW/qYvfILMRj7tyN/E8JyX0DiPY5sVd9r9HBT9v3HZRFYIZI8jKZ2SRGVyMwIJT2iiBnwpJppRUUXBuIbb0VpGgwYxGkmHxSqqePrse9j8ZqPbkAlgihui/4K10mJaJxNvADmVZCx4JjfROAj+/LYvsf/sjFYrsX5y657ksIFssrLFDiMl1gYe0EWAuDVJjtUgE0LDu6xsAogP1U1iD9tMHYHwy91oDUCC0MI0C8yIKjCggMFh8GEgwUNi6bXMkqTzRGMJklH2HlKUQwoCFKH5tSoQCcSZBjQAhwSX6vBJZwJ6xHYaAgQQusWsal/6K7FYAceBoy9ckbI7TBpVdgeEs2h6KP/G8Hy/mUqn68CalNNuC7XzEuyidiJVqevKZbTTcX+5P3rUNyiYjeNa7EJbEpD3K/S4YZdq/lvPuqxqX3LmwiBsoACZMWU4BmJzH//u0ZNYABcNCR+vbS/g0hJi8BONWVgUHJaz7gmDDgSNwNIAEW1vtWO+oKqHCUcuVKyCwKtcQLLjpFY5IuocECRSspZaAk2AGIAx1bI2AbDZvzGYecuBg2BgmVy7aaoQc5g/gUBilJRIAAaDRsYjESA1iUpGQEefW5gIPMmlsNRUiBjdqGtRpgDT5GkQDgmrx6CqBhYG7pq9QKhBil/O7A13HLCjuPhD0ufSJwQzOD7Efl0Qi0C0sQl07Kc3np47njj9mliL6zLy08Q5N4yV9eYSGvbtVfqQ9nXpK03bwpI5TSK7duVYrar2f1vHCr/oXphlgtkbyORSRAuFduT150+f2r/u5ri8X/ZV//+v/7+34e0TwOgW++Pzh50FCci2afW9dm/bwp3boAIgMHUjZIBgSAriEJ4LgamAID0YHoxpjsd9mRSP2YKARBgfgrmBiBCYFQAQQD0YEIAokAwjnEBQBUyChejHUESAWvJEoFAIHQFM3vPWFlg4oHNEGAEPuw+oyGCQjBWN6lBI2iTaqc5NXrlFVizMX4i8Tlc+y9mrtL1nXUVHgyEpI/UxEui8SC8yWEXqE91yE8ufHZeNcBzZ5e+0rWxtHp9j51HAiq9VromkI+xgYRPGwKEjzrV6HMSIDEnguZQYqm6Up9m7HgAl+3qyv8HTO1NZJILRWdOi0Tj0FSgSjlxpILofRgFIdQ1c2wAxjlNIkAwHwACYIgHAnmCsAgYcYMpqYKUnIWFWYhAGxgugZmA2BeYKFhhFQ//ukZP0ABV9ASOs+4Jo2YAjtAAABVuj1Ha9tj6DNi6O4EQ5UmAiCxjj0kIePn/Uw4MhYDOLDTCRIHSdPOdeEqIgwoDzB40CwDRAUxQQF6beNK+4MCq4qCwYnq1iaHshUXxQFzSUGI1G5POSKekRh4vmJ0qbQmEgknphVqB34sdjsxGvTnxUK7UL2PqqJWiWyWThZZvoj1UkststjXuOkTJwWebf+jPs/Y7qa0JRIJLahQHTOBWpaNT2aqsuRFvn9Y7NM08qhxPyLuXxuqGtgxkDOoDMnGe95V3G6gihhLppAQoaHMlaQBgjgnGCEDqYCYFhgVA0mC6IUZL1DRptijGDUCSYEIDBgCADmDQMYqGoAGYsCk244VQiboyxiMSiwNXteqoWStoVmCRGVAEkzFoOFgiJA5N0wKB1bMd52hEBGLZ/E+u6t2z8WLRNoZGYtQB9OqFe5w8tfL5oSCC0KhFEkUGiwwKysyLt1SiJyFbBEIzMCstkiHVisSGLiWqOTVzKfEjUrv9DIABF6a67F//+9rKW4JBKNIBgRmnQaPCnrFb09Wln6/+5yNSrP7VIOZYDOBosBSwAPtUdHrrP0Lm7GGf4rgAQgkHdjiQAXAYAoIoEAaMBcEswThCDIvpuM//ukZPSABZo+xtPcYng1Rei9DCNOFjz1H69xiejOEaM0kIgw0gVowYwXTBWBWMC4CowFwAzAOAyMOBgIB6gEBjAOMz5kxEAhoPLNn2qFpUjYemaULh4Se4CPwYEC1yHUQgFGimvzdMAQwmbB8swz+73spgxga/xPHgGA0le0Q5l0Xl5QDclvmK7YiwkdH6EPhLdHNIZ1dUAzAgwqWlIJVtaNvvoNThKPB0bwL6E+nsnpJfdi6YYavWEg4Kwi7qsEr9xIOQBAAjLJQs3EgKviDfX+3f2hC0kOSA2FxRfSKXnDY1FSeo09KiZcLTZoaLJAh6zk2AEaMx1W2kAYCQApgTgCCQEocDMYRgCJmyh1g7DEHCjmDMBMYCAGQjFJCTjA4+UIduMCoLMP4oyCKB4eKMurPEwPemMVbwhA4k7gg3gADK3dflAzKYsTYhB6zbuSHRKPipc4VzCGA9JRwP9kNMctkodV52doBHcKSw3u86TinrWRHunDZkenuMWogqUR9+U/X2DuYCyhDQcD4m2CzkX/zINAY/Ini/XHSitSAlQA44i4g2RA5wKPYqR5PQFQePvVkGCokNrm0AVguG5Za38APSdmQEBVlixZShEqQAIYMHMbIABgDwBSYAyAiGAE//ukZOuABaw/x+vcYvg0w2jdBKZdFNz5H69xieDMACMwAAAEAH5gEIEQYCwDcmEcoLpikQROYDKBGCIA7JgD4wmAMwlFYwzBISBFMp6xAEBohOoUCNV8Yh4qACQAgpqsyeggLjqZEgcYdhSYLAUXhQOIQRAIC5ZYVQIC6Z8ap0Z4uJLZwemYpgDaBhQLwOgyAKi1fEjEId0ohrkCJeV1Z/RGugXp0r6c9MYzuDz5tGjYYkwrKypagPT4qFalXmH1UB6ogq9aKv3rZlINlwI0IBl5YluGPWO23bO7JCSgshEAEaNdWj6phOLhs13dK7/RLqquhDC6r/SrwZ1o7S50qvt12d+tHLrO9hH+0q1Tv4Byn97UAAgUOm2UAASA+YGgMhgXgkmDEFIYSIkZnJW/muKMCYVwNhgjgemBCBCYDwDBgcggkoCKdDxsMCoCZiujyFVUuyXRCPixFpqrJp0iDqOCjFKwCYKEiZ4qVHQsQlMAtyAhgv1HbktsxGdoLUGvu1MtBwPR4WTEyb4xGBqyOQjFURQjaMfoQ+DmCJz0TYlK6l77tSevQGbo9G5fYPikcXu6an5wiVqyYftpbOy70uT29EoSilY0BE3mE2t65/d90zsLLmUF6gBbRor7z1Lc//u0ZOcABkZBxev9Yng4ZEjMHCVrV+kDGa9pj2DfjONwkI2tLx7ElwTr0dJf6c3YKFFtW18q6KD7M97FVym/cJ/D+Lu7C1ZCCf9tb/XiqsgGKHB3LGiAYKIIhg9AsmBiAgYLAGZg/gzGZAhYa5IOACEpMHMB0wCwPRUIAAxmAiCW+U4jZew6BLQSUWH00vdIAgFyHlmo0KD8FJQDFVhA8AHCZEPA6D6ktzAIQVDKoxd+0RwYi0/FjZ+BMaxxH0mXXnRbHUbEQ/YLRZCE3Vnkj6PBypOXFw/CuNk8xk5eSDqjVoK9lcjbfMC0+dFVelYNV7da3eULdi+07FEJuKxsmqfF7+2UBuShMpxtANAxH5yLC0PZGisteAxDeRv9HSIPVpN+tZdlIdrloCiVvWWTwjY9DyWCXbHELo19u9X/1fqgAIUgSB3rG0AYCoExgBAjjIBhABiFwvjAsegMSMPQQAamAkCcYFgAg0PgEaB4clYlEYHpGJnCVQFBRGrNA4YcBnApcp4UAJEmAcWSIDwczaX1J6xUiYjBq9Zu+CiomjgFQ8lkqieeWYQ0awbF8QnR7YOTJwsvnR8lw7wnVXLVcdyWtQ8aWQRykXpyvGdF9dGYK4PWUEtm+rGn+3EbevXb/W+pnZClg3/+NzQVgIUNcgBBMw3/b1ZaE1IAouHzRwz/5e3v3btSTXv0rCBluanDPzqWZghdBtYeWsAKFplCNOxH/qqDABJgRg81baABQIBgngjmBEAkYJ4IpgkAwGQW//ukZPiABag/x2vcYng75Oi9FCOIVT0JIe9xieDnF6KwYI2okgZuwRhgsgPmBQAwYBABxg8MiIjGFhkJAddkveQ4gazCJdVVcZ/o+DhYnZP7zFAILIUxIBnhUsaWXMHgG/uFuPAwHq10WyyWQ/cHMaDcdiUFQ7LF5ILodDmXGSqrhlpEmfWL7Rnh0k9RZ0pDphTLTF18aVQvWN4cHp+PZbPCifNOVfLFHoV45to1vG+2YqFRrQ+gNuT6oiGsSSseoOOdP+edAgBrx9def0ij5kGaZfKFdkmGAoqHwWCANDobGJWEmGxNSy3A+X3naF9Wr////pqAIgWHUSZABgjAfmDGC4YFwFZgzgwGEAF6ZjLl5r3BvmEqBEUAyDgCQEAVEYGxgSgTCwArbyZexjrgmGKqLqpUIgsMMsPUuavZoRSUb4CYY8FQt9TkQFCsBDtLVfoQFFEbPRGx9kexQrwYYtQjnjJaPGiQJJOOloMn1OOGKdA9xVdBSjiZpARKpuXXVlhxNSsPL7ERKZx1tdBR0uGmyan0WLIUJdH+/GITwql5FoUT74UGEg++z9erWm+IKrbZAhBMb6zkrz8qqMD3omen6be8v3cQUEMFA6bc8/OZqxknIvFoAF7jTxRmC2qi//ukZOwABZI+SHvcYng6RHisDCKKFuz5Ga9pjyDPjKM0ZIkYgAIoCHTSBABgJAXjoKw6BOIAYjAbFHMRrIMw0xozAiBsMCkEEwHwDwcBoYE4CgQC+RASrBYIYmPwBkYVW2sWlL3kwtrzQodfUdxGLChdUZwmXpEiwEGJcyGkk74GDFJQVpVTYSi5Ty2KW1rtzgKApZjTTcBxnlhmkGN/BD/3pfnqmgyAM8kCTnpr03nnhGj6NUkMIyiRcYxUjTCoyeXWXWE5mZyOH3XNfgQIhbKKeSM3FRCNA9bCAOoXp09TQCKKgyClG20BNCAW1aVMLR8kdyWZN/68OBIQPi2vqdtxTyCqYz/ikAACBg5RQAABQHwQD4BgOzA+AYMLMHU0Llozc9C3MNADQwSQKTAXAhMAYB4wHwewYA+0SkdkQgCGQKGCZKEgtFU5i86ei+2JQl9QrOAes0qBbJkQit5kxQccqxCR2QuTb2V1FVVycLVpXLpqHg75UxCkqnqc/spJALrYR0MBYWnjJfGVU6d55VnSpu2uHi2wn5yfOh1EytTDurhbX3MUNSZHo+jNlw5Tv7/Q/0Ne+k5W8zFOzTp6a/mfMzubdkXvbIP0dlOrU1haBqbbAYmOOyW74BI4aFx///u0ZN4ABeU+xevaS/gnwujvHCJOGJFBFa9pjyDwjaM0YYlYSA2bmT902xUs7oHBGZVGAA0laT4RKRM9qiIdGLVQTPkwQFwIWEwWt+ugBCAodyJAgG1eHGqmDGGSZmCmGMZET2horh5GC8BeAiMDAOYDARh4clUOp9IYx4YAJ0pnGBxCrmGpNDxEAa8qsyYvcVmkaPy+SIBDQIYEYGCEDQA2rhgwCrjlNHJ7MzqLwFYrurLWQNjcGr2A4Ph6HJPAUrlfxF0WoyuKaq01NamaWUS2EyiHIjDUscOE4Z36tabwifcc4cuZ9s27dqxPXp/ckpJTLJbnXqV8u67rDLvK7xUWAykkaYxLppzWGVjATGlABYlZURAs4otoMEtGTotm77u6PR8LP4E6wJ6GS6//77vu527cHIFpeq6smNW0Ou1ax383nQAAwUOSSAADAPA8MAsHEAATGA2DOYKQqRkn6GGZQNsYMoPJgXAaGA4AgYlAZh4lGCg4iOtiGRkLHjb+YSEyNUoiz+ILw2zSGcAuMwNFjEYNBINAARMHgMmFaLMjiVeIBYGOdPzMFnmG0BxM0hHJ0OwkBuklChGkXgxGQgeBQcRIiiMkQnDoT3FhVOzMqJV5UeIJpkNOEdtQHReQD09ElIVSYDMeTwSh2aBqvXOvKbNJTnUPr1jB2unbgtevskguhaZ/uq/o/U3u5180wNUzZRqSLA7mh+SQy+0QbZqQ5SrdueticM5DIJEgQYEtzGPOtcbStT/yTqftgsYF//ukZPmABeJCxmte4Jg7YujODeIhWWEDE69xiejSjSM0YYh4L3Oz5aqgBChIdwggAGB8A2YMIDBWA0NBJg4Vg0FRpDdCAsMMsA8wgAQDAiBGEIEoXA+EYJA8AujdAhUATMRIZ4zqUvTAUCO+GBm6rMk8NFSybUMYFGFwyA0tIiqZwDIrt59ASORJj84yoKxVcEoihwRDUmnT+GQ6nRVqXdN1BylIC9wvtLjM+yAurYDjD0OrVrpgeMKS9iwPDV4vIZPVOBQnMAa6sLR5dgcz43oYUdVrOz7NY7GUCyAAJwMsKzpNI8SiyTSUXFEVppv/+q6BrpFSVxlAJTBPS5qeoFmhOfr72H7YEhcEC3CBlBWnyCqOcBGNcEm1mt62Rb7XexlslJsgUQeDqMmAcAqYCoFBgAASmAyCgYGAbZi3w6maIIiYHYHBgUAumBqAMDgFQuBAYFICQsA6sqIkgAxg0ienMVGpEBgVojkgpA/L2df4sPQUoHE4hDGOBRUQiwENp53LMlFwmTVYhG7czS08olTHi+g1pUHAnMZHAxWMEe64xMDKo+vqCcWizjTR7c8CckoZUw+jMXPZ84LSs8K7J1qX6elyTznSAsP5svfiq01GeSBIvJGU2NqRZIuTpUzC//u0ZNuBBkJCROvaY8gzY8jNDCNmFzj/F69pj2DgkWO8cI7UDoAlKQxokATB0aVqLVv9WoTMAoBM5PoVGz+g40m5ELeFAVnbQtokHHQBQh3RHmDM+MaTupEeiswCKPR5GiQAWAHTAgA2MB0DkwOghjBHCzMfp4UzCw9TBSA6MWikwqEzAwCMOgMVCZdlcToCoFKkyMiiowcAkTkH3SAwhlDi6f4RB8OSAkWVbB0FiwBGAqCAihERLoWAkhdGmTxocVWh5C3Nvjl0N5/WE4MCuQpRtKdi1ZWFOvx+LmPFSrDHY4e4EdyfpbTjFaK7Vz5Rpx7fqO+V1KtsErU9Tzi4xdtnheRxj1l8HD8DNKPSxbiCa8JB/+lGvQp2QshxuRgBws+oqnPrKBZU5DF57MU5QUAwKRSmxdU8RJczyOokpEL+mZuaGEPoBsoD58uXQPsiY0s7Y//Q0AxBYOUyQADAPAGMBwAMDAlGCUAuYOoHRlsFAGqKBwTCGmcRKYXGZVBQwYQYKXGajiggM0UUwIPVrqwNfYmLCZn12ST6/RpihBIamjUjgzsLAlR4TyFA4EE9maXiujtSGnaqEaXouJ/oYLQuymEwOUkaYdqxWPTnViNY1+M2Ihr0sVUbPCVL9xTDMxJNHsFO1Kc61emUrOpKLPanb2l3kFtS8RiV0R/eWH76vlmcXCHCc9Upvd//muN7+d0t8RugRCSnk1kN1cPAw0O7A3IkSAQKClI0Y8AC1ZJzcb3KnT1ZNjNDvKmlYYyQ//ukZPKABeQ/Revcefg+ZgjNDCNuGOk5Fa9x5+D3DqP8gI5cOYgEDxRRkWOPAhM4HRi0RZZ+6ZqYvNP2E8zXUABAgEQO2SQADAjAuMCAFEVAQFANzALDaMJyI4yCxEjAOA7MBAE4BAwBgCRMCKIgGTAVARTffxAWYWIjwpAUsfherd0dI0/+6wgOBIkzg4YAoBQaCIjo4Hhccdt/0jmo7oPzprLpyibalVLTxyf0BMSBSIVVB+eEtMuLhkfnR2NSyplY3Lw6uxnCxDaLa1auuUxTHkJlJZNTElHR2dRqjsxHJ9e9jqMuXWxTSK1NjybPfSkIoUJ5EwHBcSMFQ3zC/R1N/79q6o4JdVwODIm4IZ7RtRS8GKfsM0NcklHNILi8kRgZclPGa3ckq0WdErgyT0UBoB7Wqj88vIABhMdAEAAGQFHVRmgPHbtmDcFoZcL0xpVB8GEKCGYyERgwJGCweMEQwcFkm2QRMuocmnYXF9uGpe0wMEMEttIapYIwCDoiGxhkIloiYWCQkEARaQ58BzIVB72xjvP3+M12tBXZuw/zk8yjNyluvw7zOaSHm6yPC04M/TNWfyV36eTyrKEV6HOblUX+WwXG6tihbnJq0WizpQ/LH8l0cs2HsjDcJXEJ//u0ZNCABiZExXvaY9g0wli8GENIGYULEa17gmj1FqK0UI9IyC41PzNJhY7lunorOr9MDaafk0hBzDbxAL9kN615Dk1bz3Pz1KwhRW4oTEgHUQZnavRE8LDVIZF/IMaU82Sog5wIRLnwnkZ/WL1GsWmPBQahkLHB1wulToFFGw6s8Bq4z9SoBuh8eRkAAGBEA2YFoDBgKAImCCBYYJwLpkOnwmgkDSYMIAAcEQDAIgQbhUuMbHEG1r0jDz9bQKHTSqy0BEJAUNQukVLHxkmDC8GAJCAjQmpagsEBssduBXiTRZPejh+PZl9UMiNj8OwLE8pkFxoRxBHURR5MzozFKktXd9Ey+WR/dhOk9SywvgZXPPraHJaVOvjrYzijEtGJKwrMEtPYqJioWYB1qxqtym1gT2dD4ICjroTeVsHGiyWI0q1V7odEa5TJJMCGhs/7zoFUo3wpChxEhH9N0clyQcAwHFPKz8vNpC70zJa2LHQ2zxZzmLWYa8WaWEQ9N0YmBAFNwVg8qSJAMBwD8wIwYiUAchAkGQbTAqS9MFII8YAYMCMEUwJQAwwkMPKBJmHgFoVakOiRzBT1ULSF6JzhwdEb9X0OREbkxPFWMvpFWFVdzDlFQAb6xSsGBmtTpfNw+LhLM4FhULyo+LR5Usabj84wkKsCxzzOPS3CR2jvSxG6mWNedvsE1xQ++X6W2zvJTj2iaX2Yo3aIUNrEx1j5f6HnRogHvs+vq/W0AsGbMhl1EkgbReFFWgYc08g7cSHh//u0ZN0ABfFBxWvbYng7o0jNJEZOFU0LG+9tieEJHqN8wQx1Hn/Z/OnalH3IW6I96ZlL/efzLNy6fJlr3vVNP2XLYi7q+ps7zOA2UWELlPq1pwAyUDUPXESQAELxk0ARiiF5kYMxhKEJqJJpxaHZhcARhaDJgSBoMAQwXCswIA1Hx36kaMnQcEFnOnK8bQUgXDPONj9gEKTJvKCjKCADxOlEWkryUJgOvX7zHObfuux2HYdcmdeRoDsy93Kj6V2hVL0R3CIHpbjOYTel5MH47qoZOkEu9JmDKIqhUS04SnCiBgTHyWwHROQKWq8R2rl37h8VgNLJs3Ez2pL67Y7tG4WzQWRgXH7i0bTCpfQ/uiHMOK/75/kdUfp4817nPftZFpIDn3/X0M74weRnLyDz4a50vhs1/THfzwCDiQdxAkAGGIYGFQXmCoMGGgqmEoqGmnTHRIyGFwDiQlFUDVAjAQJTAcKQgAFVrD0kzAmPqgJbk8qwyRMB0lqsVBxqoeaEgyYmjUsQogl/pl11E5bc84jXH4pAwRsDkdm1pJgXnR60YFwZHCVCdZWK1uWYdKhbSHJUY4sn5iOD5w2+wZwLxYsEI+JhchNmkundWzmFR8L1537xtKJ6CgCHtWxR4JJrQnV3Vaeq8vsyMONsxATYDj97xQuri9uG5lYIXI4R2ChMIGWIMyJRSHp8xXrJH3Rfz8HDOlgmwwiViiil5VzI1aUAQnAzD2MkAAwKQYDAkCXMAADYwLwmTAABoMJ1LAwj//ukZPeABVpBxvu4S/g8QaisGSJQVakBF67ljyDnHOM0gI5wgjjAHAZMCgC4wIAAB4fMMMDBhwILhYgxbkdOQhYcW9LIZehM6ik2XSoHuEMCa2EbRCAJUOMsNAEmbALAK66k453naglHjJvcTzI4HwtugyHxhyy+GxYWupYF1S75dOYD5qhWMCUX6HBmdKeQyYmJri9Dg5fV6j8EFnYK4tVPPLOOMpXW5IWCzceoBFqBcVDQBK3L7m+2HEHVlFRe0hKAGiMFo2LE8D1jIz8k/uWKLMdLPIQlcYT7RL+vtU2dlZlv+eEPSYFLqEpGhWvQbkQq8Fwqk844CFuAO9g0l9m4kQY4AJQ9x4kmaQWHBg1+sjrAAEhOZQFhhIUBVuZeAMJhCDGAHIBOIWAKd1G6KgQ6mAEKbXq00WBI0QQMSXQhSCgpW6K2p+fW1I5HSptZLDwhjyy2gkhNRK6bE8/509xMVy2rTl85PllXrB68EgkRIA60Co/LVoYWU+Kya8yfucjbVPH6uMvFxOxGdmEr2U9a7nITQhXziodIoShhPSLHrQY1E020En9Z0gVz2D9M/0dUy2/QqQN+QBLM/tkYiepUzIsi/vCzv8kI0140R7zplDiW/RKqFQSh3A4ZAFtk//ukZO4ABa4/RfvbYnhAZNj/FCZNFKj/H+5pieEaHGL0AwwYcWFOwOvQxgC3kIcv/XHADHhJMakgEBUwiNgsETHd1NWBlH4xgQQSEDCJESgDWQxR/vTRvqhaRDZkFI9SbCmu8+s9KyBoBZiU0dgJFZDLFSsNXmRlryHAVRJkqjWsDkGpXJZymOLpEp67Rkxsc0OUNlenYQ0bLQwSHhXIyZY45fFjZUWD2W4GERMzHDJC0vHZmbUgdLi1ehmbzCJe+yqJ0d324WfnNLsogASI6J6sqwfh8dKVsw2mudbrezaaHlYkJRIm8jrZL53/VNSdCC+wdLDxBw3JD7wm6/xjy/I1QdUBm5quLpHVl+WyteYDOFY8SAAAICRBIYZ5lfGAaC2YdSGpiTg+mAwAoaVOY8SBgBkQhQHcNf84sGdboATrQVCYHYQvua1FsGUEzUFEDEAy3owFFgkVSKfdtUNhADm6TV7VPSUECLvdZ1YyyBp7/QJMxOGXFhFJMy6CIrDca+VQmG5+TbmIpRS63GoxBE1JasUr5VM6TCNzGMCUlJPyuLWIdhmw8NJlALOY78FZZWIvalnabKr3v5Z1aoLgU2yCqAbEz0Ea1F55BtKRENO5Qx/6P9f0HuDs/6EDEmpK//u0ZNsABN5ASPuZYmpJZzjNHMOxGNkLE6z7QmDjhmOwMAiEAhiPO9chRAsJbVOlHVCcJBYuh5lKskkVzJiaKD046h7OksoVeOsF3Su5Ce3RtFaYAGOwly+cjSAMIgYmMgGMwCPokCjSgYIyETBQ2Isw4lbQqxOo/M6SASKxBhhWJgGhcuJKvYWNAoVTV4mk4iSBgkhXTFmfqbkFgUkIIR/MndvHlExBQIRCHNYNwwJ44HLAkoBm6SwbLUIc4zwfx/EkVntsPYlnE9xCOPGsrkQ4Fh4XXm3y8nXjvCYXTMJFbxyV1K3XnU8ba2D1+P/romHEXnAwrN/VrH3wvPESQAFdIl5s4LT5Ipxu2eIDJH/BoehwDgXajbIJ48JNfPxmo3mpOcrXN5in87fR1danHueMKh6PFMLte6xr2pjifZ9MsAQjhLJ/CySAYTCgUCIqEiqQRGHjDn4NRixHkQTGgGi0cgIFDbkX21DY5oZKJiAllE55Eow/sieF8xhB21B1nAxB01YUOA3tLJ5k8Ryve0rFV7BIhFTLqzs0VWTwW5cuMiqKM8FUp0UjkJayyQ9+dCPVV6QYWFLmG50m3Egx2FPwHBznYobbpubWxmlY2pwi11fEqtdsFvNMBA0EIiAWSkBegfcuR+I77V5sZIIB69j58TaP2D7LI4gAfZ9RtAIEC9TUOO3hgy9K5/pirG/dr+/v7SqcRrev/frK1sEf812qlgCDgJgPokwgEhBULoTDFI5CgKM2240wGi7Z3Gxn//ukZPaABS9BR3uaYfhHx8jNICPJFMT7G+5l5+DrCqO0YI2lFSxxk4OGi9apKWHAQpJhCaaFzdKYkFvZly61RizO2NtPSiS5SJhJIkh6B9Euc1KclwTNORNH4nHw5D8UxJPzMroY+njjVxLcSo2RfdJFBYS/Jx0tx4nox6OkaMJxbBlGr3eOq/Y8YRM0MU3rWiahJVCMtxHjaZBi5xY/6Sj3i8qR6skpc1MtCyfYUTAztEDzULrtv9X/nrtJrMeW/wz3tMuiOHxS9BIjIZw+d/wu8+7GZ4rhnIZbmH9D/ylTpZ/2Dto7Lk+yzDtRAA6uEuXrLQAACBICKRiQVmlScAgKaDXoDGpEDgWgSvCAkGlmCMTGiEWKQWZ+BA8KFKUSd2gVEw/O7SMyKzRAAuSWK4QFsWhj1eObyJhYE7YgCKWVpfH9aexFNkql1QpWkMGJ4JRZJpQiJpCLYpQxDJr52XT5w4KkSozTA3GV1ClUe3TLj0sr2mz165ysh5rUMzbV+dnac+eSOHx4u5R6YQQBhBKXxZadVb9SNaOc1Lek2mA5TExTYKwlr2Fb2rqM3GDr+1RbHhgg/NYR1awMzejhEmEkbWhjbCysjBKPSRkjKbpVaveyaUBu5nOMgHivXpgB//ukZO0ABRNCRvuaYfhEB2i9JCPEVXz7F+5lh+EWHWL0gIsRlYB3T6NIEAwEDSyAXHZhM5EARBl9MwCtO4wKLTEoDVgHJAX0DoW3mbxoLgVNb65GrINrKWXJXrfph4lMOirMvNcauJBLC0EVcuci1DETmFafDmes9EvFx6tTojUdRLFh8ORk88PcaG2JUmQTqlGnjkt+Sx3HtwkMuIdSwdn6ZFQ4ZSpTSiS65s7VrStR9JG8QbKu5dSz79eWYkTh+uPqWpCpa3bV2sU2RW5Kl4QAAO2blzpLHfcq/7OnRB8b3vf3ZsL+upZ2kqzmcU4DBiBCCD6R2C3t4y50jSaFDyM3X3TXkB3N9yFAmYRWoxEkNCC8Tdu053hOoppk3YWRjsydY9r//z9+/7clwCVgIZvpCiQETgYJBUXMOFkJZqF+b6ApIH7KbLqmBpghRcSaCoNmRmiQAIggWG2WN2ZbFGINgZ0QkiyRRFiJ6dwppFGTCLA5NqrjWrtcsqrSSdWk6m2GM5MzCTBPxIjC5xMsT+l3zNhWvGN06hNk5zNiVcUPNprcJIDFFbGN6rX7+8J4+es71RL6hbnjfDs7b+5UiuMWPL6t4Nh0IPcm49RogHfH/C5OyyaskAAblU6cDWTy//u0ZN8ABUlCRnuZYnhgJ5itGeOxVL0BGe3l56D/jaN0kYwcLmjFm6pid1IJTUABAhAEFFiyTHBKBhTAgUHAW0G+KgELWDSwufNPdWK4CNWL2bjz6YgAg3CGXeMkAAtEYQEtXMdJS9xmVMByJionNbcSCl2FOE7k7MnAIJmyQCglTYHveh8mJtPKg2IU8gdpW1YFXRZIBiBoqpjsQ1tS8oUgsTyAqHwmj0vTjsSROBmJAnhMpLK95SSCTERCce3Qi5Z6pXOyelbWMFJ9m8tcvX2OL01Myfq1hwhXKy51IuULXe+nxMu0YX3Fl9zNO3L9d/8kaZbKMzpIZICx1pa1eTyqevZxqqDwRgrAsCKmRLCpYsTaiOelHsyy/Cdct5okGvHIWMQfDwlEqjRIMi40NEWHAJJyLskQWc97KF/3euv9TuBysFLl/UUSBaZunIYGXpaGE4hjpIh3ClDB5URqoUWLuKcRGMAPS1gAoeM/U2hKblUlHt1g6C3ga2w9pK2wR0qUPTA0O2QEHxiJJhEH5bvjCRiNecoaCRCIenKvlSuOyYxPVjxBbHysFRrPympUrA6RoD0MR4JChYoS2UXbPV+sKzpeydJXVLT1Ypm17L6xm0CDlyXWtxmP0/2XyNuRtS3FEAAs6wEn+alJ5Dbq+9WjkG36ouYXFArVfbTih4uQMlyVcRPOhhIGxVLpWjCAduZk2kMt2uXdARhTLngccupRtx3ZJ8QI3s3tsO0M9PiRc/Vs/R66mRCIgqddo0iC//ukZPWABPA/Rft4YfpOZZiNICPEE3kFGe3hh+FllmH0ZI5YHER3goXRuIaV4NZGzsNGAxa8yYRnS1YFlkMkRkwgMBCFewGw8V2yN7caYzX6wdnLEU7I9MM6ybQ1mJDvElgl1L6qWV6u1HNIUh4KlxZnhgUkblxKhIRE2iMrqiILKidVJyIhQIRMmQyI5nQyMBg0jXOrkUiiyOZlphc/re2BCbWHfo9ftkb7hLJlLq82Lo7ZFU7CigBVEyMd7O4SH1HLpyxwrbt1vFkTCk3SVI6ZymiQPEQC0hHQnPpDbTCXIHpKFRoFIH1PrHuTy3Z+mbA5m3qo/sbbIdlmxVbO8GUiGMJ9gocBWqFRQMKBlgUyNKOBOj47RiIdPhVv7jQuQg3zpOFuR6GPULMByhMA35GRWaYZLQcJscK5Ybw9bk0afHYvcXieXDhOnMr6cE0nniNFTTmmqeBusYXuxPLtNzAkkg/L5oaERUgGZHgWGAi3W5dDXvJ7tJoM2tevmNsHOKTwp3euVJtSZVAqhVxcGM+QyOznOqY9ZAnJCABYKXuthEJsgsdzII2RD2iM0QNSlgu/OaMrZRDd3OyXBJTjhcQOLNJEENEQNvLIXKMvBJPVNqo37IoFmJSYjdsokidd//ukZOKABLI7RvtPTFo/Q1idGGZYEqkLIey9kOE9GWIwkI6gQG1h0cNgjkw1VgONVjqVCpgCIQ0CD2Y+GMRrFTx5cbSdPAH8cCtE7G0Tg8JZ0tHZ8GsVr0upO4r+hm0Z6CSkQw0O0hZUG1hzUwFcrkxa2ralZy8pK5eUIzE7cRML6e6bPjsdWdZjgOV6fEq6CBzWp4yt0Dcc5adj1sYmQHRdJQeKICYFUad1f07UW1X//FtxDqghbZ3yHIy+5yshBhhYEBwZZ5wIYW4IgWONSVZ5IiTB3OrMcLZ1ZtQVgNHJIhM6sNAXvoDPqiT4BSsh6afMlCLLutdd9KFv/dj9//+v/bQgQ8o7vfCACA3KGGgArdgx9IkU9EcZ4ObXsIU0A5kDDQz8P0GFsqUDhyWuBVwmo1Cm8rRN+7c66CnxoQ1ZUBqd6duLTx8RLFd0xlEEyWJsYrm1qGJrQLSoL0NoUMdKBgmbbJycOTRI0zDkOPNBgTB06m2TDQkQGAueGXtoMXJ2CBNCSF4i0KnJKPrwSsSOCsJN4llhaeqy1E0EvW3/aSTQimCyRffMhAZEccqCspkq2JCJCkH4RJqUHCGZUxFF0RRSy5ZS81jP0qTPK2qmRvCbIsFG/XOLWXRtav+f//ukZOOABJ1BRvs4YVhWhijNGCPQUyEPF+yxNqFMnmL0hI1wDLsBsFiZw20gh42/xamBqkgFd4V3bbRptDPFPoBL32JUgHXF9wKJfCgAAlrqCYDCSk0JAeBpgQmlKtyk2h6oZF0dTMq00cMZ63oQP5CrJO8GykTRpK1XHJJ0ZlwGgbA8CTqkQTALA0RiAEwvDC4NERCuQkulbVXMImypqTJR5EwRBwkIB1RSUkz5xlvshMjEbpiExGk0u0nVm1A2kuKibTICuhB1Ejdd0tkrABAotAZdYeL5qqsgyGSFRY9gNcNuFXIANNlEvN+5CZDA22EMmmQPu7uE9XzA+EtVvALEa9fdO6QuGXZVVLLm9Hro//6f/plH11tuqJKQFJNN3Ii0IC6oXQmNCkJ1izSlMUJSZC5HMXIVBI0IyGvlO9acPWcvy0xEuJm2K8n42kdicZOrEVzhRBURyefh0JBbjsKCQEhtbYB0KV42lCkkWr65xheUWD8T3zhySwmYYw7S+Znja11cX7EVt1ltYJB5Q6PnVxVPjo3bqmrS98pSLsg2awzn0Vp6qWWLZ/c9ur/6rBJdHtLEkURBJj2x8NMRJMFxGlZ2oBARVSCKAS2d7Kn2bIGF0daG25m7c6ZAnHjH//u0ZNYABKtBxXtPS2BMI/iNDSY6E1kVD609jsFOoaJ0YYsYSNjMpKS3ZmRs6XaXdWSnVOzfMavdne8EIytaH9CtTm///V/Tls12k8zRCJEviLcSJUk6bMyHgEqi4JjQjvt+27WVtj8MpQHelH8TOIozgkYpRNFPeLMh5L0gSpPJNCJZH+oS4hoWvumhjqlTsQ0cqNMh+0opiRjBLXHhXfU8cQzbzc6WOqn06l+jLHRWPElycCK5YZGvqYj1UuWJHhKVRnZMRO7/uHygNg2KuBQVCph2gfEwBhAac6P6ueGdNzUfQglLVHJbZUCUQNKGng1+yRacHbz4fIJqKDjjTcYmQRRpi4rSxKmuvG6bn61eUqR1pSi2Qo8dS19lmpH421op5VDEASIcCID5FEm+w5R/3fr+r4t0K/3JIzOu6t36RQfWVIdRa9PUq/nEWACG5BDcEYJOA0HYWBAGrJBkgwMP2FHFOTheV80SiCQTSlz4GhqVEDYG7HaMKQbkQ0DsrLTOiv0olmAgnS8PksI+ozwary/QrqyVXS1WuvMuckPzNKYDA2JBbXrTmMmkgsa83deeKnVy6O13r/SCK9bwh0YoAjgy43daaQMIIUSU8Dvcx1mvG0AJaLL/LJyjsNcsq1zQBI+iQSFYehEKGg7SEgAGwpZ2kiDV5xiaQKJCpdAK5EiYI1SJUPkhkNsO6UF25IJKJo+rK4qP2LULSmSOvDbwuMNhMuZDiR4TvOkQOURVYGry7SLjrK5li2Kq6tmv//ukZPwABPE8w+tPY3BVxriNGMNcFBkFDYy9h4Gsk+I0kyU4ZU2x6dP1XlFW2uV2ylEEgXMG5lFyQRrcsvd4BEqRf3CR3K4dMVC5IW1NGOc5zTLNXt687geEux8l1OQN0oEEjUPVEF7arKkES2XX1Kdi2gRnF5Mw31y4ga1xCdKgUSn0ISRkIWbQPGWC6JhFJNdU3IVFqTPFQeHhyokQrErBo2TQIE9Fdk/MOX8JX1GCilruYB59waetMUuJkje2sWeKsnBWNGkWE7vzveonJZLa0gASPVoPc00GETChIOHVbYVMiBimdmbQXBAENAv6D4k3Z3/02r3krSCmfnRwy3KvFnw15xdlM2ZolxmzcsliNf6UP3kHY+KveEnkonYwkdMuHpQ1tD1ocvOWJGDY9mP3fqEld1sdbdtKIBAibPkFQGMYAVID227x2MQWc3iRHRGtF1N8W9U8cSqpFUkSquWGJMKhHJo8ysXmHV6+NpOyERuPhGJ6JOuF8KAVSwiTNnI8Dm2iEId9HWMrMt3hSDkavIuerC81AwvOVyyE/Rq4jRZ9TnT4yvKeA6Qz5YqyBf1Obvju4WNzswsPVLU9kXF2l16XrF7zz0sIj4YsuUlUtd1yZBRF9phHOCG4UgiH//u0ZNoABQtAw2svS3BoB9h9JMOYEy0HDaw9icGEHuI0kw6YtokfDLWYJpntcCpiHNtJrCB6FKNSbEc2cSZ5czUMOfFI1jV6Rktn6zubFksyVyJdKSGpni86fASdocImAfYbhJqbn2kEz6G3U+ittHG7G7F2yWuXOQkAgWNqzojP0FMMTX3BrrStt06kR7N7bQ6rJGbX6yuXAT4hCv3rbe/L+SBtV7VOtIhcwHCZkdWRY9zYQprb++bmJcPDfVBIJFDgrIh4sVNYAcWLMU24I1gjTTiiQ9sraMdK2jNCggWm3+RGWydAqsLYw5C9U/BuP23bTwSO1lZ1FgSKPIGlC1yU0ylb6retf1rVkiktktKIIEWGTSCCzJIiopKtZZEzKSNEmm6os0jnMtAUxSIKgRCtrpFJkyERiWLkOywENigrAtSI4ep+CQOZQ9DMKxlX+FKiF/ZuRDkhj4qJmHVNXewlbLenb7cDK/NyLcjbklcaIJAhTw2k0RfmpBcX8FvhybcIqrdwrMEqnlfqtreKbeMRX5wkWX454aPWdxriQdq1ygSxBGAij09DJFSvB0nA4PolmDSMrIFCwcqSkrXGk8UK4cQEKKeaGuhcITGkZweaMEZI2TriqMF2dXNLqjGpETzLbbzARQtu9NcKoi5soHRzDF4UppDjxO8aXO4ypuUfcnElzcbjcltaAJA8xtLfM0MbnrS8pRVoeEzyR5yZ0k0AcJrDqptZopNiF3I/jfaHCKrJmRd+cyQyMyNazPNz//u0ZOYABLJCw2sPS3BhJ4h9ISNsEyD/DaexOIGLm6H0ZI7Iyp1Wdomoq2CWNg4OWoXQC40KABZwahD6PnkVf/tj7KAq8WstlelqVWZJY3rZG0UAJyNF0kkKZMhBoaJtkr4yLggDiIwkjmdr2lgkHw9tCGoOAqQ70Ta+Kol6AcpB5keivY5YMBmEggj9CVDccWmTgTzlsgLSmfEh4vJ3k1RDXiU+xfI68enw42MBLJZLHw/OcTnQkozlfdbq5Bs4uOPlTWrX2hwYIlhO2nYntU3v/zN9Ho/5N6y223a2pBEMxE8XBzlKNFoM1kTinQzCUghcDAQTlzyZVEhYW1cjjFAjQSqU4KEr8GWGEFkzDB5Gr2vXnq5uzlNUciOg8eL6DbuDChStkYMKstcMMP/e3/3ehP/2VOt1yS26lgoiJMVZp6dXXEIafoySxdcZXe0cgsI5QYVoIsQ1pufrARMTwPCCLhxLikuGTASlYyLL76ykdaeQUI5wjlsprjh0cx/X2Pk5xd1JMVKNrXn0CGNG27pwhnauq9SoL40XP+WH9ikuVxz655eyugxKxbYsz97J2uOY4CtSOWTCyRh4m++xNvFOiIGkSqPbdxIpttuN2XRwgkXOGSj5s4+seLxjP5IudPIqgTokUlJIWEAuQiE8NomSg2CVqg9NkzJ16H/cSghDk9GLOC0DoXJcPDWFk7dhb0zwR5ZxIqwJMqeuoPvipcF0kKmuuPAIjZXfbTu3NQ7T4mYpcabjbjjBAADg5vj///ukZPoABGRBw+gpYOBdZgidGSOmEp0XD6elgwGkGeH0kw8QF2eqqTPPEQNESWzUc5LSZCFEIjXLGU0Sx0kAdEMkSJlBAqKyA00jEpEAy7b0xk0PketRiXOFgRTInmi8FmD8TBU6SHpx7kcyFakM7ZaSFWKRj0k0bZMNoH9aLc1ouXeKABtpqMofPlSYuxq4XFDYw8e2oScGqCay78v9FTRT6pW5ZbdbCySAzpk9Q5z+YuwssGWlIEZOhVQIioLCQ40vK52OfRHBkGoMEvmMTx6o5xtAN5dUaXE777JdRlsnz61edtHAKxkofy2y4dVM4USVO4imL3V75zZutaOWoTqsQs2luPzIaTB5Fa3bZtxx8DEAypjHgIzieLH2JO/YqLOpRPJ1TFUlsPditqhTdktuZJRAuJUAxVajJNRGGiVClCKy2qhibOCIzGRGtENsAhIRCEWkFll2ZR5CXFShUuhFZd4WIstASAwxIV4+cWOOsL1fQrk42bnNliKT6iFnH1Ib1StqEhpI+DCfPmQKPAiUEAQEoZLoqn/bWnp+zkRZdsbcU/2q9t7kbbkkuZQBAWrz0Gy6r8LcN0i6tlaSL2l6EWK2R5ezAncl9kCYADgbJhHpslm5hFGU11IEJdCG//u0ROQABFg8wujPSACKJ5h9PSweD3jnD6SFIkIZHqG0xJrgxsnFRFqwwZCCCQLtpiAs6YlZnV9VMfOo71DBhpfZJfTM1vsQCJWPCCO1ziU7yywHMiQ2GCYPPDAgrcgqLJneMsFGlFLfZcBLT41P/VZytCptxWJ2TQkFAVcHqeQX0KANHTNVTPVGIWhwkf5MGTJWO7MpCyVUev0HsfCYXVIKJYH2ljqWJFJZZ6uHSdxSpRnrjNqTOsfV5BrjXuZdiTjDwrZJyilHESmJ23FBiGbjrekISCB9QfBVVe+3WxCLY/s7fpCiDrlssJBIHVMBFLPDMOx8SYul1S3GRmilGdHZyu9Yf2kQUhLbIbCJUcLDssF8mFRkzDgZQN6gQjLNKjohd+iFYlMmTa7KdZUFaub2laRSgoqgVLFiprcE57B6mimNrn31CKlvhFvKxIKgyZUiHyqgvSxfo0Ur9CxXmVUSLP/2MNlqSWRAkkAkr9cwZuQ2+idghNVOSMs4MCJpWQvrMsgBlkUyR8ruWH40DmViKjP2m7Qo+XYYI6IfiKfRLmG5ciESpYc6sRpRk5emG1q/+H2K0yHDyfeJk9Dkyhs52XfcoThYTmx1fAIR2xDfxL21dRdJVaK4+33ByVROSVAlEBRwQTaQDwg2xXEpGFTOdLEMoqr7iEmkStnkIgIZEKMudUxiicYEZQMmlyyb1zUdwgE0DukoqPKIMjFMMQHGKvkmIQRRNMonxTVybcqaUTZJmEaOROdUE5VgzkLp//ukROYAA4xAQ+kMNcB/p/htDYleDuj9DaMw2MH/HuG0AyQIrTYHIiz3kyy0IJqcx4vanP9LSNaMYJ+3fV3fydVtpSRu2EEEgTjLElsydl0bDDU1FdSXvGlxaBLdPByArQFMZZRhYuPIveMcE6AT1IWJ2Tg6IMxMGtQpPnFJ4OMWI8JkkQNZ8uvc7zi80zEZoZ4OJmEcZJG2k0VLps8JIcWEIooi1sneTWZZWhRYLUQy2aQVRaI1V3x4UX6E61HG7YiSSBZsLABK3CB38qzC49Jj6SSJATtjsEB/VpnzRuDdqVdIdJdgw0daTSJxKRJEznUBJckQXKUUIaDyQw0KPVxyccty2s0Ybppeq0MfhCkteGTtzgrhszFXn/kbjLWXaQNuKC6icMBPXdHARTjSabkuiRRAgQiQuHkJXdL7ZyLcOJsx0r5HJHK1aytOydqUOox3NIT1YaBMDhe042SBomBFxZk/0cmFXtlw2JSx977N+E0DSHTbJ75KVkbCxPUUaRMjM43FCxTkKDWiywaMgIUYtw1KEtStWtIuqcS5xJkg5oXvRTeQfdFPc36HSWWmpIySQBAeFhF+TcAROQDQ0JQMGrbDHBG2VQEcklIJbLmQaTKjaOUljx9Y00KUaska//u0RM+AA9w8w2kmTjBwp3h9DSaYD+zvDaQxMMICHqF08aR4MhYW7evkZk+K5slWltzJ2GDpEsrNeIRtSSXmpi6ltojUvLDJCzSBCQT2qxJczvc8LyjqHqCU4LEwkXuc0kko8ElrVBonIrZMMEJzoU9JISN221pogRDNbRrOShNysUMlC4wRKiVINSCwRJpmRHKIcLxLlAmaYaEkAvOIniQppE5seb1FixF4LXbMzgMQaSNm0TSBDVSewjWVGZMzFKKKacLQrqsltpeUliKSF8a35vxd915J3Ji6rncGlBWIaTTwmUc4FqNN7ZGGJVP/yTjcSsl10haAs40ToqITWlzRihBiBOePhMkWJNEgFJxG0Z5TbREqSCYUXIaxM0JjTK9qh8VolyYhcB0jKBJG5pESFcBJqbYib2lJO76iPCQEWT0hZFMFQK5VpJFMkbtoXktBQLvBoHxHOtd810mZ8wpykreRzrLlmU7mq2m5ZNZIiA/CguIebWPpKPtYF155mStgd2N9xreMGmBLKgVwEhEdx3tWrTs61kK2opHHTLnnqzAvhlml9bXIZ+TiCbFVtlZRxbCrXHLJMKbFhmjdIv5skLLkBMPYYM2dZ3Y7eKoZqo/Tu/6W3AGy7ZW2SAQDRwJhS/4mwaJt4vLNRoEJYe5OuD4ipOHxkubYwYRrDTTyu9J0TIsAoIsloQ6erTTIpsrtkZwhsmQojsUPWWGWUEiWkcq8RjV0fytPggcxQaiEkUsSKPGr3qYLCsiLJPpZ//ukROeABAFEw2ggSYB5Z+h9ISZ+DYEBD6QwccHVHyG0NI44Y8etRNI9OIAY0K+lBbaaUUkrZAH/c0IggSnbQ0G2fU6bZ5BnvemKIg8nOCBCpHCwRl2rqGA8QDYjIQsPjos0iJyRKE2XpPlBDJEJe6kUzCxYUrlG12cPVAmtKFQvcI6jpoBN5NIOtcKiJ94/6iQ/Fno2EXX+6QcajjUl1jZIEkpDKF+256FVDXYmlH6iSJXxaa/FKCipG8QgQLTYAyDzI+dUaxk6ZFFvKn5sLg4PoanOhSWsUS0mMVAUcWnAHrBpkpM6D1pPUC5mCCzgWSRCIMCY3D4ZUCzjvPmEuZktmKC77gQF1OQfQlp0HZFTqkkk205JY0QBIwKlGlEAZMp4s3fkiRfGENMhkgftUz1HOogksriFkNCt6AVQQMbMqjF1YozMoiUTZEjLqIik3glp7Va82msmC7QdCIies0BxWLlh8XaWZd9XdXzq3P7viapBmJpKySMkAXW/CK8EqdRswxGVVnnnpMSgijFN2YPeZAys2qHzrcLUkXJoyQkx0w0ho0IQYuOLNiOMOgCVUHNc4cQ8GssPItA50DAYJwIeOkkEihdyPThPtdjOqsWmX8WXY+s4zqUFmNJuSVtE//ukRNgAA1Q1wujJHjB3hqhtJMPiDCC9C6GkzcGWGSF0kw+AAT6z/AQGZM1qObBWUSB2LQBQmzAYlZhsGn4McvnECCSgaETzpSPJFhJeFbvGxyJI4vdSvk38avZzbisWyZJ1CpscUNNGBALvapINmKad/f6wtnJIryHyjwU0W247G0QB50IGCITzUOsQxAk5aavbQIg2kitBNmHLLBOALH1D9kRwOggmc2ETxyaOmHIp6WUggKpYw1i1a2VA9K+21b05EVB02FwTLGTZ8MBQMyCaxZQAd2MW7byCanw/4nt/OgxtuSO2xpEj1XZLuXUUqUesQpI0Y+qsjEkr/uRHNdga3oChkifCIy0wys8owKk9VYG2GpN+bbCmPtA6b74g3y8x+3rR06wdoSEhJTthhkmlgN16RspxlyAPrxAhPwd06TS3X3z//1//xJtOROS2tIgeP2KKK9Y2wslJu3ZC4OqertXzE/pu0ajRGkNokRC8ZtZBRKyJKi4JRigLMoIyu4RQwlGEb0wVezlaSqpCkZGByFyMzU5GkTStbopGmfJn/62fen3VFX+rkou4g4nIlP0qQaiRkkkbRBFzrqzlYYDbXim1DzVPoRtcUrRSXF0G9R5CtCJ9dV/IS0IxC3JR//ukROGAAvgwwugJMDBl5ehdDSZcDRThDaSYfEmfreG0kYuY+SjdXkBJQvubMJL0sopNMn7VS9WzH5H8bS0bkVBkd5DXc70o17Ll+TXy30Q0BAZJsH0A0DR0egXB4sKAHZKm2QPlJx1kpEomnJLbGkQCwvenApbHGXNPEMWRqqI2CCJhlYSCq7EIHrXBWYJNgiwG2U2gsuYRLprLuNZ7hwb1WDkYKCqYLMKdpIfC3dGM1Hq3WGVKunkYIp5zgEEBqmAjcH2ME7TI1WAAhP2mybgCJAcgfzj+XKbLTUcujRIEMyMaSN6suXLMVISRUVICzkKwxNBpYPwVEhsiUKLgoAAisnNjoGQHXbxAlSxcYOqNIHpqpajtyaVZBdLZSIyjtYTCt9S5f2M/LUq7xDc9XMzVk5HM3PMnWq8QgRkjOiLU8m5g7ev6aXP7L5eUcxmz8u0WmkXJJGiQGT+tb5zSmuz73PKv6SSPmBw4UUNGTBHAKFPBoXRrriVjRJRKCwojMvy7MJnE3PQ2yN2JycOpy6G28tuwbj1bls32SZcLO4uDv062hsaKazpKtM/yec5mxqRk3rO8kytKH2TCIspjg2Ol9lVpNONS22NIgOi+NMz6oUTafSX7w5xKUSSB6TTZ//ukRPSAA5VHQukmHqBvJ2htISN8DxWRC6QkdsHHLeF0kw8YMsSsBuBKM5SNCq9IVUabEDWddTySh1zDy+slja0nBQDAZ51ziS9gGEQKAmEgZ2Xl3vEqgZXrDuRcKzvDr8i63q4ks5ZAFJBOOyJEgC+GbJy+pWpfuLETMqm7JWPNNqJHCYyaFD3UJptiZllyyq3N4sZwqLDVEdLGyFuXSxSBhmqr/Ecvyjn8b8tdTqkhazzOL3VfP//+pcskHWWosCrg8tr1inUEm3SpAf/1IgrJHi1Z08CuGj1Hs12Ecq5R6VWCt/2slfy3iX8r6j3+SHAAJLnfqq5xhUDAQoww4Cp54t9n8Ssu9c7/Z/q7usY/9SpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uEROwIgwAnQ2jJNSBjqihdBSN8BKQC/iAAAACFjWAIAI5Iqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//sUZOGP8AAAf4AAAAgAAA/wAAABAAABpAAAACAAADSAAAAEqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
    const sleepAmount = 2000;
    let enabled = false;
    let started = false;
    let reviving = false;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'Other',
            key: 'idle-beep-enabled',
            name: 'Idle beep',
            default: false,
            handler: handleEnabledChange
        });
        configuration.registerInput({
            category: 'Other',
            key: 'idle-beep-volume',
            name: '[0 - 100]',
            text: 'Idle beep volume',
            default: 100,
            inputType: 'number',
            light: true,
            noHeader: true,
            handler: handleVolumeChange
        });
        configuration.registerButton({
            category: 'Other',
            key: 'idle-beep-test',
            name: 'Idle beep test',
            handler: handleTest
        });
        elementWatcher.addRecursiveObserver(actionStart, 'nav-component > div.nav', 'action-component');
        elementWatcher.addRecursiveObserver(actionStart, 'nav-component > div.nav', 'combat-component');
        elementWatcher.addReverseRecursiveObserver(actionStop, 'nav-component > div.nav', 'action-component');
        elementWatcher.addReverseRecursiveObserver(actionStop, 'nav-component > div.nav', 'combat-component');
        setInterval(checkRevive, 1000);
    }

    function handleEnabledChange(state) {
        enabled = state;
    }

    function handleVolumeChange(state) {
        audio.volume = state / 100;
    }

    function handleTest(_val, _key, isInitial) {
        if(!isInitial) {
            audio.play();
        }
    }

    function checkRevive() {
        if(!enabled || reviving) {
            return;
        }
        if($('.revive').length) {
            reviving = true;
            actionStop();
        } else {
            reviving = false;
        }
    }

    function actionStart() {
        started = true;
    }

    async function actionStop() {
        started = false;
        await util.sleep(sleepAmount);
        beep();
    }

    function beep() {
        if(!enabled) {
            return;
        }
        if(!started) {
            audio.play();
        }
    }

    initialise();

}
);
// itemHover
window.moduleRegistry.add('itemHover', (configuration, itemCache, util, statsStore, dropCache, elementCreator) => {

    let enabled = false;
    let entered = false;
    let element;
    const converters = {
        DURATION: val => val && util.secondsToDuration(val),
        OWNED: (val, item) => statsStore.getInventoryItem(item.id),
        CHARCOAL: (val, item) => item.charcoal,
        COMPOST: (val, item) => item.compost,
        ARCANE_POWDER: (val, item) => item.arcanePowder,
        PET_SNACKS: (val, item) => item.petSnacks,
        METAL_PARTS: (val, item) => item.metalParts,
        UNTRADEABLE: (val) => val ? 'Yes' : null,
        DROP_CHANCE: (val, item) => {
            const drops = dropCache.byItem[item.id];
            if(!drops) {
                return;
            }
            const chances = drops.map(a => a.chance);
            if(!chances.length) {
                return;
            }
            const max = chances.reduce((acc,val) => Math.max(acc,val));
            if(max > 0.05) {
                return;
            }
            return `${util.formatNumber(100 * max)}%`;
        }
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

    function handleMouseLeave() {
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
                value = converters[attribute.technicalName](value, item);
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
        elementCreator.addStyles(styles);
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

    const styles = `
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
    `;

    initialise();

}
);
// marketFilter
window.moduleRegistry.add('marketFilter', (configuration, localDatabase, events, components, elementWatcher, Promise, itemCache, dropCache, marketReader, elementCreator, toast) => {
    const STORE_NAME = 'market-filters';
    const TYPE_TO_ITEM = {
        'Food': itemCache.byName['Health'].id,
        'Charcoal': itemCache.byName['Charcoal'].id,
        'Compost': itemCache.byName['Compost'].id,
        'Arcane Powder': itemCache.byName['Arcane Powder'].id,
        'Pet Snacks': itemCache.byName['Pet Snacks'].id,
        'Metal Parts': itemCache.byName['Metal Parts'].id,
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
    const SAVED_FILTER_MAX_SEARCH_LENGTH = 25;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'market-filter',
            name: 'Filters',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('reader-market', update);

        savedFilters = await localDatabase.getAllEntries(STORE_NAME);
        syncCustomView();

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
        if(!currentFilter.type ||currentFilter.type === 'None') {
            syncListingsView();
            return;
        }
        const search = Object.values(dropCache.conversionMappings[TYPE_TO_ITEM[currentFilter.type]])
            .map(conversion => conversion.from)
            .map(id => itemCache.byId[id].name)
            .map(name => `^${name}$`)
            .join('|');
        setSearch(search);
        marketReader.trigger();
    }

    async function clearSearch() {
        if(!$('market-listings-component .search > input').val()) {
            return;
        }
        listingsUpdatePromise = new Promise.Expiring(5000, 'marketFilter - clearSearch');
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
            if(filter.search.length > SAVED_FILTER_MAX_SEARCH_LENGTH){
                toast.create({
                    text: 'Could not save filter, search text is too long (' + filter.search.length + '/'+ SAVED_FILTER_MAX_SEARCH_LENGTH + ')',
                    image: 'https://img.icons8.com/?size=100&id=63688&format=png&color=000000'
                });
                return;
            }
        } else {
            filter.search = undefined;
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
        toast.create({
            text: 'Saved filter',
            image: 'https://img.icons8.com/?size=100&id=sz8cPVwzLrMP&format=png&color=000000'
        });        
        componentBlueprint.selectedTabIndex = 0;
        syncCustomView();
    }

    async function removeFilter(filter) {
        localDatabase.removeEntry(STORE_NAME, filter.key);
        savedFilters = savedFilters.filter(a => a.key !== filter.key);
        syncCustomView();
    }

    function syncListingsView() {
        const marketData = events.getLast('reader-market');
        if(!marketData) {
            return;
        }
        // do nothing on own listings tab
        if(marketData.type === 'OWN') {
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

        let matchingListings = marketData.listings.filter(listing => listing.item in conversionsByItem);
        for(const listing of matchingListings) {
            listing.ratio = listing.price / conversionsByItem[listing.item].amount;
        }
        matchingListings.sort((a,b) => (a.type === 'BUY' ? 1 : -1) * (b.ratio - a.ratio));
        if(currentFilter.amount) {
            matchingListings = matchingListings.slice(0, currentFilter.amount);
        }
        for(const listing of marketData.listings) {
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
        for(const element of marketData.listings.map(a => a.element)) {
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
        if(!enabled) {
            return;
        }
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
                }].concat(Object.keys(TYPE_TO_ITEM).map(a => ({
                    text: a,
                    value: a,
                    selected: false
                })))
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
// marketListingLimitWarning
window.moduleRegistry.add('marketListingLimitWarning', (events, configuration, colorMapper) => {

    const LISTING_LIMIT = 250;
    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'market-listing-limit-warning',
            name: 'Listing limit warning',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('reader-market', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update(marketData) {
        $('.market-listing-limit-warning').remove();
        if(!enabled) {
            return;
        }
        if(marketData.type === 'OWN') {
            return;
        }
        if(marketData.count <= LISTING_LIMIT) {
            return;
        }
        if(marketData.listings.length < LISTING_LIMIT) {
            return;
        }
        $('market-page .count').before(`
            <div class='market-listing-limit-warning' style='background-color:${colorMapper('componentLight')};white-space:nowrap;display:flex;align-items:center;padding:.4em;border-radius:.4em;gap:.4em'>
                <img src='https://img.icons8.com/?size=24&id=EggHJUeUuU6C' style='width:24px;height:24px'></img>
                <span>Not all listings visible</span>
            </div>
        `);
    }

    initialise();

}
);
// marketPriceButtons
window.moduleRegistry.add('marketPriceButtons', (configuration, util, elementWatcher, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'market-price-buttons',
            name: 'Price buttons',
            default: true,
            handler: handleConfigStateChange
        });
        $(document).on('click', 'market-list-component .search ~ button.row', () => addPriceButtons('sell'));
        $(document).on('click', 'market-order-component .search ~ button.row', () => addPriceButtons('order'));
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function createButton(text, getPrice, priceRowInput) {
        const baseColor = colorMapper('componentRegular');
        const hoverColor = colorMapper('componentHover');
        const mouseDownColor = colorMapper('componentSelected');

        const element = $(`<button class='myButton'>${text}</button>`)
            .css('background-color', baseColor)
            .css('display', 'inline-block')
            .css('padding', '5px')
            .css('margin', '5px')
            .hover(
                (event) => $(event.currentTarget).css('background-color', hoverColor),
                (event) => $(event.currentTarget).css('background-color', baseColor),
            )
            .on('mousedown', (event) => $(event.currentTarget).css('background-color', mouseDownColor))
            .on('mouseup mouseleave', (event) => $(event.currentTarget).css('background-color', baseColor));

        element.click(() => {
            const price = getPrice();
            priceRowInput.val(price);
            priceRowInput[0].dispatchEvent(new Event('input', {bubbles: true}));
        });

        return element;
    }

    function findPrice(name) {
        return util.parseNumber($(`.modal .row:not(.item-description):contains("${name}")`).text());
    }

    async function addPriceButtons(type) {
        if(!enabled) {
            return;
        }
        const priceRowInput = $(await elementWatcher.exists('.modal input[placeholder="Price"]', 200));
        const priceRowButtonsContainer = $('#market-component-price-buttons');
        if(priceRowButtonsContainer.length) {
            return;
        }

        const buttonsContainer = $('<div/>')
            .attr('id', 'market-component-price-buttons');

        const minButton = createButton('Min', () => findPrice('Minimum'), priceRowInput);
        buttonsContainer.append(minButton);
        if(type === 'order') {
            const marketHighestButton = createButton('High', () => findPrice('Market Highest'), priceRowInput);
            buttonsContainer.append(marketHighestButton);
        }
        if(type === 'sell') {
            const marketLowestButton = createButton('Low', () => findPrice('Market Lowest'), priceRowInput);
            buttonsContainer.append(marketLowestButton);
        }

        $(priceRowInput).before(buttonsContainer);
    }

    initialise();
}
);
// petFilter
window.moduleRegistry.add('petFilter', (configuration, events, components, elementCreator, petCache, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-filter',
            name: 'Pet filter',
            default: true,
            handler: handleConfigStateChange
        });
        elementCreator.addStyles(styles);
        const options = [{
            text: 'None',
            value: 'None',
            selected: true
        }];
        options.push(
            ...petCache.list
                .map(a => a.family)
                ._distinct()
                .map(a => ({
                    family: a,
                    tier: petCache.list
                        .filter(b => b.family === a)
                        .map(b => b.tier)
                        .sort()[0]
                }))
                ._groupBy(a => a.tier)
                .flatMap(a => {
                    a.unshift({family:`--- Tier ${a[0].tier} ---`});
                    return a.map(b => ({
                        value: b.family,
                        text: b.family,
                        disabled: b.family.startsWith('---')
                    }));
                })
        );
        components.search(componentBlueprint, 'dropdown').options = options;
        events.register('page', handlePage);
        events.register('state-pet', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePage(page) {
        if(!enabled || page.type !== 'taming' || page.menu !== 'pets') {
            return;
        }
        components.addComponent(componentBlueprint);
    }

    function update() {
        const value = components.search(componentBlueprint, 'dropdown').options.find(a => a.selected).value;
        for(const pet of events.getLast('state-pet')) {
            if(pet.partOfTeam || pet.partOfRanch || !pet.element) {
                continue;
            }
            $(pet.element).css('display', value === 'None' || pet.family === value ? 'flex' : 'none');
        }
    }

    const componentBlueprint = {
        componentId: 'petFilterComponent',
        dependsOn: '.header:contains("Pets") ~ .sort',
        parent: '.header:contains("Pets") ~ .sort',
        selectedTabIndex: 0,
        tabs: [{
            rows: [{
                id: 'dropdown',
                type: 'dropdown',
                action: update,
                options: []
            }]
        }]
    };

    const styles = `
        #petFilterComponent {
            width: auto;
            visibility: hidden;
        }
        #petFilterComponent .myItemSelect {
            background-color: ${colorMapper('componentRegular')};
            visibility: visible;
        }
    `;

    initialise();

}
);
// petHighlighter
window.moduleRegistry.add('petHighlighter', (events) => {

    const exports = {
        highlight
    };

    let currentColor = null;
    let currentNames = null;

    function initialise() {
        events.register('page', update);
        events.register('state-pet', update);
    }

    function highlight(color, names) {
        currentColor = color;
        currentNames = names;
    }

    function update() {
        if(!currentColor || !currentNames || !currentNames.length) {
            return;
        }
        const page = events.getLast('page');
        if(page?.type === 'taming' && page.menu === 'pets') {
            events.getLast('state-pet')
                .filter(pet => currentNames.includes(pet.name) && pet.element)
                .forEach(pet => {
                    $(pet.element).css('box-shadow', `inset 0px 0px 8px 0px ${currentColor}`)
                });
        }
    }

    initialise();

    return exports;

}
);
// petRenamer
window.moduleRegistry.add('petRenamer', (configuration, events, petUtil, elementCreator, toast) => {

    let enabled = false;
    let lastSeenPet;
    let pasteButton;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-rename',
            name: 'Name suggestions',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('reader-pet', handlePetReader);
        $(document).on('click', 'modal-component .header .heading', onRename);
        pasteButton = elementCreator.getButton('Paste encoded name', pasteName);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePetReader(event) {
        if(event.type === 'single') {
            lastSeenPet = event.value;
        }
    }

    function onRename() {
        if(!enabled) {
            return;
        }
        const page = events.getLast('page');
        if(!page || page.type !== 'taming') {
            return;
        }
        $('modal-component .header > .name').append(pasteButton);
    }

    function pasteName() {
        const text = petUtil.petToText(lastSeenPet);
        const input = $('modal-component input');
        input.val(text);
        input[0].dispatchEvent(new Event('input'));
        toast.create({
            text: 'Pasted encoded name',
            image: 'https://img.icons8.com/?size=48&id=22244'
        });
    }

    initialise();

});
// petStatHighlighter
window.moduleRegistry.add('petStatHighlighter', (configuration, events, util, colorMapper, petCache, petPassiveCache, petUtil) => {

    let enabled = false;
    const stats = petUtil.STATS_BASE;
    const passiveStats = util.distinct(petPassiveCache.list.map(a => a.stats.name));
    let highestValues = null;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-stat-highlighter',
            name: 'Highlight best stats [needs stat redesign]',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('redesign-pet', renderMain);
        events.register('reader-pet', renderSingle);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function renderMain(pets) {
        if(!enabled || !pets.length) {
            return;
        }
        highestValues = getHighestValuesByFamily(pets);
        for(const pet of pets) {
            const tags = $(pet.element).find('.tags');
            highlight(pet, tags);
        }
    }

    function renderSingle(event) {
        if(!enabled || event.type !== 'single') {
            return;
        }
        const redesignPetData = events.getLast('redesign-pet');
        if(!redesignPetData) {
            return;
        }
        const pets = redesignPetData.slice(0);
        const index = pets.findIndex(pet => pet.name === event.value.name);
        if(index === -1) {
            pets.push(event.value);
        } else {
            pets[index] = event.value;
        }
        highestValues = getHighestValuesByFamily(pets);
        highlight(event.value, $(event.modal));
    }

    function highlight(pet, root) {
        const colorGood = colorMapper('success');
        const colorBad = colorMapper('danger');
        const colorMid = colorMapper('focus');
        for(const stat of stats) {
            const top = highestValues[pet.family][stat];
            if(pet[stat] === top.value) {
                root.find(`.stat-${stat}`).css('box-shadow', `inset 0px 0px 6px 0px ${top.count === 1 ? colorGood : colorMid}`);
            } else {
                root.find(`.stat-${stat}`).css('box-shadow', '');
            }
        }
        for(const id of pet.passives) {
            const passive = petPassiveCache.byId[id].stats;
            const top = highestValues[pet.family][passive.name];
            if(passive.name === 'hunger') {
                root.find(`.passive-${passive.name}`).css('box-shadow', `inset 0px 0px 6px 0px ${colorBad}`);
            } else if(passive.value === top.value) {
                root.find(`.passive-${passive.name}`).css('box-shadow', `inset 0px 0px 6px 0px ${top.count === 1 ? colorGood : colorMid}`);
            } else {
                root.find(`.passive-${passive.name}`).css('box-shadow', '');
            }
        }
    }

    function getHighestValuesByFamily(pets) {
        const result = {};
        for(const pet of pets) {
            pet.family = petCache.byId[pet.species].family;
        }
        const families = util.distinct(pets.map(pet => pet.family));
        for(const family of families) {
            result[family] = {};
            for(const stat of stats) {
                const values = pets
                    .filter(pet => pet.family === family)
                    .map(pet => pet[stat])
                    .sort((a,b) => b-a);
                result[family][stat] = {
                    value: values[0] || 0,
                    count: 1 + values.lastIndexOf(values[0])
                };
            }
            for(const stat of passiveStats) {
                const values = pets
                    .filter(pet => pet.family === family)
                    .flatMap(pet => pet.passives)
                    .map(id => petPassiveCache.byId[id])
                    .filter(passive => passive.stats.name === stat)
                    .map(passive => passive.stats.value)
                    .sort((a,b) => b-a);
                result[family][stat] = {
                    value: values[0] || 0,
                    count: 1 + values.lastIndexOf(values[0])
                };
            }
        }
        return result;
    }

    initialise();

}
);
// petStatRedesign
window.moduleRegistry.add('petStatRedesign', (configuration, events, elementCreator, petPassiveCache, petCache, colorMapper, petUtil) => {

    let enabled = false;
    let showLootTypeEnabled = false;
    const emitEvent = events.emit.bind(null, 'redesign-pet');

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-stat-redesign',
            name: 'Stat redesign',
            default: true,
            handler: handleConfigStateChange
        });
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-stat-redesign-loot-type',
            name: 'Stat redesign - loot type',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('state-pet', update);
        elementCreator.addStyles(styles);
    }

    function handleConfigStateChange(state, name) {
        if(name === 'pet-stat-redesign') {
            enabled = state;
        }
        if(name === 'pet-stat-redesign-loot-type') {
            showLootTypeEnabled = state;
        }
    }

    function update(state) {
        if(!enabled) {
            return;
        }
        let changed = false;
        for(const pet of state.filter(pet => pet.default)) {
            renderDefault(pet);
        }
        for(const pet of state.filter(pet => !pet.default && pet.duplicate)) {
            renderDuplicate(pet);
        }
        const pets = state.filter(pet => !pet.default && !pet.duplicate && pet.parsed);
        for(const pet of pets) {
            if(renderParsed(pet)) {
                changed = true;
            }
        }
        if(changed) {
            emitEvent(pets);
        }
    }

    function renderDefault(pet) {
        const tags = $(pet.element).find('.tags');
        if(tags.find('.tag-default').length) {
            return false;
        }
        const color = colorMapper('warning');
        const tag = elementCreator.getTag('Default name', undefined, 'tag-default')
            .css('box-shadow', `inset 0px 0px 8px 0px ${color}`);
        tags.append(tag);
        return true;
    }

    function renderDuplicate(pet) {
        const tags = $(pet.element).find('.tags');
        if(tags.find('.tag-duplicate').length) {
            return false;
        }
        const color = colorMapper('warning');
        const tag = elementCreator.getTag('Duplicate name', undefined, 'tag-duplicate')
            .css('box-shadow', `inset 0px 0px 8px 0px ${color}`);
        tags.append(tag);
        return true;
    }

    function renderParsed(pet) {
        const tags = $(pet.element).find('.tags');
        if(tags.find('.stat-health').length) {
            return false;
        }
        tags.empty();
        const table = $(`<div class='custom-pet-stat-redesign-table'></div>`);
        tags.append(table);
        if(showLootTypeEnabled) {
            // abilities
            const basepet = petCache.byId[pet.species];
            for(const ability of basepet.abilities) {
                const name = Object.keys(ability)[0];
                const value = Object.values(ability)[0];
                table.append(elementCreator.getTag(value, petUtil.IMAGES[name]));
            }
            // spacing
            table.append(`<div class='spacing'></div>`);
        }
        // stats
        table.append(elementCreator.getTag(`${pet.health}%`, petUtil.IMAGES.health, 'stat-health'));
        table.append(elementCreator.getTag(`${pet.attack}%`, petUtil.IMAGES.attack, 'stat-attack'));
        table.append(elementCreator.getTag(`${pet.defense}%`, petUtil.IMAGES.defense, 'stat-defense'));
        // spacing
        table.append(`<div class='spacing'></div>`);
        // passives
        for(const id of pet.passives) {
            const passive = petPassiveCache.byId[id];
            table.append(elementCreator.getTag(passive.stats.level, passive.image, `passive-${passive.stats.name}`));
        }
        return true;
    }

    const styles = `
        .custom-pet-stat-redesign-table {
            display: flex;
        }

        .custom-pet-stat-redesign-table > .spacing {
            padding: 5px;
        }

        .custom-pet-stat-redesign-table > div[class*="stat-"] {
            color: #ccc;
        }

        .custom-pet-stat-redesign-table > div[class*="passive-"] {
            background-color: rgba(255, 255, 255, 0.05);
        }
    `;

    initialise();

});
// questDisabler
window.moduleRegistry.add('questDisabler', (configuration, elementWatcher) => {

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'quest-disabler',
            name: 'Quest Disabler',
            default: false,
            handler: toggle
        });
    }

    async function toggle(state) {
        await elementWatcher.exists('nav-component button[routerLink="/quests"]');
        $('nav-component button[routerLink="/quests"]')
            .attr('disabled', state)
            .css('pointer-events', state ? 'none' : '')
            .find('.name')
            .css('color', state ? '#db6565' : 'white')
            .css('text-decoration', state ? 'line-through' : '');
    }

    initialise();

}
);
// questReminder
window.moduleRegistry.add('questReminder', (events, elementWatcher, configuration, elementCreator, toast) => {

    let enabled = false;
    let questData = undefined;
    let timer = undefined;
    let invalidationTimer = undefined;
    const RESET_MARGIN = 120;

    async function initialise() {
        elementCreator.addStyles(styles);
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'quest-reminder',
            name: 'Quest Reminder',
            default: false,
            handler: toggle,
        });

        events.register('reader-quests', handleQuestData);

        startReminderTimer();
    }

    async function toggle(state) {
        enabled = state;

        await elementWatcher.exists('nav-component button[routerLink="/quests"]');

        updateQuestReminder();
    }

    function handleQuestData(event) {
        questData = event;
        updateQuestReminder();

        if (!invalidationTimer) {
            invalidationTimer = setTimeout(() => {

                questData = undefined;
                updateQuestReminder();
                clearTimeout(invalidationTimer);
                invalidationTimer = undefined;

            }, (questData.resetTime - margin) * 1000);
        };
    }

    function addQuestReminder() {
        const { currentCompletedQuests, maxCompletedQuests } = questData;

        const $btn = $('nav-component button[routerLink="/quests"]');
        if ($btn.find('.questReminder').length) return;

        const statusClass = currentCompletedQuests === maxCompletedQuests ? 'questReminderComplete' : 'questReminderIncomplete';

        const $reminder = $('<div>', {
            class: `questReminder ${statusClass}`,
            id: 'questReminderValue',
            text: `${currentCompletedQuests} / ${maxCompletedQuests}`
        });

        $btn.append($reminder);
    }

    function removeQuestReminder() {
        $('#questReminderValue').remove();
    }

    function updateQuestReminder() {
        if (!enabled || !questData || questData.resetTime < RESET_MARGIN) {
            removeQuestReminder();
            return;
        }
        const { currentCompletedQuests, maxCompletedQuests } = questData;

        if (maxCompletedQuests === 0) return;

        const $reminder = $('#questReminderValue');
        if (!$reminder.length) addQuestReminder();

        $reminder.text(`${currentCompletedQuests} / ${maxCompletedQuests}`);
        $reminder
            .removeClass('questReminderIncomplete questReminderComplete')
            .addClass(currentCompletedQuests === maxCompletedQuests ? 'questReminderComplete' : 'questReminderIncomplete');
    }

    function startReminderTimer() {
        // disabled for now, ill get back to this later... or not ...

        // if (!questData) return;
        // const { resetTimeSeconds } = questData;
        // //const resetTimeSeconds = 305;

        // if (timer) {
        //     clearTimeout(timer);
        // }

        // const warningTime = 5 * 60; // maybe configurable idk

        // // maybe calc min time required to complete quests based on  quest action times

        // if (resetTimeSeconds > warningTime) {
        //     console.log("timer")
        //     timer = setTimeout(() => {
        //         toast.create({
        //             time: 10000,
        //             text: `Less then ${5} minutes remaining to complete your quests`,
        //             image: 'https://ironwoodrpg.com/assets/misc/quests.png'
        //         });
        //     }, Math.max(0, (resetTimeSeconds - warningTime) * 1000));
        // }
    }

    const styles = `
        .questReminder {
            box-sizing: border-box;
            padding: 2px 8px;
            display: flex;
            align-items: center;
            font-weight: 600;
            letter-spacing: .25px;
            border-radius: 4px;
            font-size: .875rem;
        }
        .questReminderIncomplete {
            background-color: #e4a11b;
        }
        .questReminderComplete {
            background-color: #53bd73;
        }
    `;

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
window.moduleRegistry.add('syncTracker', (events, localDatabase, pages, components, util, toast, elementWatcher, debugService) => {

    const STORE_NAME = 'sync-tracking';
    const PAGE_NAME = 'Sync State';
    const TOAST_SUCCESS_TIME = 1000*60*5; // 5 minutes
    const TOAST_WARN_TIME = 1000*60*60*24*3; // 3 days
    const TOAST_REWARN_TIME = 1000*60*60*4; // 4 hours

    const exports = {
        PAGE_NAME
    };

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
            element: 'equipment-page .categories button .name:contains("Runes")'
        },
        'equipment-tomes': {
            name: 'Tomes',
            event: 'reader-equipment-tomes',
            page: 'equipment',
            element: 'equipment-page .categories button .name:contains("Tomes")'
        },
        settings: {
            name: 'Settings',
            event: 'reader-settings',
            page: 'settings'
        },
        structures: {
            name: 'Buildings',
            event: 'reader-structures',
            page: 'house/build/2'
        },
        enchantments: {
            name: 'Building enchantments',
            event: 'reader-enchantments',
            page: 'house/enchant/2'
        },
        'structures-guild': {
            name: 'Guild buildings',
            event: 'reader-structures-guild',
            page: 'guild',
            element: 'guild-page button .name:contains("Buildings")'
        },
        guild: {
            name: 'Guild',
            event: 'reader-guild',
            page: 'guild'
        },
        'guild-event': {
            name: 'Guild Events',
            event: 'reader-guild-event',
            page: 'guild',
            element: 'guild-page button .name:contains("Events")'
        },
        marks: {
            name: 'Marks',
            event: 'reader-marks',
            page: 'marks'
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
        const version = entries.find(a => a.key === 'VERSION')?.value || 0;
        if(version === 0) {
            await migrate_v1(entries);
        }
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

    async function migrate_v1(entries) {
        console.debug('Migrating sync-state to v1');
        for(const entry of entries) {
            await localDatabase.removeEntry(STORE_NAME, entry.key);
        }
        await localDatabase.saveEntry(STORE_NAME, {
            key: 'VERSION',
            value: 1
        });
        entries.length = 0;
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
        await util.goToPage(source.page);
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
                    },
                    {
                        type: 'buttons',
                        buttons: [
                            {
                                text: 'Submit debug info',
                                color: 'primary',
                                action: debugService.submit
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

    return exports;

}
);
// targetAmountCrafting
window.moduleRegistry.add('targetAmountCrafting', (configuration, elementWatcher, util, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'target-craft-amount',
            name: 'Target Craft Amount',
            default: true,
            handler: handleConfigStateChange
        });
        elementWatcher.addRecursiveObserver(onAmountModal, 'app-component > div.scroll div.wrapper', 'skill-page', 'modal-component');
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onAmountModal(modal) {
        if(!enabled) {
            return;
        }
        if(!$(modal).find('button.craft:contains("Craft")').length) {
            return; // avoid triggering on other modals
        }
        const ownedAmount = getOwnedAmount(modal);
        const input = getInput(modal);
        const craftButton = getCraftButton(modal);
        const targetButton = createTargetButton(craftButton);
        attachInputListener(input, targetButton, ownedAmount);
        attachTargetButtonListener(input, targetButton, craftButton, ownedAmount);
    }

    function getOwnedAmount(modal) {
        return util.parseNumber($(modal).find('.row:contains("Owned")')
            .contents()
            .filter(function() {
                return this.nodeType === Node.TEXT_NODE;
            }).text());
    }

    function getInput(modal) {
        return $(modal).find('input[name=quantity]');
    }

    function getCraftButton(modal) {
        return $(modal).find('button.craft[type=submit]');
    }

    function createTargetButton(craftButton) {
        const targetButton = craftButton.clone()
            .text('Target')
            .css('background-color', colorMapper('componentLight'));
        craftButton.after(targetButton);
        return targetButton;
    }

    function attachInputListener(input, targetButton, ownedAmount) {
        input.on('change paste keyup', function() {
            const value = +input.val();
            if(!!value && value > ownedAmount) {
                targetButton.removeAttr('disabled');
            } else {
                targetButton.attr('disabled', true);
            }
        });
    }

    function attachTargetButtonListener(input, targetButton, craftButton, ownedAmount) {
        targetButton.on('click', function() {
            const value = +input.val();
            input.val(value - ownedAmount);
            input[0].dispatchEvent(new Event('input'));
            craftButton.click();
            return false;
        });
    }

    initialise();

}
);
// targetAmountMarket
window.moduleRegistry.add('targetAmountMarket', (configuration, elementWatcher, util, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'target-market-amount',
            name: 'Target Amount',
            default: true,
            handler: handleConfigStateChange
        });
        elementWatcher.addRecursiveObserver(onListingOpened, 'app-component > div.scroll div.wrapper', 'market-page', 'market-listings-component', 'div.groups', 'div.sticky', 'div.preview');
        elementWatcher.addRecursiveObserver(onListingOpened, 'app-component > div.scroll div.wrapper', 'market-page', 'market-order-component', 'div.groups', 'div.sticky', 'div.modal');
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onListingOpened(element) {
        if(!enabled) {
            return;
        }
        const otherButton = getOtherButton(element);
        if(!otherButton.length) {
            return; // avoid triggering on other elements
        }
        const input = getInput(element);
        const targetButton = createTargetButton(otherButton);
        attachInputListener(input, targetButton, element);
        attachTargetButtonListener(input, targetButton, element);
    }

    function getOwnedAmount(element) {
        return util.parseNumber($(element).find('.row:contains("Owned")')
            .contents()
            .filter(function() {
                return this.nodeType === Node.TEXT_NODE;
            }).text());
    }

    function getAvailableAmount(element) {
        return util.parseNumber($(element).find('.row:contains("Available")')
            .contents()
            .filter(function() {
                return this.nodeType === Node.TEXT_NODE;
            }).text()) || Infinity;
    }

    function getInput(element) {
        return $(element).find('input[placeholder=Quantity]');
    }

    function getOtherButton(element) {
        return $(element).find('button.action:contains("Buy"),button.action:contains("Order")');
    }

    function createTargetButton(buyButton) {
        const targetButton = buyButton.clone()
            .text('Target')
            .css('background-color', colorMapper('componentLight'));
        buyButton.before(targetButton);
        return targetButton;
    }

    function attachInputListener(input, targetButton, element) {
        input.on('change paste keyup input', function() {
            const value = +input.val();
            const ownedAmount = getOwnedAmount(element);
            const availableAmount = getAvailableAmount(element);
            if(!!value && value > ownedAmount && value - ownedAmount <= availableAmount) {
                targetButton.removeAttr('disabled');
            } else {
                targetButton.attr('disabled', true);
            }
        });
    }

    function attachTargetButtonListener(input, targetButton, element) {
        targetButton.on('click', function() {
            const value = +input.val();
            const ownedAmount = getOwnedAmount(element);
            input.val(value - ownedAmount);
            input[0].dispatchEvent(new Event('input'));
            return false;
        });
    }

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
        'upgrade-page',
        'taming-page'
    ].join(', ');
    const selector = `:is(${sections})`;

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

                ${selector} div.filters {
                    gap: 4px !important;
                }

                ${selector} button.filter {
                    padding: 2px 6px !important;
                    min-width: 0 !important;
                }

                action-component div.body >  div.image,
                enchant-component div.body > div.image,
                automate-component div.body > div.image,
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
        'enchantments',
        'structures-guild',
        'marks'
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

    const initialised = new Promise.Expiring(2000, 'configurationStore');
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
// customItemPriceStore
window.moduleRegistry.add('customItemPriceStore', (localDatabase, itemCache, Promise) => {

    const STORE_NAME = 'item-price';
    let prices = {};

    const exports = {
        get,
        set
    };

    const initialised = new Promise.Expiring(2000, 'customItemPriceStore');

    async function initialise() {
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        prices = {};
        for(const entry of entries) {
            prices[entry.key] = entry.value;
        }
        initialised.resolve(exports);
    }

    function get(id) {
        if(prices[id]) {
            return prices[id];
        }
        return getDefault(id);
    }

    function getDefault(id) {
        if(id === itemCache.specialIds.coins) {
            return 1;
        }
        if(id === itemCache.specialIds.charcoal) {
            return get(itemCache.byName['Pine Log'].id);
        }
        const item = itemCache.byId[id];
        if(item.attributes['UNTRADEABLE']) {
            return item.attributes.SELL_PRICE;
        }
        return item.attributes.MIN_MARKET_PRICE;
    }

    async function set(id, price) {
        if(!price || price === getDefault(id)) {
            await localDatabase.removeEntry(STORE_NAME, id);
            delete prices[id];
            return;
        }
        await localDatabase.saveEntry(STORE_NAME, {
            key: id,
            value: price
        });
        prices[id] = price;
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
            const level = util.expToLevel(skill.exp);
            if(skill.exp > state[skill.id].exp || level !== state[skill.id].level) {
                updated = true;
                state[skill.id].exp = skill.exp;
                state[skill.id].level = level;
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
// lootStore
window.moduleRegistry.add('lootStore', (events, util) => {

    let state = null;

    function initialise() {
        events.register('reader-loot', handle);
    }

    function handle(event) {
        // first time
        if(state == null) {
            return emit(event, false);
        }
        // compare action and skill
        if(state.skill !== event.skill || state.action !== event.action) {
            return emit(event, false);
        }
        // check updated amounts
        if(Object.keys(event.loot).length !== Object.keys(state.loot).length) {
            return emit(event, true);
        }
        for(const key in event.loot) {
            if(event.loot[key] !== state.loot[key] || event.loot[key] !== state.loot[key]) {
                return emit(event, true);
            }
        }
    }

    function emit(event, includePartialDelta) {
        if(includePartialDelta) {
            event.delta = util.deltaObjects(state.loot, event.loot);
        } else {
            event.delta = event.loot;
        }
        state = event;
        events.emit('state-loot', state);
    }

    initialise();

}
);
// petStateStore
window.moduleRegistry.add('petStateStore', (events, petUtil, util, localDatabase, petCache) => {

    const STORE_NAME = 'various';
    const KEY_NAME = 'pets';
    let state = [];

    async function initialise() {
        await loadSavedData();
        events.register('page', handlePage);
        events.register('reader-pet', handlePetReader);
    }

    async function loadSavedData() {
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        const entry = entries.find(entry => entry.key === KEY_NAME);
        if(entry) {
            state = entry.value.filter(pet => pet.version === petUtil.VERSION);
            events.emit('state-pet', state);
        }
    }

    function handlePage(page) {
        if(page.type === 'taming' && page.menu === 'pets') {
            emitEvent(state);
        }
    }

    function handlePetReader(event) {
        let updated = false;
        if(event.type === 'list') {
            const duplicateNames = new Set(util.getDuplicates(event.value.map(a => a.name)));
            const defaultNames = new Set(petCache.list.map(a => a.name));
            const newState = event.value.map(pet => {
                pet.duplicate = duplicateNames.has(pet.name);
                pet.default = defaultNames.has(pet.name);
                if(pet.duplicate || pet.default) {
                    return pet;
                }
                const match = find(pet);
                if(match) {
                    delete pet.parsed;
                    Object.assign(match, pet);
                    return match;
                }
                updated = true;
                if(petUtil.isEncodedPetName(pet.name)) {
                    Object.assign(pet, petUtil.textToPet(pet.name));
                }
                return pet;
            });
            if(state.length !== newState.length) {
                updated = true;
            }
            state = newState;
        } else if(event.type === 'single') {
            const match = find(event.value);
            if(match && !match.duplicate && !match.default && !match.parsed) {
                Object.assign(match, event.value);
                updated = true;
            }
        }
        if(updated) {
            emitEvent(state);
        }
    }

    function find(pet) {
        return state.find(pet2 => pet2.name === pet.name);
    }

    async function emitEvent(state) {
        const savedState = state.map(pet => Object.assign({}, pet));
        for(const pet of savedState) {
            delete pet.element;
        }
        await localDatabase.saveEntry(STORE_NAME, {
            key: KEY_NAME,
            value: savedState
        });
        events.emit('state-pet', state);
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
        getWeapon,
        getAttackStyle,
        getOpulenceMode,
        update
    };

    let exp = {};
    let inventory = {};
    let tomes = {};
    let equipment = {};
    let runes = {};
    let structures = {};
    let enchantments = {};
    let guildStructures = {};
    let marks = {};
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
        events.register('state-enchantments', event => (enchantments = event, _update()));
        events.register('state-structures-guild', event => (guildStructures = event, _update()));
        events.register('state-marks', event => (marks = event, _update()));
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

    function getWeapon() {
        return stats.weapon;
    }

    function getAttackStyle() {
        return stats.attackStyle || 'OneHanded';
    }

    function getOpulenceMode() {
        return stats.opulenceMode || 'Items';
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
        processMarks();
        processVarious();
        cleanup();
        if(!excludedItemIds) {
            emitEvent(stats);
        }
    }

    function reset() {
        stats = {
            weapon: null,
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
                    EFFICIENCY_CHANCE : {
                        [skill.technicalName]: 0.25
                    }
                }
            }, exp[id].level, 4);
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
                stats.weapon = item;
                stats.attackStyle = item.skill;
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
        for(const id in structures) {
            const structure = structuresCache.byId[id];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, structures[id] + 2/3);
        }
    }

    function processEnhancements() {
        for(const id in enchantments) {
            const structure = structuresCache.byId[id];
            if(!structure) {
                continue;
            }
            addStats(structure.enchant, enchantments[id]);
        }
    }

    function processGuildStructures() {
        for(const id in guildStructures) {
            const structure = structuresCache.byId[id];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, guildStructures[id]);
        }
    }

    function processMarks() {
        for(const id in marks.exp) {
            const skill = skillCache.byId[id];
            addStats({
                bySkill: {
                    DOUBLE_EXP_CHANCE: {
                        [skill.technicalName]: marks.exp[id]
                    }
                }
            });
        }
        for(const id in marks.eff) {
            const skill = skillCache.byId[id];
            addStats({
                bySkill: {
                    EFFICIENCY_CHANCE: {
                        [skill.technicalName]: marks.eff[id]
                    }
                }
            });
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
        if(various.opulenceMode) {
            stats.opulenceMode = various.opulenceMode;
        }
    }

    function cleanup() {
        // base
        addStats({
            global: {
                HEALTH: 10
            }
        });
        // fallback
        if(!stats.weapon) {
            stats.weapon = null;
            stats.attackStyle = '';
            stats.global.ATTACK_SPEED = 6;
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
        // bonus level efficiency
        if(stats.bySkill['BONUS_LEVEL']) {
            for(const skill in stats.bySkill['BONUS_LEVEL']) {
                addStats({
                    bySkill: {
                        EFFICIENCY_CHANCE: {
                            [skill]: 0.25
                        }
                    }
                }, Math.round(stats.bySkill['BONUS_LEVEL'][skill]), 4);
            }
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
window.moduleRegistry.add('variousStateStore', (events) => {

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
window.moduleRegistry.add('actionCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {}
    };

    async function initialise() {
        const actions = await request.listActions();
        for(const action of actions) {
            exports.list.push(action);
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
        return exports;
    }

    return initialise();

}
);
// dropCache
window.moduleRegistry.add('dropCache', (request, itemCache, actionCache, ingredientCache, skillCache) => {

    const exports = {
        list: [],
        byAction: {},
        byItem: {},
        boneCarveMappings: null,
        conversionMappings: null,
        tierVarietyMappings: null,
        produceItems: null,
        getMostCommonDrop
    };

    async function initialise() {
        const drops = await request.listDrops();
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
        extractConversions();
        extractTierVariety();
        extractProduceItems();
        enrichItems();
        return exports;
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

    function extractTierVariety() {
        exports.tierVarietyMappings = exports.list
            .filter(drop => drop.type === 'REGULAR')
            .filter(drop => drop.chance >= 0.8)
            .filter(drop => skillCache.byName[actionCache.byId[drop.action].skill].type === 'Gathering')
            ._groupBy(drop => actionCache.byId[drop.action].level)
            .flatMap(drops => drops
                .map(drop => drop.item)
                ._distinct()
                .flatMap((item, _i, arr) => ({
                    from: item,
                    to: arr.filter(a => a !== item)
                }))
            ).reduce((a,b) => (a[b.from] = b.to, a), {});
    }

    function extractProduceItems() {
        exports.produceItems = exports.list
            .filter(drop => actionCache.byId[drop.action].skill === 'Farming')
            .filter(drop => drop.type === 'REGULAR')
            .map(drop => drop.item)
            ._distinct();
    }

    function getMostCommonDrop(actionId) {
        return exports.byAction[actionId].sort((a,b) => a.chance - b.chance)[0].item;
    }

    function enrichItems() {
        for(const item of itemCache.list) {
            if(item.attributes.SELL_PRICE) {
                item.attributes.MIN_MARKET_PRICE = calcMarketPrice(item);
            }
        }
    }

    function calcMarketPrice(item) {
        if(item.attributes.UNTRADEABLE || !item.attributes.SELL_PRICE) {
            return 0;
        }
        if(itemCache.specialIds.gem.includes(item.id)) {
            return item.attributes.SELL_PRICE * 1.2;
        }
        if(exports.produceItems.includes(item.id)) {
            return item.attributes.SELL_PRICE * 1.5 - 1;
        }
        if(itemCache.specialIds.food.includes(item.id)) {
            return Math.round(0.8 * item.stats.global.HEAL);
        }
        if(itemCache.specialIds.smithing.includes(item.id)) {
            return 2 * Math.round(item.attributes.SELL_PRICE * 3/4);
        }
        return 2 * item.attributes.SELL_PRICE;
    }

    return initialise();

}
);
// expeditionCache
window.moduleRegistry.add('expeditionCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byTier: {}
    };

    async function initialise() {
        const expeditions = await request.listExpeditions();
        for(const expedition of expeditions) {
            exports.list.push(expedition);
            exports.byId[expedition.id] = expedition;
            exports.byName[expedition.name] = expedition;
            exports.byTier[expedition.tier] = expedition;
        }
        return exports;
    }

    return initialise();

}
);
// expeditionDropCache
window.moduleRegistry.add('expeditionDropCache', (request) => {

    const exports = {
        list: [],
        byExpedition: {},
        byItem: {}
    };

    async function initialise() {
        const drops = await request.listExpeditionDrops();
        for(const drop of drops) {
            exports.list.push(drop);
            if(!exports.byExpedition[drop.expedition]) {
                exports.byExpedition[drop.expedition] = [];
            }
            exports.byExpedition[drop.expedition].push(drop);
            if(!exports.byItem[drop.item]) {
                exports.byItem[drop.item] = [];
            }
            exports.byItem[drop.item].push(drop);
        }
        return exports;
    }

    return initialise();

}
);
// ingredientCache
window.moduleRegistry.add('ingredientCache', (request) => {

    const exports = {
        list: [],
        byAction: {},
        byItem: {}
    };

    async function initialise() {
        const ingredients = await request.listIngredients();
        for(const ingredient of ingredients) {
            exports.list.push(ingredient);
            if(!exports.byAction[ingredient.action]) {
                exports.byAction[ingredient.action] = [];
            }
            exports.byAction[ingredient.action].push(ingredient);
            if(!exports.byItem[ingredient.item]) {
                exports.byItem[ingredient.item] = [];
            }
            exports.byItem[ingredient.item].push(ingredient);
        }
        return exports;
    }

    return initialise();

}
);
// itemCache
window.moduleRegistry.add('itemCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byImage: {},
        attributes: null,
        specialIds: {
            coins: null,
            charcoal: null,
            stardust: null,
            mainHand: null,
            offHand: null,
            helmet: null,
            body: null,
            gloves: null,
            boots: null,
            amulet: null,
            ring: null,
            bracelet: null,
            hatchet: null,
            pickaxe: null,
            spade: null,
            rod: null,
            dagger: null,
            telescope: null,
            lantern: null,
            food: null,
            gatheringPotion: null,
            craftingPotion: null,
            combatPotion: null,
            dungeonKey: null,
            woodcuttingRune: null,
            miningRune: null,
            farmingRune: null,
            fishingRune: null,
            oneHandedRune: null,
            twoHandedRune: null,
            rangedRune: null,
            defenseRune: null,
            forestDamageRune: null,
            forestBlockRune: null,
            mountainDamageRune: null,
            mountainBlockRune: null,
            oceanDamageRune: null,
            oceanBlockRune: null,
            savageLootingTome: null,
            bountifulHarvestTome: null,
            opulentCraftingTome: null,
            insatiablePowerTome: null,
            potentConcoctionTome: null,
            gem: null,
            smithing: null
        }
    };

    async function initialise() {
        await loadItems();
        await loadItemAttributes();
        enrichItems();
        return exports;
    }

    async function loadItems() {
        const enrichedItems = await request.listItems();
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
        }
        for(const image of Object.keys(exports.byImage)) {
            if(exports.byImage[image].duplicate) {
                delete exports.byImage[image];
            }
        }
        // does not cover any event items
        const potions = exports.list.filter(a => /(Potion|Mix)$/.exec(a.name));
        exports.specialIds.coins = exports.byName['Coins'].id;
        exports.specialIds.charcoal = exports.byName['Charcoal'].id;
        exports.specialIds.stardust = exports.byName['Stardust'].id;
        exports.specialIds.mainHand = getAllIdsEnding('Sword', 'Hammer', 'Spear', 'Scythe', 'Bow', 'Boomerang');
        exports.specialIds.offHand = getAllIdsEnding('Shield');
        exports.specialIds.helmet = getAllIdsEnding('Helmet');
        exports.specialIds.body = getAllIdsEnding('Body');
        exports.specialIds.gloves = getAllIdsEnding('Gloves');
        exports.specialIds.boots = getAllIdsEnding('Boots');
        exports.specialIds.amulet = getAllIdsEnding('Amulet');
        exports.specialIds.ring = getAllIdsEnding('Ring');
        exports.specialIds.bracelet = getAllIdsEnding('Bracelet');
        exports.specialIds.hatchet = getAllIdsEnding('Hatchet');
        exports.specialIds.pickaxe = getAllIdsEnding('Pickaxe');
        exports.specialIds.spade = getAllIdsEnding('Spade');
        exports.specialIds.rod = getAllIdsEnding('Rod');
        exports.specialIds.dagger = getAllIdsEnding('Dagger');
        exports.specialIds.telescope = getAllIdsEnding('Telescope');
        exports.specialIds.lantern = getAllIdsEnding('Lantern');
        exports.specialIds.food = exports.list.filter(a => a.stats.global.HEAL).map(a => a.id);
        exports.specialIds.dungeonKey = getAllIdsStarting('Dungeon Key');
        exports.specialIds.gatheringPotion = potions.filter(a => a.name.includes('Gather')).map(a => a.id);
        exports.specialIds.craftingPotion = potions.filter(a => a.name.includes('Craft') || a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.combatPotion = potions.filter(a => !a.name.includes('Gather') && !a.name.includes('Craft') && !a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.woodcuttingRune = getAllIdsEnding('Woodcutting Rune');
        exports.specialIds.miningRune = getAllIdsEnding('Mining Rune');
        exports.specialIds.farmingRune = getAllIdsEnding('Farming Rune');
        exports.specialIds.fishingRune = getAllIdsEnding('Fishing Rune');
        exports.specialIds.oneHandedRune = getAllIdsEnding('One-handed Rune');
        exports.specialIds.twoHandedRune = getAllIdsEnding('Two-handed Rune');
        exports.specialIds.rangedRune = getAllIdsEnding('Ranged Rune');
        exports.specialIds.defenseRune = getAllIdsEnding('Defense Rune');
        exports.specialIds.forestDamageRune = getAllIdsEnding('Forest Damage Rune');
        exports.specialIds.forestBlockRune = getAllIdsEnding('Forest Block Rune');
        exports.specialIds.mountainDamageRune = getAllIdsEnding('Mountain Damage Rune');
        exports.specialIds.mountainBlockRune = getAllIdsEnding('Mountain Block Rune');
        exports.specialIds.oceanDamageRune = getAllIdsEnding('Ocean Damage Rune');
        exports.specialIds.oceanBlockRune = getAllIdsEnding('Ocean Block Rune');
        exports.specialIds.savageLootingTome = getAllIdsStarting('Savage Looting Tome');
        exports.specialIds.bountifulHarvestTome = getAllIdsStarting('Bountiful Harvest Tome');
        exports.specialIds.opulentCraftingTome = getAllIdsStarting('Opulent Crafting Tome');
        exports.specialIds.insatiablePowerTome = getAllIdsStarting('Insatiable Power Tome');
        exports.specialIds.potentConcoctionTome = getAllIdsStarting('Potent Concoction Tome');
        exports.specialIds.gem = exports.list.filter(a => a.arcanePowder).map(a => a.id);
        exports.specialIds.smithing = [
            ...exports.specialIds.mainHand,
            ...exports.specialIds.offHand,
            ...exports.specialIds.helmet,
            ...exports.specialIds.body,
            ...exports.specialIds.gloves,
            ...exports.specialIds.boots,
            ...exports.specialIds.hatchet,
            ...exports.specialIds.pickaxe,
            ...exports.specialIds.spade,
            ...exports.specialIds.rod
        ];
        for(const key of Object.keys(exports.specialIds)) {
            if(!exports.specialIds[key]) {
                throw `Unconfigured special id for ${key}`;
            }
        }
    }

    async function loadItemAttributes() {
        exports.attributes = await request.listItemAttributes();
        exports.attributes.push({
            technicalName: 'CHARCOAL',
            name: 'Charcoal',
            image: '/assets/items/charcoal.png'
        },{
            technicalName: 'COMPOST',
            name: 'Compost',
            image: '/assets/items/compost.png'
        },{
            technicalName: 'ARCANE_POWDER',
            name: 'Arcane Powder',
            image: '/assets/items/arcane-powder.png'
        },{
            technicalName: 'PET_SNACKS',
            name: 'Pet Snacks',
            image: '/assets/items/pet-snacks.png'
        },{
            technicalName: 'METAL_PARTS',
            name: 'Metal Parts',
            image: '/assets/items/metal-parts.png'
        },{
            technicalName: 'MIN_MARKET_PRICE',
            name: 'Min Market Price',
            image: '/assets/misc/market.png'
        },{
            technicalName: 'OWNED',
            name: 'Owned',
            image: '/assets/misc/inventory.png'
        },{
            technicalName: 'DROP_CHANCE',
            name: 'Drop Chance',
            image: 'https://img.icons8.com/?size=48&id=CTW7OqTDhWF0'
        });
    }

    function enrichItems() {
        for(const item of exports.list) {
            if(!item.attributes) {
                item.attributes = {};
            }
        }
    }

    function getAllIdsEnding(...suffixes) {
        return exports.list.filter(a => new RegExp(`(${suffixes.join('|')})$`).exec(a.name)).map(a => a.id);
    }

    function getAllIdsStarting(...prefixes) {
        return exports.list.filter(a => new RegExp(`^(${prefixes.join('|')})`).exec(a.name)).map(a => a.id);
    }

    return initialise();

}
);
// monsterCache
window.moduleRegistry.add('monsterCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {}
    };

    async function initialise() {
        const monsters = await request.listMonsters();
        for(const monster of monsters) {
            exports.list.push(monster);
            exports.byId[monster.id] = monster;
            exports.byName[monster.name] = monster;
        }
        return exports;
    }

    return initialise();

}
);
// petCache
window.moduleRegistry.add('petCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byImage: {},
        idToIndex: {}
    };

    async function initialise() {
        const pets = await request.listPets();
        for(const pet of pets) {
            exports.list.push(pet);
            exports.byId[pet.id] = pet;
            exports.byName[pet.name] = pet;
            exports.idToIndex[pet.id] = exports.list.length-1;
            const lastPart = pet.image.split('/').at(-1);
            exports.byImage[lastPart] = pet;
            pet.abilities = [{
                [pet.abilityName1]: pet.abilityValue1
            }];
            if(pet.abilityName2) {
                pet.abilities.push({
                    [pet.abilityName2]: pet.abilityValue2
                });
            }
            delete pet.abilityName1;
            delete pet.abilityValue1;
            delete pet.abilityName2;
            delete pet.abilityValue2;
        }
        return exports;
    }

    return initialise();

}
);
// petPassiveCache
window.moduleRegistry.add('petPassiveCache', (util, request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        idToIndex: {}
    };

    async function initialise() {
        const petPassives = await request.listPetPassives();
        for(const petPassive of petPassives) {
            exports.list.push(petPassive);
            exports.byId[petPassive.id] = petPassive;
            exports.byName[petPassive.name] = petPassive;
            exports.idToIndex[petPassive.id] = exports.list.length-1;
            petPassive.stats = {
                name: petPassive.statName,
                value: petPassive.statValue,
                level: util.parseNumber(petPassive.name)
            };
            delete petPassive.statName;
            delete petPassive.statValue;
        }
        return exports;
    }

    return initialise();

}
);
// recipeCache
window.moduleRegistry.add('recipeCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byImage: {}
    };

    async function initialise() {
        exports.list = await request.listRecipes();
        for(const recipe of exports.list) {
            exports.byId[recipe.id] = recipe;
            exports.byName[recipe.name] = recipe;
            const lastPart = recipe.image.split('/').at(-1);
            exports.byImage[lastPart] = recipe;
        }
        return exports;
    }

    return initialise();

}
);
// skillCache
window.moduleRegistry.add('skillCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byTechnicalName: {},
        match,
    };

    async function initialise() {
        const skills = await request.listSkills();
        for(const skill of skills) {
            exports.list.push(skill);
            exports.byId[skill.id] = skill;
            exports.byName[skill.displayName] = skill;
            exports.byTechnicalName[skill.technicalName] = skill;
        }
        return exports;
    }

    function match(name) {
        name = name.toLowerCase();
        for(let skill of exports.list) {
            if(name === skill.displayName.toLowerCase()) {
                return skill;
            }
            if(name === skill.technicalName.toLowerCase()) {
                return skill;
            }
        }
    }

    return initialise();

}
);
// skillSetCache
window.moduleRegistry.add('skillSetCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
    };

    async function initialise() {
        const skillSets = await request.listSkillSets();
        for(const skillSet of skillSets) {
            exports.list.push(skillSet);
            exports.byId[skillSet.id] = skillSet;
            exports.byName[skillSet.name] = skillSet;
        }
        return exports;
    }

    return initialise();

}
);
// statNameCache
window.moduleRegistry.add('statNameCache', (request) => {

    const exports = {
        list: [],
        byName: {},
        validate
    };

    async function initialise() {
        const stats = await request.listItemStats();
        stats.push('MAX_AMOUNT'); // frontend only
        for(const stat of stats) {
            exports.list.push(stat);
            exports.byName[stat] = stat;
        }
        return exports;
    }

    function validate(name) {
        if(!exports.byName[name]) {
            throw `Unsupported stat usage : ${name}`;
        }
    }

    return initialise();

});
// structuresCache
window.moduleRegistry.add('structuresCache', (request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {}
    };

    async function initialise() {
        const structures = await request.listStructures();
        for(const structure of structures) {
            exports.list.push(structure);
            exports.byId[structure.id] = structure;
            exports.byName[structure.name] = structure;
        }
        return exports;
    }

    return initialise();

}
);
window.moduleRegistry.build();
