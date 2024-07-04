(pages, components, configuration, request, localDatabase, toast, logService, events, syncTracker) => {

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
            await loadSingle(entry.key);
        }
    }

    async function loadSingle(id) {
        try {
            const registration = await request.getDiscordRegistration(id);
            await add(registration);
            return registration;
        } catch(e) {
            remove({
                id
            });
        }
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
        let name = types.find(a => a.value === registration.type).text;
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
            toast.create({
                text: messageSuccess,
                image: 'https://img.icons8.com/?size=100&id=sz8cPVwzLrMP&format=png&color=000000'
            });
        } catch(e) {
            console.error(e);
            logService.error(e);
            toast.create({
                text: messageError,
                image: 'https://img.icons8.com/?size=100&id=63688&format=png&color=000000'
            });
        }
        pages.requestRender(PAGE_NAME);
    }

    async function clickRefresh() {
        tryExecute(async () => {
            highlightedRegistration = await loadSingle(highlightedRegistration.id);
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
        components.search(componentBlueprintEdit, 'enabled').checked = !!highlightedRegistration.enabled;
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
