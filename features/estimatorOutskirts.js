(actionCache, itemCache, statsStore, estimatorActivity, estimatorCombat) => {

    const exports = {
        get
    };

    function get(skillId, actionId) {
        try {
            const action = actionCache.byId[actionId];
            const excludedItemIds = itemCache.specialIds.food.concat(itemCache.specialIds.potionCombat);
            statsStore.update(new Set(excludedItemIds));

            const activityEstimation = estimatorActivity.get(skillId, actionId);
            const combatEstimation = estimatorCombat.get(skillId, actionId);
            const monsterChance = (1000 - action.outskirtsMonsterChance) / 1000;

            // Axioms:
            // combatRatio = 1 - activityRatio
            // activityLoops = totalLoops * activityRatio
            // combatLoops = totalLoops * combatRatio
            // fights = combatLoops / combatSpeed
            // actions = activityLoops / activitySpeed
            // encounterChance = fights / (fights + actions)
            const combatRatio = combatEstimation.speed / (activityEstimation.speed * (1 / monsterChance + combatEstimation.speed / activityEstimation.speed - 1));
            const activityRatio = 1 - combatRatio;

            const survivalChance = estimatorCombat.getSurvivalChance(combatEstimation.player, combatEstimation.monster, combatEstimation.speed, 1);

            const exp = activityEstimation.exp * activityRatio;
            const drops = {};
            merge(drops, activityEstimation.drops, activityRatio);
            merge(drops, combatEstimation.drops, combatRatio);
            const ingredients = {};
            merge(ingredients, activityEstimation.ingredients, activityRatio);
            merge(ingredients, combatEstimation.ingredients, combatRatio);
            const equipments = {};
            merge(equipments, activityEstimation.equipments, activityRatio);
            merge(equipments, combatEstimation.equipments, combatRatio);

            return {
                type: 'OUTSKIRTS',
                skill: skillId,
                speed: activityEstimation.speed,
                productionSpeed: activityEstimation.productionSpeed,
                exp,
                drops,
                ingredients,
                equipments,
                player: combatEstimation.player,
                monster: combatEstimation.monster,
                survivalChance
            };
        } finally {
            statsStore.update(new Set());
        }
    }

    function merge(target, source, ratio) {
        for(const key in source) {
            target[key] = (target[key] || 0) + source[key] * ratio;
        }
    }

    return exports;



}
