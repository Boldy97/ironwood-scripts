(request, configuration, events) => {

    let enabled = false;
    let currentActionId;
    let actionCacheById;

    function initialise() {
        const category = configuration.registerCategory('other', 'Other');
        configuration.registerToggle('tab-title-enabled', 'Tab title', false, handleConfigStateChange, category);
        events.register('xhr', handleXhr);
    }

    async function handleConfigStateChange(state, name) {
        enabled = state;
        await setupActionCache();
        setCurrentAction();
    }

    async function handleXhr(xhr) {
        if(xhr.url.endsWith('getUser')) {
            currentActionId = xhr.response?.user?.action?.actionId;
            setCurrentAction();
        }
        if(xhr.url.endsWith('startAction')) {
            currentActionId = xhr.request.actionId;
            setCurrentAction();
        }
        if(xhr.url.endsWith('stopAction')) {
            currentActionId = undefined;
            setTitle('~IDLE~');
        }
    }

    async function setupActionCache() {
        if(!enabled || actionCacheById) {
            return;
        }
        const actions = await request('list/action');
        actionCacheById = {};
        for(const action of actions) {
            actionCacheById[action.id] = action;
        }
    }

    function setCurrentAction() {
        if(!enabled || !currentActionId || !actionCacheById) {
            return;
        }
        const match = actionCacheById[currentActionId];
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
