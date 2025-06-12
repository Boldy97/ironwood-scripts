(events, util, skillCache, itemCache, structuresCache, statNameCache, masteryCache, actionCache) => {

    const emitEvent = events.emit.bind(null, 'state-stats');

    const exports = {
        get,
        getLevel,
        getInventoryItem,
        getEquipmentItem,
        getManyEquipmentItems,
        getWeapon,
        getAttackStyle,
        getOpulenceMode,
        getNextMasteryMaterial,
        update
    };

    let exp = {};
    let inventory = {};
    let tomes = {};
    let equipment = {};
    let runes = {};
    let structures = {};
    let enchantments = {};
    let guildStructures = {};
    let marks = {};
    let traits = {};
    let various = {};
    let masteries = {};

    let stats;

    function initialise() {
        let _update = util.debounce(update, 200);
        events.register('state-exp', event => (exp = event, _update()));
        events.register('state-inventory', event => (inventory = event, _update()));
        events.register('state-equipment-tomes', event => (tomes = event, _update()));
        events.register('state-equipment-equipment', event => (equipment = event, _update()));
        events.register('state-equipment-runes', event => (runes = event, _update()));
        events.register('state-structures', event => (structures = event, _update()));
        events.register('state-enchantments', event => (enchantments = event, _update()));
        events.register('state-structures-guild', event => (guildStructures = event, _update()));
        events.register('state-marks', event => (marks = event, _update()));
        events.register('state-traits', event => (traits = event, _update()));
        events.register('state-various', event => (various = event, _update()));
        events.register('state-mastery', event => (masteries = event, _update()));
    }

    function get(stat, skill) {
        if(!stat) {
            return stats;
        }
        statNameCache.validate(stat);
        let value = 0;
        if(stats && stats.global[stat]) {
            value += stats.global[stat] || 0;
        }
        if(Number.isInteger(skill)) {
            skill = skillCache.byId[skill]?.technicalName;
        }
        if(stats && stats.bySkill[stat] && stats.bySkill[stat][skill]) {
            value += stats.bySkill[stat][skill];
        }
        return value;
    }

    function getLevel(skillId) {
        return exp[skillId] || {
            id: skillId,
            exp: 0,
            level: 1
        };
    }

    function getInventoryItem(itemId) {
        return inventory[itemId] || 0;
    }

    function getEquipmentItem(itemId) {
        return equipment[itemId] || tomes[itemId] || runes[itemId] || 0;
    }

    function getManyEquipmentItems(ids) {
        return ids.map(id => ({
            id,
            amount: getEquipmentItem(id)
        })).filter(a => a.amount);
    }

    function getWeapon() {
        return stats.weapon;
    }

    function getAttackStyle() {
        return stats.attackStyle || 'OneHanded';
    }

    function getOpulenceMode() {
        return stats.opulenceMode || 'Items';
    }

    function getNextMasteryMaterial(skillId, actionId) {
        const neededMaterials = masteryCache.byId[skillId].materials;
        const storedMaterials = masteries.materials[skillId];
        const tier = actionCache.byId[actionId].tier;
        const nextMaterial = neededMaterials
            .filter(a => a.tier <= tier)
            .filter(a => a.amount > (storedMaterials[a.item] || 0))
            .sort((a,b) => b.tier - a.tier);
        if(nextMaterial.length) {
            return nextMaterial[0].item;
        }
        return null;
    }

    function update(excludedItemIds) {
        reset();
        processExp();
        processTomes();
        processEquipment(excludedItemIds);
        processRunes();
        processStructures();
        processEnhancements();
        processGuildStructures();
        processMarks();
        processBonusLevels();
        processTraits();
        processVarious();
        cleanup();
        if(!excludedItemIds) {
            emitEvent(stats);
        }
    }

    function reset() {
        stats = {
            weapon: null,
            attackStyle: null,
            bySkill: {},
            global: {}
        };
    }

    function processExp() {
        for(const id in exp) {
            const skill = skillCache.byId[id];
            addStats({
                bySkill: {
                    EFFICIENCY_CHANCE : {
                        [skill.technicalName]: 0.25
                    }
                }
            }, exp[id].level, 4);
        }
    }

    // first tomes, then equipments
    // because we need to know the potion effect multiplier first
    function processTomes() {
        for(const id in tomes) {
            const item = itemCache.byId[id];
            if(!item) {
                continue;
            }
            addStats(item.stats);
        }
    }

    function processEquipment(excludedItemIds) {
        const potionMultiplier = get('INCREASED_POTION_EFFECT');
        const sigilMultiplier = get('INCREASED_SIGIL_EFFECT');
        for(const id in equipment) {
            if(equipment[id] <= 0) {
                continue;
            }
            if(excludedItemIds && excludedItemIds.has(+id)) {
                continue;
            }
            const item = itemCache.byId[id];
            if(!item) {
                continue;
            }
            if(item.stats.global.ATTACK_SPEED) {
                stats.weapon = item;
                stats.attackStyle = item.skill;
            }
            let multiplier = 1;
            let accuracy = 2;
            if(potionMultiplier && itemCache.specialIds.potion.includes(item.id)) {
                multiplier = 1 + potionMultiplier / 100;
                accuracy = 10;
            }
            if(sigilMultiplier && itemCache.specialIds.sigil.includes(item.id)) {
                multiplier = 1 + sigilMultiplier / 100;
                accuracy = 10;
            }
            if(item.name.endsWith('Rune')) {
                multiplier = equipment[id];
                accuracy = 10;
            }
            addStats(item.stats, multiplier, accuracy);
        }
    }

    function processRunes() {
        for(const id in runes) {
            const item = itemCache.byId[id];
            if(!item) {
                continue;
            }
            addStats(item.stats, runes[id]);
        }
    }

    function processStructures() {
        for(const id in structures) {
            const structure = structuresCache.byId[id];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, structures[id] + 2/3);
        }
    }

    function processEnhancements() {
        for(const id in enchantments) {
            const structure = structuresCache.byId[id];
            if(!structure) {
                continue;
            }
            addStats(structure.enchant, enchantments[id]);
        }
    }

    function processGuildStructures() {
        for(const id in guildStructures) {
            const structure = structuresCache.byId[id];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, guildStructures[id]);
        }
    }

    function processMarks() {
        for(const id in marks.exp) {
            const skill = skillCache.byId[id];
            addStats({
                bySkill: {
                    DOUBLE_EXP_CHANCE: {
                        [skill.technicalName]: marks.exp[id]
                    }
                }
            });
        }
        for(const id in marks.eff) {
            const skill = skillCache.byId[id];
            addStats({
                bySkill: {
                    EFFICIENCY_CHANCE: {
                        [skill.technicalName]: marks.eff[id]
                    }
                }
            });
        }
    }

    function processTraits() {
        const traitEffectMultiplier = get('TRAIT_EFFECT_PERCENT');
        for(const stat in traits) {
            for(const id in traits[stat]) {
                const skill = skillCache.byId[id];
                const value = traits[stat][id] * (1 + traitEffectMultiplier / 100);
                addStats({
                    bySkill: {
                        [stat]: {
                            [skill.technicalName]: value
                        }
                    }
                }, 1, 100);
            }
        }
    }

    function processBonusLevels() {
        const potionMultiplier = get('INCREASED_POTION_EFFECT');
        if(stats.bySkill['BONUS_LEVEL']) {
            for(const skill in stats.bySkill['BONUS_LEVEL']) {
                let bonusLevels = stats.bySkill['BONUS_LEVEL'][skill];
                bonusLevels *+ 1 + potionMultiplier + 100;
                bonusLevels = Math.ceil(bonusLevels);
                addStats({
                    bySkill: {
                        EFFICIENCY_CHANCE: {
                            [skill]: 0.25
                        }
                    }
                }, bonusLevels, 4);
            }
        }
    }

    function processVarious() {
        if(various.maxAmount) {
            const stats = {
                bySkill: {
                    MAX_AMOUNT: {}
                }
            };
            for(const skillId in various.maxAmount) {
                const skill = skillCache.byId[skillId];
                if(various.maxAmount[skillId]) {
                    stats.bySkill.MAX_AMOUNT[skill.technicalName] = various.maxAmount[skillId];
                }
            }
            addStats(stats);
        }
        if(various.opulenceMode) {
            stats.opulenceMode = various.opulenceMode;
        }
    }

    function cleanup() {
        // base
        addStats({
            global: {
                HEALTH: 10
            }
        });
        // fallback
        if(!stats.weapon) {
            stats.weapon = null;
            stats.attackStyle = '';
            stats.global.ATTACK_SPEED = 6;
        }
        // health percent
        const healthPercent = get('HEALTH_PERCENT');
        if(healthPercent) {
            const health = get('HEALTH');
            addStats({
                global: {
                    HEALTH : Math.floor(healthPercent * health / 100)
                }
            })
        }
    }

    function addStats(newStats, multiplier = 1, accuracy = 1) {
        if(newStats.global) {
            for(const stat in newStats.global) {
                if(!stats.global[stat]) {
                    stats.global[stat] = 0;
                }
                stats.global[stat] += Math.round(accuracy * multiplier * newStats.global[stat]) / accuracy;
            }
        }
        if(newStats.bySkill) {
            for(const stat in newStats.bySkill) {
                if(!stats.bySkill[stat]) {
                    stats.bySkill[stat] = {};
                }
                for(const skill in newStats.bySkill[stat]) {
                    if(!stats.bySkill[stat][skill]) {
                        stats.bySkill[stat][skill] = 0;
                    }
                    stats.bySkill[stat][skill] += Math.round(accuracy * multiplier * newStats.bySkill[stat][skill]) / accuracy;
                }
            }
        }
    }

    initialise();

    return exports;

}
