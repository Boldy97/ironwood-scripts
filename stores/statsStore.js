(events, util, skillCache, itemCache, structuresCache, statNameCache) => {

    const emitEvent = events.emit.bind(null, 'state-stats');

    const exports = {
        get,
        getLevel,
        getInventoryItem,
        getEquipmentItem,
        getManyEquipmentItems,
        getAttackStyle,
        update
    };

    let exp = {};
    let inventory = {};
    let tomes = {};
    let equipment = {};
    let runes = {};
    let structures = {};
    let enhancements = {};
    let guildStructures = {};
    let various = {};

    let stats;

    function initialise() {
        let _update = util.debounce(update, 200);
        events.register('state-exp', event => (exp = event, _update()));
        events.register('state-inventory', event => (inventory = event, _update()));
        events.register('state-equipment-tomes', event => (tomes = event, _update()));
        events.register('state-equipment-equipment', event => (equipment = event, _update()));
        events.register('state-equipment-runes', event => (runes = event, _update()));
        events.register('state-structures', event => (structures = event, _update()));
        events.register('state-enhancements', event => (enhancements = event, _update()));
        events.register('state-structures-guild', event => (guildStructures = event, _update()));
        events.register('state-various', event => (various = event, _update()));
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

    function getAttackStyle() {
        return stats.attackStyle;
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
        processVarious();
        cleanup();
        if(!excludedItemIds) {
            emitEvent(stats);
        }
    }

    function reset() {
        stats = {
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
                    EFFICIENCY : {
                        [skill.technicalName]: 0.25
                    }
                }
            }, exp[id].level, 4);
            if(skill.displayName === 'Ranged') {
                addStats({
                    global: {
                        AMMO_PRESERVATION_CHANCE : 0.5
                    }
                }, exp[id].level, 2);
            }
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
        let arrow;
        let bow;
        const potionMultiplier = get('INCREASED_POTION_EFFECT');
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
                stats.attackStyle = item.skill;
            }
            if(item.name.endsWith('Arrow')) {
                arrow = item;
                addStats({
                    global: {
                        AMMO_PRESERVATION_CHANCE : -0.5
                    }
                }, util.tierToLevel(item.tier), 2);
                continue;
            }
            if(item.name.endsWith('Bow')) {
                bow = item;
            }
            let multiplier = 1;
            let accuracy = 2;
            if(potionMultiplier && /(Potion|Mix)$/.exec(item.name)) {
                multiplier = 1 + potionMultiplier / 100;
                accuracy = 10;
            }
            if(item.name.endsWith('Rune')) {
                multiplier = equipment[id];
                accuracy = 10;
            }
            addStats(item.stats, multiplier, accuracy);
        }
        if(bow && arrow) {
            addStats(arrow.stats);
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
        for(const name in structures) {
            const structure = structuresCache.byName[name];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, structures[name] + 2/3);
        }
    }

    function processEnhancements() {
        for(const name in enhancements) {
            const structure = structuresCache.byName[name];
            if(!structure) {
                continue;
            }
            addStats(structure.enhance, enhancements[name]);
        }
    }

    function processGuildStructures() {
        for(const name in guildStructures) {
            const structure = structuresCache.byName[name];
            if(!structure) {
                continue;
            }
            addStats(structure.regular, guildStructures[name]);
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
    }

    function cleanup() {
        // base
        addStats({
            global: {
                HEALTH: 10,
                AMMO_PRESERVATION_CHANCE : 65
            }
        });
        // fallback
        if(!stats.attackStyle) {
            stats.attackStyle = 'OneHanded';
        }
        if(!stats.global.ATTACK_SPEED) {
            stats.global.ATTACK_SPEED = 3;
            stats.attackStyle = '';
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
        // damage percent
        const damagePercent = get('DAMAGE_PERCENT');
        if(damagePercent) {
            const damage = get('DAMAGE');
            addStats({
                global: {
                    DAMAGE : Math.floor(damagePercent * damage / 100)
                }
            })
        }
        // bonus level efficiency
        if(stats.bySkill['BONUS_LEVEL']) {
            for(const skill in stats.bySkill['BONUS_LEVEL']) {
                addStats({
                    bySkill: {
                        EFFICIENCY: {
                            [skill]: 0.25
                        }
                    }
                }, Math.round(stats.bySkill['BONUS_LEVEL'][skill]), 4);
            }
        }
        // clamping
        if(stats.global['AMMO_PRESERVATION_CHANCE'] < 65) {
            stats.global['AMMO_PRESERVATION_CHANCE'] = 65;
        }
        if(stats.global['AMMO_PRESERVATION_CHANCE'] > 80) {
            stats.global['AMMO_PRESERVATION_CHANCE'] = 80;
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
