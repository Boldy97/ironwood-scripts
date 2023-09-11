(events, request, configuration, itemCache, userCache, util) => {

    const registerCategory = configuration.registerCategory;
    const registerToggle = configuration.registerToggle;
    const registerPageHandler = events.register.bind(null, 'page');
    const registerXhrHandler = events.register.bind(null, 'xhr');
    const registerUserCacheHandler = events.register.bind(null, 'userCache');
    const getLastPage = events.getLast.bind(null, 'page');
    const getLastEstimation = events.getLast.bind(null, 'estimation');
    const emitEvent = events.emit.bind(null, 'estimation');

    let enabled = false;
    let cache = {};

    function initialise() {
        const category = registerCategory('ui-features', 'UI Features');
        registerToggle('estimations', 'Estimations', false, handleConfigStateChange, category);

        registerPageHandler(handlePage);
        registerXhrHandler(handleXhr);
        registerUserCacheHandler(handleUserCache);
    }

    function handleConfigStateChange(state, name) {
        const previous = enabled;
        enabled = state;
        if(!enabled) {
            emitEvent(null);
        }
        if(enabled && !previous) {
            handlePage(getLastPage());
        }
    }

    async function handlePage(page) {
        emitEvent(null);
        let result = null;
        if(!enabled || !page) {
            result = null;
        } else if(page.type === 'action') {
            const cacheKey = `action-${page.skill}-${page.action}`;
            const fetcher = getAction.bind(null, page.skill, page.action);
            result = await getEstimationData(cacheKey, fetcher);
        } else if(page.type === 'automation') {
            const cacheKey = `automation-${page.action}`;
            const fetcher = getAutomation.bind(null, page.action);
            result = await getEstimationData(cacheKey, fetcher);
        }
        // it could have changed by now
        if(enabled && page === getLastPage()) {
            emitEvent(result);
        }
    }

    function handleXhr(xhr) {
        if(xhr.url.endsWith('/time')) {
            return;
        }
        cache = {};
        emitEvent(null);
        handlePage(getLastPage());
    }

    async function handleUserCache() {
        await updateAll();
        emitEvent(getLastEstimation());
    }

    async function getEstimationData(cacheKey, fetcher) {
        const estimation = cache[cacheKey] || await fetcher();
        cache[cacheKey] = estimation;
        return estimation;
    }

    async function getAction(skill, action) {
        const result = await request.getActionEstimation(skill, action);
        result.actionId = action;
        return convertEstimation(result);
    }

    async function getAutomation(action) {
        const result = await request.getAutomationEstimation(action);
        result.actionId = action;
        return convertEstimation(result);
    }

    async function convertEstimation(estimation) {
        await itemCache.ready;
        const loot = estimation.loot;
        const materials = estimation.materials;
        const equipments = estimation.equipments;
        estimation.loot = [];
        for(const entry of Object.entries(loot)) {
            estimation.loot.push({
                item: itemCache.byId[entry[0]],
                amount: entry[1],
                gold: entry[1] * (itemCache.byId[entry[0]].attributes.SELL_PRICE || 0)
            });
        }
        estimation.materials = [];
        for(const entry of Object.entries(materials)) {
            estimation.materials.push({
                item: itemCache.byId[entry[0]],
                amount: entry[1],
                stored: 0,
                secondsLeft: 0,
                gold: entry[1] * (itemCache.byId[entry[0]].attributes.SELL_PRICE || 0)
            });
        }
        estimation.equipments = [];
        for(const entry of Object.entries(equipments)) {
            estimation.equipments.push({
                item: itemCache.byId[entry[0]],
                amount: entry[1],
                stored: 0,
                secondsLeft: 0,
                gold: entry[1] * (itemCache.byId[entry[0]].attributes.SELL_PRICE || 0)
            });
        }
        estimation.goldLoot = estimation.loot.map(a => a.gold).reduce((a,v) => a+v, 0);
        estimation.goldMaterials = estimation.materials.map(a => a.gold).reduce((a,v) => a+v, 0);
        estimation.goldEquipments = estimation.equipments.map(a => a.gold).reduce((a,v) => a+v, 0);
        estimation.goldTotal = estimation.goldLoot - estimation.goldMaterials - estimation.goldEquipments;
        await updateOne(estimation);
        return estimation;
    }

    async function updateAll() {
        if(!enabled) {
            return;
        }
        for(const estimation of Object.values(cache)) {
            await updateOne(estimation);
        }
    }

    async function updateOne(estimation) {
        await userCache.ready;
        for(const material of estimation.materials) {
            material.stored = userCache.inventory[material.item.id] || 0;
            material.secondsLeft = material.stored / material.amount * 3600;
        }
        for(const equipment of estimation.equipments) {
            equipment.stored = userCache.equipment[equipment.item.id] || 0;
            equipment.secondsLeft = equipment.stored / equipment.amount * 3600;
        }
        if(estimation.type === 'AUTOMATION' && userCache.automations[estimation.actionId]) {
            estimation.amountSecondsLeft = estimation.actionSpeed * (userCache.automations[estimation.actionId].maxAmount - userCache.automations[estimation.actionId].amount);
        } else if(estimation.maxAmount) {
            estimation.amountSecondsLeft = estimation.actionSpeed * (estimation.maxAmount - userCache.action.amount);
        } else {
            estimation.amountSecondsLeft = Number.MAX_VALUE;
        }
        if(estimation.type === 'AUTOMATION' && estimation.amountSecondsLeft !== Number.MAX_VALUE) {
            estimation.secondsLeft = estimation.amountSecondsLeft;
        } else {
            estimation.secondsLeft = Math.min(
                estimation.amountSecondsLeft,
                ...estimation.materials.map(a => a.secondsLeft),
                ...estimation.equipments.map(a => a.secondsLeft)
            );
        }
        const currentExp = userCache.exp[estimation.skill];
        estimation.secondsToNextlevel = util.expToNextLevel(currentExp) / estimation.exp * 3600;
        estimation.secondsToNextTier = util.expToNextTier(currentExp) / estimation.exp * 3600;
    }

    initialise();

}
