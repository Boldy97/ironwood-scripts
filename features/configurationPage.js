(pages, components, elementWatcher, configuration, auth) => {

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
        addStyles();
        await generateBlueprint();
        pages.show(PAGE_NAME);
    }

    function addStyles() {
        const head = document.getElementsByTagName('head')[0]
        if (!head) { return; }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = styles;
        head.appendChild(style);
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
