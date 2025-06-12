(skillCache, actionCache, estimatorAction, statsStore) => {

    const exports = {
        get
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const speed = getSpeed(skill.technicalName, action);
        const actionCount = estimatorAction.LOOPS_PER_HOUR / speed;
        const actualActionCount = actionCount * (1 + statsStore.get('EFFICIENCY_CHANCE', skill.technicalName) / 100);
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP_CHANCE', skill.technicalName) / 100);
        const ingredientCount = actualActionCount * (1 - statsStore.get('PRESERVATION_CHANCE', skill.technicalName) / 100);
        const exp = actualActionCount * action.exp * (1 + statsStore.get('DOUBLE_EXP_CHANCE', skill.technicalName) / 100);
        const drops = estimatorAction.getDrops(skillId, actionId, false, dropCount, actionCount);
        const ingredients = estimatorAction.getIngredients(skillId, actionId, ingredientCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId, actionCount);

        return {
            type: 'ACTIVITY',
            skill: skillId,
            action: actionId,
            speed,
            actionsPerHour: dropCount,
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
