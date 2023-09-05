(auth, request) => {

    const authenticated = auth.ready;

    const exports = {
        registerToggle,
        registerInput,
        registerButton,
        registerCategory,
        register
    };

    const metaConfiguration = {
        type: 'main',
        name: 'configuration',
        text: '⚙'
    };

    const itemByName = {};

    async function initialise() {
        setup();
        refresh();
        document.addEventListener('click', handleOutsideClick);
        await authenticated;
        loadState();
    }

    function registerToggle(name, text, initial, callback, parent) {
        return register({
            type: 'toggle',
            name,
            text,
            handle: callback,
            initialState: initial
        }, parent);
    }

    function registerInput(name, text, type, initial, callback, parent) {
        return register({
            type: 'input',
            name,
            text,
            handle: callback,
            inputType: type,
            initialState: initial
        }, parent);
    }

    function registerButton(name, text, callback, parent) {
        return register({
            type: 'button',
            name,
            text,
            handle: callback
        }, parent);
    }

    function registerCategory(name, text, parent) {
        return register({
            type: 'category',
            name,
            text
        }, parent);
    }

    function register(item, parent) {
        if(!parent) {
            parent = metaConfiguration;
        }
        delete item.items;
        if(!parent.items) {
            parent.items = [];
        }
        for(const child of parent.items) {
            if(child.type === item.type && child.name === item.name) {
                return child;
            }
        }
        parent.items.push(item);
        refresh();
        if(['toggle', 'input'].includes(item.type)) {
            handleStateChange(item, item.initialState, true);
        }
        itemByName[item.name] = item;
        return item;
    }

    async function saveState(item) {
        if(!auth.isReady) {
            return;
        }
        let key = item.name;
        let value = '';
        if(item.type === 'toggle') {
            value = !!item.state;
        }
        if(item.type === 'input') {
            value = JSON.stringify(item.state);
        }
        await request('configuration', {
            [key]: value
        });
    }

    async function loadState() {
        const storedSaveState = await request('configuration');
        for(const key in storedSaveState) {
            const item = itemByName[key];
            if(item) {
                const value = JSON.parse(storedSaveState[key]);
                handleStateChange(item, value, true);
            }
        }
    }

    function handleStateChange(item, state, initial) {
        item.state = state;
        if(item.handle) {
            item.handle(state, item.name, initial);
        }
        if(!initial) {
            saveState(item);
        }
        if(item.type === 'toggle') {
            $(`#${item.id}`)
                .find('> input')
                .attr('checked', state);
        }
        if(item.type === 'input') {
            $(`#${item.id}`)
                .find('> input')
                .val(state);
        }
    }

    function refresh() {
        $('body > .custom-configuration-item-wrapper').remove();
        addItems($(`body`), [metaConfiguration]).addClass('visible');
    }

    function addItems(baseComponent, items) {
        const wrapperComponent = $(`<div/>`)
            .addClass('custom-configuration-item-wrapper')
        for(const item of items) {
            const itemComponent = createItemComponent(item);
            if(item.items) {
                addItems(itemComponent, item.items);
            }
            wrapperComponent.append(itemComponent);
        }
        baseComponent.append(wrapperComponent);
        return wrapperComponent;
    }

    function createItemComponent(item) {
        item.id = crypto.randomUUID();
        const itemComponent = $(`<button/>`).attr('id', item.id);
        if(item.type === 'main') {
            itemComponent.addClass('custom-configuration-main hoverable');
        } else {
            itemComponent.addClass('custom-configuration-item hoverable');
        }
        if(item.type === 'main') {
            itemComponent.text(item.text || item.name);
        }
        if(item.type === 'category') {
            itemComponent
                .append($('<span class="custom-configuration-arrow"/>').text('◄'))
                .append($('<span/>').text(item.text || item.name));
        }
        if(item.type === 'toggle') {
            itemComponent
                .append($('<input type="checkbox"/>').attr('checked', item.state))
                .append($('<span/>').text(item.text || item.name));
        }
        if(item.type === 'input') {
            itemComponent
                .append($('<span/>').text(item.text || item.name))
                .append($('<input/>').attr('type', item.inputType).val(item.state).change(handleItemChange.bind(null, item)));
        }
        if(item.type === 'button') {
            itemComponent
                .append($('<span/>').text(item.text || item.name))
                .append($('<button/>').click(handleItemChange.bind(null, item)));
        }
        itemComponent.click(handleItemClick.bind(null, item));
        return itemComponent;
    }

    function handleItemClick(item, event) {
        event.stopPropagation();
        if(['main', 'category'].includes(item.type)) {
            $(event.currentTarget)
                .siblings()
                .find('> .custom-configuration-item-wrapper.visible')
                .removeClass('visible');
            $(event.currentTarget)
                .find('> .custom-configuration-item-wrapper')
                .toggleClass('visible');
        }
        if(item.type === 'toggle') {
            handleStateChange(item, !item.state);
        }
        if(item.type === 'button') {
            handleStateChange(item, null);
        }
    }

    function handleItemChange(item, event) {
        event.stopPropagation();
        if(item.type === 'input') {
            if(event.target.value !== '') {
                handleStateChange(item, event.target.value);
            }
        }
    }

    function handleOutsideClick(event) {
        const target = document.querySelector('.custom-configuration-main');
        const withinBoundaries = event.composedPath().includes(target)
        if(!withinBoundaries) {
            $('.custom-configuration-main .custom-configuration-item-wrapper').removeClass('visible');
        }
    }

    function setup() {
        $('head').append(`
            <style>
                .custom-configuration-item-wrapper {
                    position: absolute;
                    right: calc(100% + .7rem);
                    bottom: 0;
                    display: none;
                    font-family: Jost,Helvetica Neue,Arial,sans-serif;
                    flex-direction: column;
                    white-space: nowrap;
                }
                .custom-configuration-main {
                    position: fixed;
                    right: 2em;
                    bottom: 1em;
                    display: table-cell;
                    padding: .4rem;
                    border-radius: 4px;
                    text-align: center;
                    font-weight: 600;
                    letter-spacing: .25px;
                    border: none;
                    color: white;
                    background-color: #65aadb;
                }
                .custom-configuration-item {
                    position: relative;
                    display: flex;
                    justify-content: flex-start;
                    align-items: center;
                    gap: 4px;
                    padding: 4px;
                    background-color: #65aadb;
                }
                .custom-configuration-item:first-child {
                    border-radius: 4px 4px 0 0;
                }
                .custom-configuration-item:last-child {
                    border-radius: 0 0 4px 4px;
                }
                .custom-configuration-arrow {
                    color: black;
                }
                .custom-configuration-item > input:not([type="checkbox"]) {
                    margin-left: auto;
                    width: 5em;
                    background-color: white;
                    color: black;
                    padding: .2em;
                }
                .hoverable:hover {
                    background-color: #3d94d1;
                }
                .custom-configuration-on {
                    box-shadow: rgba(50, 50, 93, 0.25) 0px 30px 60px -12px inset, rgba(0, 0, 0, 0.3) 0px 18px 36px -18px inset;
                }
                .custom-configuration-item-wrapper.visible {
                    display: flex;
                }
            </style>
        `);
    }

    initialise();

    return exports;

}
