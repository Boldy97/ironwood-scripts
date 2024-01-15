(skillCache, actionCache, estimatorAction, statsStore, itemCache, dropCache) => {

    const exports = {
        get
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const speed = getSpeed(skill.technicalName, action);
        const actionCount = estimatorAction.LOOPS_PER_HOUR / speed;
        const actualActionCount = actionCount * (1 + statsStore.get('EFFICIENCY', skill.technicalName) / 100);
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP', skill.technicalName) / 100);
        const ingredientCount = actualActionCount * (1 - statsStore.get('PRESERVATION', skill.technicalName) / 100);
        const exp = actualActionCount * action.exp * (1 + statsStore.get('DOUBLE_EXP', skill.technicalName) / 100);
        const drops = estimatorAction.getDrops(skillId, actionId, false, dropCount);
        const ingredients = estimatorAction.getIngredients(actionId, ingredientCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId);

        let statLowerTierChance;
        if(skill.type === 'Gathering' && (statLowerTierChance = statsStore.get('LOWER_TIER_CHANCE', skill.technicalName) / 100)) {
            for(const item in drops) {
                const mappings = dropCache.lowerGatherMappings[item];
                if(mappings) {
                    for(const other of mappings) {
                        drops[other] = (drops[other] || 0) + statLowerTierChance * drops[item] / mappings.length;
                    }
                    drops[item] *= 1 - statLowerTierChance;
                }
            }
        }

        let statMerchantSellChance;
        if(skill.type === 'Crafting' && (statMerchantSellChance = statsStore.get('MERCHANT_SELL_CHANCE', skill.technicalName) / 100)) {
            for(const item in drops) {
                drops[itemCache.specialIds.coins] = (drops[itemCache.specialIds.coins] || 0) + 2 * statMerchantSellChance * drops[item] * itemCache.byId[item].attributes.SELL_PRICE;
                drops[item] *= 1 - statMerchantSellChance;
            }
        }

        return {
            type: 'ACTIVITY',
            skill: skillId,
            speed,
            productionSpeed: speed * actionCount / dropCount,
            exp,
            drops,
            ingredients,
            equipments
        };
    }

    function getSpeed(skillName, action) {
        const speedBonus = statsStore.get('SKILL_SPEED', skillName);
        return Math.round(action.speed * 1000 / (100 + speedBonus)) + 1;
    }

    return exports;

}
