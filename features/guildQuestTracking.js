(request, configuration, events, components) => {

    let enabled = false;
    let registrationAmount = 0;
    let selectedItem;
    let questsData;
    let combinedData;

    function initialise() {
        const category = configuration.registerCategory('other', 'Other');
        configuration.registerToggle('guild-quest-tracking', 'Guild quest tracking', true, handleConfigStateChange, category);
        events.register('xhr', handleXhr);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleXhr(xhr) {
        if(!enabled) {
            return;
        }
        if(xhr.url.endsWith('/createGuildQuests')) {
            refresh();
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
