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
        multiplier *= 1 + statsStore.get('MULTICRAFT') / 100;
        if(shouldApplyOpulence(skillId)) {
            const mostCommonDrop = dropCache.getMostCommonDrop(actionId);
            const match = drops.find(a => a.item === mostCommonDrop);
            match.chance += statsStore.get('OPULENT_CHANCE') / 100;
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
        .map(a => {
            const mapFindChance = statsStore.get('MAP_FIND_CHANCE', skillId) / 100;
            if(!mapFindChance || !itemCache.specialIds.dungeonMap.includes(a.id)) {
                return a;
            }
            a.amount *= 1 + mapFindChance;
            return a;
        })
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getSuccessChance(skillId, actionId) {
        const action = actionCache.byId[actionId];
        const level = statsStore.getLevel(skillId).level;
        return Math.min(95, 80 + level - action.level) + Math.floor(level / 20);
    }

    function getIngredients(skillId, actionId, multiplier) {
        const ingredients = ingredientCache.byAction[actionId];
        if(!ingredients) {
            return [];
        }
        multiplier *= 1 + statsStore.get('MULTICRAFT') / 100;
        if(shouldApplyOpulence(skillId)) {
            const mostCommonDrop = dropCache.getMostCommonDrop(actionId);
            const value = itemCache.byId[mostCommonDrop].attributes.MIN_MARKET_PRICE;
            ingredients.push({
                item: itemCache.specialIds.stardust,
                amount: value * statsStore.get('OPULENT_CHANCE') / 100
            });
        }
        return ingredients.map(ingredient => ({
            id: ingredient.item,
            amount: ingredient.amount * multiplier
        }))
        .reduce((a,b) => (a[b.id] = b.amount, a), {});
    }

    function getEquipmentUses(skillId, actionId, isCombat = false, foodPerHour = 0) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const result = {};
        const potionMultiplier = 1 + statsStore.get('DECREASED_POTION_DURATION') / 100;
        if(isCombat) {
            if(action.type !== 'OUTSKIRTS') {
                // combat potions
                statsStore.getManyEquipmentItems(itemCache.specialIds.combatPotion)
                    .forEach(a => result[a.id] = 20 * potionMultiplier);
            }
            if(action.type === 'DUNGEON') {
                // dungeon map
                const lanternMultiplier = 1 + statsStore.get('DUNGEON_TIME') / 100;
                statsStore.getManyEquipmentItems(itemCache.specialIds.dungeonMap)
                    .forEach(a => result[a.id] = 3 / 24 / lanternMultiplier);
            }
            if(foodPerHour && action.type !== 'OUTSKIRTS' && statsStore.get('HEAL')) {
                // active food
                statsStore.getManyEquipmentItems(itemCache.specialIds.food)
                    .forEach(a => result[a.id] = foodPerHour);
            }
            if(statsStore.getWeapon()?.name?.endsWith('Bow')) {
                // ammo
                const attacksPerHour = SECONDS_PER_HOUR / statsStore.get('ATTACK_SPEED');
                const ammoPerHour = attacksPerHour * (1 - statsStore.get('AMMO_PRESERVATION_CHANCE') / 100);
                statsStore.getManyEquipmentItems(itemCache.specialIds.ammo)
                    .forEach(a => result[a.id] = ammoPerHour);
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
        return skillCache.byId[skillId].type === 'Crafting'
            && statsStore.get('OPULENT_CHANCE')
            && statsStore.getInventoryItem(itemCache.specialIds.stardust);
    }

    function shouldApplyTierVariety(skillId) {
        return skillCache.byId[skillId].type === 'Gathering'
            && statsStore.get('TIER_VARIETY_CHANCE');
    }

    return exports;

}
