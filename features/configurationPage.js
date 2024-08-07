(pages, components, configuration, elementCreator) => {

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
