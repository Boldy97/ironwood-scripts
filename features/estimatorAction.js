(dropCache, actionCache, ingredientCache, skillCache, itemCache, statsStore) => {

    const SECONDS_PER_HOUR = 60 * 60;
    const LOOPS_PER_HOUR = 10 * SECONDS_PER_HOUR; // 1 second = 10 loops
    const LOOPS_PER_FOOD = 150;

    const exports = {
        LOOPS_PER_HOUR,
        LOOPS_PER_FOOD,
        getDrops,
        getIngredients,
        getEquipmentUses
    };

    function getDrops(skillId, actionId, isCombat, multiplier = 1) {
        const drops = structuredClone(dropCache.byAction[actionId]);
        if(!drops) {
            return [];
        }
        const hasFailDrops = !!drops.find(a => a.type === 'FAILED');
        const hasMonsterDrops = !!drops.find(a => a.type === 'MONSTER');
        const successChance = hasFailDrops ? getSuccessChance(skillId, actionId) / 100 : 1;
        multiplier *= 1 + statsStore.get('MULTICRAFT_CHANCE') / 100;
        if(shouldApplyOpulence(skillId)) {
            const mostCommonDrop = dropCache.getMostCommonDrop(actionId);
            if(isOpulenceItemsMode()) {
                const match = drops.find(a => a.item === mostCommonDrop);
                match.chance += statsStore.get('OPULENT_CHANCE') / 100;
            } else {
                const value = itemCache.byId[mostCommonDrop].attributes.MIN_MARKET_PRICE;
                drops.push({
                    type: 'REGULAR',
                    item: itemCache.specialIds.coins,
                    amount: 1,
                    chance: value * statsStore.get('OPULENT_CHANCE') / 100
                });
            }
        }
        if(shouldApplyTierVariety(skillId)) {
            for(const drop of drops.slice(0)) {
                const mapping = dropCache.tierVarietyMappings[drop.item];
                if(!mapping) {
                    continue;
                }
                for(const other of mapping) {
                    drops.push({
                        type: 'REGULAR',
                        item: other,
                        amount: drop.amount,
                        chance: drop.chance * statsStore.get('TIER_VARIETY_CHANCE') / 100 / mapping.length
                    });
                }
                drop.chance *= 1 - statsStore.get('TIER_VARIETY_CHANCE') / 100;
            }
        }
        return drops.map(drop => {
            let amount = (1 + drop.amount) / 2 * multiplier * drop.chance;
            if(drop.type !== 'MONSTER' && isCombat && hasMonsterDrops) {
                amount = 0;
            } else if(drop.type === 'MONSTER' && !isCombat) {
                amount = 0;
            } else if(drop.type === 'FAILED') {
                amount *= 1 - successChance;
            } else {
                amount *= successChance;
            }
            if(amount) {
                return {
                    id: drop.item,
                    amount
                };
            }
        })
        .filter(a => a)
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getSuccessChance(skillId, actionId) {
        const action = actionCache.byId[actionId];
        const level = statsStore.getLevel(skillId).level;
        return Math.min(95, 80 + level - action.level) + Math.floor(level / 20);
    }

    function getIngredients(skillId, actionId, multiplier) {
        let ingredients = ingredientCache.byAction[actionId];
        if(!ingredients) {
            return [];
        }
        ingredients = [...ingredients];
        multiplier *= 1 + statsStore.get('MULTICRAFT_CHANCE') / 100;
        if(shouldApplyOpulence(skillId) && isOpulenceItemsMode()) {
            const mostCommonDrop = dropCache.getMostCommonDrop(actionId);
            const value = itemCache.byId[mostCommonDrop].attributes.MIN_MARKET_PRICE;
            ingredients.push({
                item: itemCache.specialIds.stardust,
                amount: value * statsStore.get('OPULENT_CHANCE') / 100 / 2
            });
        }
        return ingredients.map(ingredient => ({
            id: ingredient.item,
            amount: ingredient.amount * multiplier
        }))
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getEquipmentUses(skillId, actionId, actionCount = 0, isCombat = false, foodPerHour = 0) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const result = {};
        const potionMultiplier = 1 + statsStore.get('DECREASED_POTION_DURATION') / 100;
        // sigils
        statsStore.getManyEquipmentItems(itemCache.specialIds.sigil)
            .forEach(a => result[a.id] = 20);
        if(isCombat) {
            if(action.type !== 'OUTSKIRTS') {
                // combat potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.combatPotion)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
            if(action.type === 'DUNGEON') {
                // dungeon key
                let dungeonKeyCount = actionCount / 3;
                dungeonKeyCount /=  1 + statsStore.get('KEY_PRESERVATION_CHANCE') / 100;
                statsStore.getManyEquipmentItems(itemCache.specialIds.dungeonKey)
                    .forEach(a => result[a.id] = dungeonKeyCount);
            }
            if(foodPerHour && action.type !== 'OUTSKIRTS' && statsStore.get('HEAL')) {
                // active food
                statsStore.getManyEquipmentItems(itemCache.specialIds.food)
                    .forEach(a => result[a.id] = foodPerHour);
            }
        } else {
            if(skill.type === 'Gathering') {
                // gathering potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.gatheringPotion)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
            if(skill.type === 'Crafting') {
                // crafting potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.craftingPotion)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
        }
        if(statsStore.get('PASSIVE_FOOD_CONSUMPTION') && statsStore.get('HEAL')) {
            // passive food
            statsStore.getManyEquipmentItems(itemCache.specialIds.food)
                .forEach(a => result[a.id] = (result[a.id] || 0) + statsStore.get('PASSIVE_FOOD_CONSUMPTION') * 3600 / 5 / statsStore.get('HEAL'));
        }
        return result;
    }

    function shouldApplyOpulence(skillId) {
        if(skillCache.byId[skillId].type !== 'Crafting') {
            return false;
        }
        if(!statsStore.get('OPULENT_CHANCE')) {
            return false;
        }
        if(isOpulenceItemsMode()) {
            return statsStore.getInventoryItem(itemCache.specialIds.stardust);
        }
        return true;
    }

    function isOpulenceItemsMode() {
        return statsStore.getOpulenceMode() === 'Items';
    }

    function shouldApplyTierVariety(skillId) {
        return skillCache.byId[skillId].type === 'Gathering'
            && statsStore.get('TIER_VARIETY_CHANCE');
    }

    return exports;

}
