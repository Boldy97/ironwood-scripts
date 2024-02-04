(events, localDatabase, pages, components, util, toast, elementWatcher, EstimationGenerator) => {

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

    function exportToClipboard() {
        const state = (new EstimationGenerator()).export();
        navigator.clipboard.writeText(JSON.stringify(state));
        toast.create({
            text: 'Exported to clipboard',
            image: 'https://img.icons8.com/?size=48&id=22244'
        });
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
                            },
                            {
                                text: 'Export to clipboard',
                                color: 'primary',
                                action: exportToClipboard
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
