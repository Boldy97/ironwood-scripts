(Promise, pages, components, request, configuration) => {

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
