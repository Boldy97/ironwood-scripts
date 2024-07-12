(configuration, events, skillCache, actionCache, itemCache, estimatorAction, estimatorOutskirts, estimatorActivity, estimatorCombat, components, util, statsStore) => {

    const emitEvent = events.emit.bind(null, 'estimator');
    let enabled = false;

    const exports = {
        get,
        enrichTimings,
        enrichValues,
        preRenderItems
    }

    function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'estimations',
            name: 'Estimations',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('state-stats', update);
        $(document).on('click', '.close', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update() {
        if(!enabled) {
            return;
        }
        const page = events.getLast('page');
        if(page?.type === 'action') {
            const stats = events.getLast('state-stats');
            if(stats) {
                const estimation = get(page.skill, page.action);
                estimation.isCurrent = !!$('.header .name:contains("Loot")').length;
                enrichTimings(estimation);
                enrichValues(estimation);
                preRender(estimation, componentBlueprint);
                preRenderItems(estimation, componentBlueprint);
                components.addComponent(componentBlueprint);
                emitEvent(estimation);
            }
        }
    }

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        if(action.type === 'OUTSKIRTS') {
            return estimatorOutskirts.get(skillId, actionId);
        } else if(skill.type === 'Gathering' || skill.type === 'Crafting') {
            return estimatorActivity.get(skillId, actionId);
        } else if(skill.type === 'Combat') {
            return estimatorCombat.get(skillId, actionId);
        }
    }

    function enrichTimings(estimation) {
        const inventory = Object.entries(estimation.ingredients).map(([id,amount]) => ({
            id,
            stored: statsStore.getInventoryItem(id),
            secondsLeft: statsStore.getInventoryItem(id) * 3600 / amount
        })).reduce((a,b) => (a[b.id] = b, a), {});
        const equipment = Object.entries(estimation.equipments).map(([id,amount]) => ({
            id,
            stored: statsStore.getEquipmentItem(id),
            secondsLeft: statsStore.getEquipmentItem(id) * 3600 / amount
        })).reduce((a,b) => (a[b.id] = b, a), {});
        let maxAmount = statsStore.get('MAX_AMOUNT', estimation.skill);
        maxAmount = {
            value: maxAmount,
            secondsLeft: estimation.productionSpeed / 10 * (maxAmount || Infinity)
        };
        const levelState = statsStore.getLevel(estimation.skill);
        const goalTimeRow = componentBlueprint.tabs[0].rows.find(({id}) => id === 'goalTime')
        estimation.timings = {
            inventory,
            equipment,
            maxAmount,
            finished: Math.min(maxAmount.secondsLeft || Infinity, ...Object.values(inventory).concat(Object.values(equipment)).map(a => a.secondsLeft)),
            level: util.expToNextLevel(levelState.exp) * 3600 / estimation.exp,
            tier: levelState.level >= 100 ? 0 : util.expToNextTier(levelState.exp) * 3600 / estimation.exp,
            goal: util.expToSpecificLevel(levelState.exp, goalTimeRow.inputValue) * 3600 / estimation.exp
        };
    }

    function enrichValues(estimation) {
        estimation.values = {
            drop: getSellPrice(estimation.drops),
            ingredient: getSellPrice(estimation.ingredients),
            equipment: getSellPrice(estimation.equipments),
            net: 0
        };
        estimation.values.net = estimation.values.drop - estimation.values.ingredient - estimation.values.equipment;
    }

    function getSellPrice(object) {
        return Object.entries(object)
            .map(a => a[1] * itemCache.byId[a[0]].attributes.SELL_PRICE)
            .filter(a => a)
            .reduce((a,b) => a+b, 0);
    }

    function preRender(estimation, blueprint) {
        components.search(blueprint, 'actions').value
            = util.formatNumber(estimatorAction.LOOPS_PER_HOUR / estimation.speed);
        components.search(blueprint, 'exp').hidden
            = estimation.exp === 0;
        components.search(blueprint, 'exp').value
            = util.formatNumber(estimation.exp);
        components.search(blueprint, 'survivalChance').hidden
            = estimation.type === 'ACTIVITY';
        components.search(blueprint, 'survivalChance').value
            = util.formatNumber(estimation.survivalChance * 100) + ' %';
        components.search(blueprint, 'finishedTime').value
            = util.secondsToDuration(estimation.timings.finished);
        components.search(blueprint, 'levelTime').hidden
            = estimation.exp === 0 || estimation.timings.level === 0;
        components.search(blueprint, 'levelTime').value
            = util.secondsToDuration(estimation.timings.level);
        components.search(blueprint, 'tierTime').hidden
            = estimation.exp === 0 || estimation.timings.tier === 0;
        components.search(blueprint, 'tierTime').value
            = util.secondsToDuration(estimation.timings.tier);
        components.search(blueprint, 'goalTime').value
            = estimation.timings.goal > 0 ? util.secondsToDuration(estimation.timings.goal) : '0s';
        components.search(blueprint, 'dropValue').hidden
            = estimation.values.drop === 0;
        components.search(blueprint, 'dropValue').value
            = util.formatNumber(estimation.values.drop);
        components.search(blueprint, 'ingredientValue').hidden
            = estimation.values.ingredient === 0;
        components.search(blueprint, 'ingredientValue').value
            = util.formatNumber(estimation.values.ingredient);
        components.search(blueprint, 'equipmentValue').hidden
            = estimation.values.equipment === 0;
        components.search(blueprint, 'equipmentValue').value
            = util.formatNumber(estimation.values.equipment);
        components.search(blueprint, 'netValue').hidden
            = estimation.values.net === 0;
        components.search(blueprint, 'netValue').value
            = util.formatNumber(estimation.values.net);
        components.search(blueprint, 'tabTime').hidden
            = (estimation.timings.inventory.length + estimation.timings.equipment.length) === 0;
    }

    function preRenderItems(estimation, blueprint) {
        const dropRows = components.search(blueprint, 'dropRows');
        const ingredientRows = components.search(blueprint, 'ingredientRows');
        const timeRows = components.search(blueprint, 'timeRows');
        dropRows.rows = [];
        ingredientRows.rows = [];
        timeRows.rows = [];
        if(estimation.timings.maxAmount.value) {
            timeRows.rows.push({
                type: 'item',
                image: 'https://img.icons8.com/?size=48&id=1HQMXezy5LeT&format=png',
                imageFilter: 'invert(100%)',
                name: `Max amount [${util.formatNumber(estimation.timings.maxAmount.value)}]`,
                value: util.secondsToDuration(estimation.timings.maxAmount.secondsLeft)
            });
        }
        for(const id in estimation.drops) {
            const item = itemCache.byId[id];
            dropRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                value: util.formatNumber(estimation.drops[id]) + ' / hour'
            });
        }
        for(const id in estimation.ingredients) {
            const item = itemCache.byId[id];
            const timing = estimation.timings.inventory[id];
            ingredientRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                value: util.formatNumber(estimation.ingredients[id]) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: `${item.name} [${util.formatNumber(timing.stored)}]`,
                value: util.secondsToDuration(timing.secondsLeft)
            });
        }
        for(const id in estimation.equipments) {
            const item = itemCache.byId[id];
            const timing = estimation.timings.equipment[id];
            ingredientRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: item.name,
                value: util.formatNumber(estimation.equipments[id]) + ' / hour'
            });
            timeRows.rows.push({
                type: 'item',
                image: `/assets/${item.image}`,
                imagePixelated: true,
                name: `${item.name} [${util.formatNumber(timing.stored)}]`,
                value: util.secondsToDuration(timing.secondsLeft)
            });
        }
    }

    const componentBlueprint = {
        componentId: 'estimatorComponent',
        dependsOn: 'skill-page',
        parent: 'actions-component',
        selectedTabIndex: 0,
        tabs: [{
            title: 'Overview',
            rows: [{
                type: 'item',
                id: 'actions',
                name: 'Actions/hour',
                image: 'https://cdn-icons-png.flaticon.com/512/3563/3563395.png',
                value: ''
            },{
                type: 'item',
                id: 'exp',
                name: 'Exp/hour',
                image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
                value: ''
            },{
                type: 'item',
                id: 'survivalChance',
                name: 'Survival chance',
                image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
                value: ''
            },{
                type: 'item',
                id: 'finishedTime',
                name: 'Finished',
                image: 'https://cdn-icons-png.flaticon.com/512/1505/1505471.png',
                value: ''
            },{
                type: 'item',
                id: 'levelTime',
                name: 'Level up',
                image: 'https://cdn-icons-png.flaticon.com/512/4614/4614145.png',
                value: ''
            },{
                type: 'item',
                id: 'tierTime',
                name: 'Tier up',
                image: 'https://cdn-icons-png.flaticon.com/512/4789/4789514.png',
                value: ''
            },{
                type: 'itemWithInput',
                id: 'goalTime',
                name: 'Goal level',
                image: 'https://cdn-icons-png.flaticon.com/512/14751/14751729.png',
                value: '',
                inputValue: '100',
                inputType: 'number',
                inputMaxWidth: '60px',
                delay: 1000,
                action: () => update()
            },{
                type: 'item',
                id: 'dropValue',
                name: 'Gold/hour (loot)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028024.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'ingredientValue',
                name: 'Gold/hour (materials)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'equipmentValue',
                name: 'Gold/hour (equipments)',
                image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            },{
                type: 'item',
                id: 'netValue',
                name: 'Gold/hour (total)',
                image: 'https://cdn-icons-png.flaticon.com/512/11937/11937869.png',
                imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                value: ''
            }]
        },{
            title: 'Items',
            rows: [{
                type: 'header',
                title: 'Produced'
            },{
                type: 'segment',
                id: 'dropRows',
                rows: []
            },{
                type: 'header',
                title: 'Consumed'
            },{
                type: 'segment',
                id: 'ingredientRows',
                rows: []
            }]
        },{
            title: 'Time',
            id: 'tabTime',
            rows: [{
                type: 'segment',
                id: 'timeRows',
                rows: []
            }]
        }]
    };

    initialise();

    return exports;

}
