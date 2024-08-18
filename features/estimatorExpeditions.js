(events, estimator, components, petUtil, util, skillCache, itemCache, petCache, colorMapper, petHighlighter, configuration, expeditionDropCache) => {

    const emitEvent = events.emit.bind(null, 'estimator-expedition');
    let enabled = false;

    const exports = {
        get
    };

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-estimations',
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
        if(page?.type === 'taming' && page.menu === 'expeditions' && page.tier) {
            const estimation = get(page.tier);
            if(!estimation) {
                components.removeComponent(componentBlueprint);
                return;
            }
            estimation.isCurrent = !!$('.heading .name:contains("Loot")').length;
            estimator.enrichTimings(estimation);
            estimator.enrichValues(estimation);
            preRender(estimation, componentBlueprint);
            estimator.preRenderItems(estimation, componentBlueprint);
            components.addComponent(componentBlueprint);
            emitEvent(estimation);
            return;
        }
        components.removeComponent(componentBlueprint);
    }

    function get(tier) {
        const petState = events.getLast('state-pet');
        if(!petState) {
            return;
        }
        const teamStats = petState
            .filter(pet => pet.partOfTeam)
            .map(petUtil.petToStats);
        const totalStats = util.sumObjects(teamStats);
        const expedition = petUtil.getExpeditionStats(tier);
        const successChance = getSuccessChance(totalStats, expedition);

        const ingredients = {
            [itemCache.byName['Pet Snacks'].id]: Math.floor(expedition.food / 4 * (1 + totalStats.hunger / 100)) * 4
        };

        const drops = {};
        const expeditionDrops = expeditionDropCache.byExpedition[expedition.id];
        for(const drop of expeditionDrops) {
            if(totalStats[drop.type]) {
                drops[drop.item] = drop.amount * totalStats[drop.type];
            }
        }

        return {
            tier,
            successChance,
            ingredients,
            drops,
            teamStats,
            totalStats,
            exp: expedition.exp,
            skill: skillCache.byName['Taming'].id,
            equipments: {}
        };
    }

    function getSuccessChance(stats, expedition) {
        let teamValue = stats.health + stats.attack + stats.defense;
        const expeditionValue = expedition.stats.health + expedition.stats.attack + expedition.stats.defense;
        const rotationDefense = stats[expedition.rotation + 'Defense'];
        teamValue *= 1 + (rotationDefense) / 100;
        const successChance = 100 * teamValue / expeditionValue;
        if(successChance < 1) {
          return 0;
        }
        return util.clamp(successChance, 0, 100);
    }

    function preRender(estimation, blueprint) {
        components.search(blueprint, 'successChance').value
            = util.formatNumber(estimation.successChance);
        components.search(blueprint, 'exp').value
            = util.formatNumber(estimation.exp);
        components.search(blueprint, 'expActual').value
            = util.formatNumber(estimation.exp * estimation.successChance / 100);
        components.search(blueprint, 'finishedTime').value
            = util.secondsToDuration(estimation.timings.finished);
        components.search(blueprint, 'levelTime').value
            = util.secondsToDuration(estimation.timings.level);
        components.search(blueprint, 'tierTime').value
            = util.secondsToDuration(estimation.timings.tier);
        components.search(blueprint, 'profitDropValue').value
            = util.formatNumber(estimation.values.drop);
        components.search(blueprint, 'profitIngredientValue').value
            = util.formatNumber(estimation.values.ingredient);
        components.search(blueprint, 'profitNetValue').value
            = util.formatNumber(estimation.values.net);
        components.search(blueprint, 'teamSize').value
            = util.formatNumber(estimation.teamStats.length);
        for(const stat of petUtil.STATS_BASE) {
            components.search(blueprint, `teamStat-${stat}`).value
                = util.formatNumber(estimation.totalStats[stat]);
        }
        for(const stat of petUtil.STATS_SPECIAL) {
            components.search(blueprint, `teamStat-${stat}`).value
                = util.formatNumber(estimation.totalStats[stat]) + ' %';
        }
    }

    function calculateOptimizedTeam() {
        const petsAndStats = events.getLast('state-pet')
            .filter(pet => pet.parsed)
            .map(pet => ({
                pet,
                stats: petUtil.petToStats(pet)
            }));
        // make all combinations of 3 pets of different species (same family is allowed)
        const combinations = util.generateCombinations(petsAndStats, 3, object => object.pet.species);
        if(!combinations.length) {
            return;
        }
        if (window['log-debug-messages']) console.debug(`Calculating ${combinations.length} team combinations`);
        const tier = events.getLast('page').tier;
        const expedition = petUtil.getExpeditionStats(tier);
        let bestSuccessChance = 0;
        let bestCombination = null;
        for(const combination of combinations) {
            const teamStats = combination.map(a => a.stats);
            const totalStats = util.sumObjects(teamStats);
            const successChance = getSuccessChance(totalStats, expedition);
            if(successChance > bestSuccessChance) {
                bestSuccessChance = successChance;
                bestCombination = combination;
            }
        }

        const teamRows = components.search(componentBlueprint, 'optimalTeamRows');
        teamRows.rows = [{
            type: 'header',
            title: `Expedition T${tier} : ${expedition.name} (${combinations.length} combinations)`,
            name: 'Highlight',
            action: () => {
                const color = colorMapper('success');
                petHighlighter.highlight(color, bestCombination.map(a => a.pet.name));
                $('taming-page .header:contains("Menu") ~ button:contains("Pets")').click()
            }
        }, {
            type: 'item',
            name: `Success chance : ${util.formatNumber(bestSuccessChance)} %`,
            image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png'
        }];
        for(const object of bestCombination) {
            teamRows.rows.push({
                type: 'item',
                name: object.pet.name,
                image: `/assets/${petCache.byId[object.pet.species].image}`,
                imagePixelated: true,
            });
        }
        components.addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId: 'tamingEstimatorComponent',
        dependsOn: 'taming-page',
        parent: 'taming-page > .groups > .group:last-child',
        selectedTabIndex: 0,
        tabs: [{
            title: 'Overview',
            rows: [{
                type: 'item',
                id: 'successChance',
                name: 'Success chance',
                image: 'https://cdn-icons-png.flaticon.com/512/3004/3004458.png',
                value: ''
            },{
                type: 'item',
                id: 'exp',
                name: 'Exp/hour',
                image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
                value: ''
            },{
                type: 'item',
                id: 'expActual',
                name: 'Exp/hour (weighted)',
                image: 'https://cdn-icons-png.flaticon.com/512/616/616490.png',
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
            title: 'Profit',
            rows: [{
                type: 'header',
                title: 'Produced'
            },{
                type: 'segment',
                id: 'profitProducedRows',
                rows: []
            },{
                type: 'header',
                title: 'Consumed'
            },{
                type: 'segment',
                id: 'profitConsumedRows',
                rows: []
            },{
                type: 'header',
                title: 'Profits'
            },{
                type: 'segment',
                rows: [{
                    type: 'item',
                    id: 'profitDropValue',
                    name: 'Gold/hour (produced)',
                    image: 'https://cdn-icons-png.flaticon.com/512/9028/9028024.png',
                    imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                    value: ''
                },{
                    type: 'item',
                    id: 'profitIngredientValue',
                    name: 'Gold/hour (materials)',
                    image: 'https://cdn-icons-png.flaticon.com/512/9028/9028031.png',
                    imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                    value: ''
                },{
                    type: 'item',
                    id: 'profitNetValue',
                    name: 'Gold/hour (total)',
                    image: 'https://cdn-icons-png.flaticon.com/512/11937/11937869.png',
                    imageFilter: 'invert(100%) sepia(47%) saturate(3361%) hue-rotate(313deg) brightness(106%) contrast(108%)',
                    value: ''
                }]
            }]
        },{
            title: 'Time',
            rows: [{
                type: 'segment',
                id: 'timeRows',
                rows: []
            }]
        },{
            title: 'Team',
            rows: [{
                type: 'header',
                title: 'Calculate optimal team',
                name: 'Run',
                action: calculateOptimizedTeam
            },{
                type: 'segment',
                id: 'optimalTeamRows',
                rows: []
            },{
                type: 'header',
                title: 'Stats'
            },{
                type: 'item',
                id: 'teamSize',
                name: 'Size',
                image: 'https://img.icons8.com/?size=48&id=8183',
                value: ''
            },{
                type: 'item',
                id: 'teamStat-health',
                name: 'Health',
                image: petUtil.IMAGES.health,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-attack',
                name: 'Attack',
                image: petUtil.IMAGES.attack,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-defense',
                name: 'Defense',
                image: petUtil.IMAGES.defense,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-itemFind',
                name: 'Regular Loot',
                image: petUtil.IMAGES.itemFind,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-eggFind',
                name: 'Egg Loot',
                image: petUtil.IMAGES.eggFind,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-hunger',
                name: 'Hunger',
                image: petUtil.IMAGES.hunger,
                value: ''
            },{
                type: 'header',
                title: 'Traits'
            },{
                type: 'item',
                id: 'teamStat-meleeAttack',
                name: 'Melee Attack',
                image: petUtil.IMAGES.melee,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-meleeDefense',
                name: 'Melee Defense',
                image: petUtil.IMAGES.melee,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-rangedAttack',
                name: 'Ranged Attack',
                image: petUtil.IMAGES.ranged,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-rangedDefense',
                name: 'Ranged Defense',
                image: petUtil.IMAGES.ranged,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-magicAttack',
                name: 'Magic Attack',
                image: petUtil.IMAGES.magic,
                value: ''
            },{
                type: 'item',
                id: 'teamStat-magicDefense',
                name: 'Magic Defense',
                image: petUtil.IMAGES.magic,
                value: ''
            }]
        }]
    };

    initialise();

    return exports;

}
