(request, configuration, events, userCache, actionCache) => {

    let enabled = false;

    function initialise() {
        const category = configuration.registerCategory('other', 'Other');
        configuration.registerToggle('tab-title-enabled', 'Tab title', false, handleConfigStateChange, category);
        events.register('userCache', setCurrentAction);
    }

    async function handleConfigStateChange(state, name) {
        enabled = state;
        setCurrentAction();
    }

    async function setCurrentAction() {
        await userCache.ready;
        await actionCache.ready;
        if(!enabled) {
            return;
        }
        if(!userCache.action.actionId) {
            setTitle('~IDLE~');
            return;
        }
        const match = actionCache.byId[userCache.action.actionId];
        if(!match) {
            return;
        }
        setTitle(`${match.skill} - ${match.name}`);
    }

    function setTitle(title) {
        if(!enabled) {
            return;
        }
        document.title = title;
    }

    initialise();

}
