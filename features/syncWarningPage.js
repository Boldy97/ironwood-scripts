(userStore, pages, components, util) => {

    const PAGE_NAME = 'Plugin not synced';
    const STARTED = new Date().getTime();

    async function initialise() {
        await addSyncedPage();
        const intervalReference = window.setInterval(pages.requestRender.bind(null, PAGE_NAME), 1000);
        await userStore.ready;
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
