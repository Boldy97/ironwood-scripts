(configuration, events, skillCache, actionCache, itemCache, estimatorActivity, estimatorCombat, estimatorOutskirts, components, util, statsStore) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Other',
            key: 'estimations',
            name: 'Estimations',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('state-stats', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update() {
        if(!enabled) {
            return;
        }
        const page = events.getLast('page');
        const stats = events.getLast('state-stats');
        if(!page || !stats || page.type !== 'action') {
            return;
        }
        const skill = skillCache.byId[page.skill];
        const action = actionCache.byId[page.action];
        let estimation;
        if(action.type === 'OUTSKIRTS') {
            estimation = estimatorOutskirts.get(page.skill, page.action);
        } else if(skill.type === 'Gathering' || skill.type === 'Crafting') {
            estimation = estimatorActivity.get(page.skill, page.action);
        } else if(skill.type === 'Combat') {
            estimation = estimatorCombat.get(page.skill, page.action);
        }
        if(estimation) {
            enrichTimings(estimation);
            enrichValues(estimation);
            render(estimation);
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
        estimation.timings = {
            inventory,
            equipment,
            maxAmount,
            finished: Math.min(maxAmount.secondsLeft, ...Object.values(inventory).concat(Object.values(equipment)).map(a => a.secondsLeft)),
            level: levelState.level === 100 ? 0 : util.expToNextLevel(levelState.exp) * 3600 / estimation.exp,
            tier: levelState.level === 100 ? 0 : util.expToNextTier(levelState.exp) * 3600 / estimation.exp,
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

    function render(estimation) {
        components.search(componentBlueprint, 'speed').value
            = util.formatNumber(estimation.speed/10) + ' s';
        components.search(componentBlueprint, 'exp').hidden
            = estimation.exp === 0;
        components.search(componentBlueprint, 'exp').value
            = util.formatNumber(estimation.exp);
        components.search(componentBlueprint, 'survivalChance').hidden
            = estimation.type === 'ACTIVITY';
        components.search(componentBlueprint, 'survivalChance').value
            = util.formatNumber(estimation.survivalChance * 100) + ' %';
        components.search(componentBlueprint, 'finishedTime').value
            = util.secondsToDuration(estimation.timings.finished);
        components.search(componentBlueprint, 'levelTime').hidden
            = estimation.exp === 0 || estimation.timings.level === 0;
        components.search(componentBlueprint, 'levelTime').value
            = util.secondsToDuration(estimation.timings.level);
        components.search(componentBlueprint, 'tierTime').hidden
            = estimation.exp === 0 || estimation.timings.tier === 0;
        components.search(componentBlueprint, 'tierTime').value
            = util.secondsToDuration(estimation.timings.tier);
        components.search(componentBlueprint, 'dropValue').hidden
            = estimation.values.drop === 0;
        components.search(componentBlueprint, 'dropValue').value
            = util.formatNumber(estimation.values.drop);
        components.search(componentBlueprint, 'ingredientValue').hidden
            = estimation.values.ingredient === 0;
        components.search(componentBlueprint, 'ingredientValue').value
            = util.formatNumber(estimation.values.ingredient);
        components.search(componentBlueprint, 'equipmentValue').hidden
            = estimation.values.equipment === 0;
        components.search(componentBlueprint, 'equipmentValue').value
            = util.formatNumber(estimation.values.equipment);
        components.search(componentBlueprint, 'netValue').hidden
            = estimation.values.net === 0;
        components.search(componentBlueprint, 'netValue').value
            = util.formatNumber(estimation.values.net);
        components.search(componentBlueprint, 'tabTime').hidden
            = (estimation.timings.inventory.length + estimation.timings.equipment.length) === 0;

        const dropRows = components.search(componentBlueprint, 'dropRows');
        const ingredientRows = components.search(componentBlueprint, 'ingredientRows');
        const timeRows = components.search(componentBlueprint, 'timeRows');
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

        components.addComponent(componentBlueprint);
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
                id: 'speed',
                name: 'Time per action',
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

}
