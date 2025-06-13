(skillCache, actionCache, monsterCache, itemCache, dropCache, statsStore, Distribution, estimatorAction, util) => {

    const exports = {
        get,
        getDamageDistributions,
        getSurvivalChance
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const monsterId = action.monster ? action.monster : action.monsterGroup[0];
        const playerStats = getPlayerStats();
        const monsterStats = getMonsterStats(monsterId);
        playerStats.damage_ = getInternalDamageDistribution(playerStats, monsterStats);
        monsterStats.damage_ = getInternalDamageDistribution(monsterStats, playerStats);
        const loopsPerKill = playerStats.attackSpeed * playerStats.damage_.expectedRollsUntill(monsterStats.health) * 10 + 5;
        const actionCount = estimatorAction.LOOPS_PER_HOUR / loopsPerKill;
        const efficiency = 1 + statsStore.get('EFFICIENCY_CHANCE', skill.technicalName) / 100;
        const actualActionCount = actionCount * efficiency;
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP_CHANCE', skill.technicalName) / 100);
        const attacksReceivedPerHour = estimatorAction.LOOPS_PER_HOUR / 10 / monsterStats.attackSpeed;
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT_PERCENT') / 100);
        const damagePerHour = attacksReceivedPerHour * monsterStats.damage_.average();
        const foodPerHour = damagePerHour / healPerFood;

        let exp = estimatorAction.LOOPS_PER_HOUR * action.exp / 1000;
        exp *= efficiency;
        exp *= 1 + statsStore.get('DOUBLE_EXP_CHANCE', skill.technicalName) / 100;
        exp *= 1 + statsStore.get('COMBAT_EXP_PERCENT', skill.technicalName) / 100;
        exp *= getTriangleModifier(playerStats, monsterStats);
        // TODO there's also a 1.2 exp multiplier when fighting a monster that was replaced by a dungeon endboss
        const drops = estimatorAction.getDrops(skillId, actionId, true, dropCount, actualActionCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId, actualActionCount, true, foodPerHour);
        const survivalChance = getSurvivalChance(playerStats, monsterStats, loopsPerKill);

        let statCarveChance;
        if(action.type !== 'OUTSKIRTS' && (statCarveChance = statsStore.get('CARVE_CHANCE') / 100)) {
            const boneDrop = dropCache.byAction[actionId].find(a => a.chance === 1);
            const boneDropCount = drops[boneDrop.item];
            drops[boneDrop.item] -= statCarveChance * boneDropCount;
            const mappings = dropCache.boneCarveMappings[boneDrop.item];
            for(const otherBone of mappings) {
                drops[otherBone] = (drops[otherBone] || 0) + statCarveChance * boneDropCount;
            }
        }

        return {
            type: 'COMBAT',
            skill: skillId,
            action: actionId,
            speed: loopsPerKill,
            actionsPerHour: dropCount,
            productionSpeed: loopsPerKill * actionCount / dropCount,
            exp,
            drops,
            ingredients: {},
            equipments,
            player: playerStats,
            monster: monsterStats,
            survivalChance
        };
    }

    function getPlayerStats() {
        const attackStyle = statsStore.getAttackStyle();
        const attackSkill = skillCache.byTechnicalName[attackStyle];
        const attackLevel = statsStore.getLevel(attackSkill.id).level;
        const defenseLevel = statsStore.getLevel(8).level;
        return {
            isPlayer: true,
            attackStyle,
            attackSpeed: statsStore.get('ATTACK_SPEED'),
            damage: statsStore.get('DAMAGE'),
            armour: statsStore.get('ARMOUR'),
            health: statsStore.get('HEALTH'),
            attackLevel,
            defenseLevel,
            bonusAccuracy: 0, // TODO from relics
            bonusEvasion: 0, // TODO from relics
            // spam
            dungeonDamagePercent: statsStore.get('DUNGEON_DAMAGE_PERCENT'),
            dungeonBlockPercent: statsStore.get('DUNGEON_BLOCK_PERCENT'),
            forestDamagePercent: statsStore.get('FOREST_DAMAGE_PERCENT'),
            forestBlockPercent: statsStore.get('FOREST_BLOCK_PERCENT'),
            mountainDamagePercent: statsStore.get('MOUNTAIN_DAMAGE_PERCENT'),
            mountainBlockPercent: statsStore.get('MOUNTAIN_BLOCK_PERCENT'),
            oceanDamagePercent: statsStore.get('OCEAN_DAMAGE_PERCENT'),
            oceanBlockPercent: statsStore.get('OCEAN_BLOCK_PERCENT'),
        };
    }

    function getMonsterStats(monsterId) {
        const monster = monsterCache.byId[monsterId];
        return {
            isPlayer: false,
            attackStyle: monster.attackStyle,
            attackSpeed: monster.speed,
            damage: monster.attack,
            armour: monster.armour,
            health: monster.health,
            attackLevel: monster.level,
            defenseLevel: monster.level,
            // TODO
            bonusAccuracy: 0,
            bonusEvasion: 0,
            // spam
            dungeonDamagePercent: 0,
            dungeonBlockPercent: 0,
            forestDamagePercent: 0,
            forestBlockPercent: 0,
            mountainDamagePercent: 0,
            mountainBlockPercent: 0,
            oceanDamagePercent: 0,
            oceanBlockPercent: 0,
        };
    }

    function getInternalDamageDistribution(attacker, defender) {
        let damage = attacker.damage;
        damage *= getTriangleModifier(attacker, defender);
        damage *= 1 + getExtraTriangleModifier(attacker, defender, 'Damage') / 100;
        damage *= 1 - getExtraTriangleModifier(defender, attacker, 'Block') / 100; // this is kindof ugly... I blame miccy
        if(defender.armour > 0) {
            damage *= getDamageArmourRatio(attacker, defender);
        }

        const maxDamage_ = new Distribution(damage);
        // damage range
        const result = maxDamage_.convolutionWithGenerator(
            dmg => Distribution.getRandomOutcomeRounded(dmg * 0.75, dmg),
            (dmg, randomDamage) => randomDamage
        );
        // accuracy
        const accuracy = getAccuracy(attacker, defender);
        result.convolution(
            Distribution.getRandomChance(accuracy),
            (dmg, accurate) => accurate ? dmg : 0
        );
        // done
        return result;
    }

    function getTriangleModifier(attacker, defender) {
        if(!attacker.attackStyle || !defender.attackStyle) {
            return 1;
        }
        if(attacker.attackStyle === 'Ranged') {
            if(defender.attackStyle === 'TwoHanded') {
                return 1;
            }
            if(defender.attackStyle === 'OneHanded') {
                return 1 / 1.2;
            }
        } else if(attacker.attackStyle === 'OneHanded') {
            if(defender.attackStyle === 'Ranged') {
                return 1;
            }
            if(defender.attackStyle === 'TwoHanded') {
                return 1 / 1.2;
            }
        } else {
            if(defender.attackStyle === 'OneHanded') {
                return 1;
            }
            if(defender.attackStyle === 'Ranged') {
                return 1 / 1.2;
            }
        }
        return 1 / 1.1;
    }

    function getExtraTriangleModifier(attacker, defender, type, isDungeon) {
        if(!['Damage', 'Block'].includes(type)) {
            throw `Invalid triangle modifier type : ${type}`;
        }
        // for dungeons, use the (probably) most optimal value, the one your weapon gives
        if(isDungeon) {
            const dungeonEffect = attacker[`dungeon${type}Percent`];
            switch(attacker.attackStyle) {
                case 'Ranged': return dungeonEffect + attacker[`forest${type}Percent`];
                case 'OneHanded': return dungeonEffect + attacker[`mountain${type}Percent`];
                case 'TwoHanded': return dungeonEffect + attacker[`ocean${type}Percent`];
                default: return dungeonEffect;
            }
        }
        // otherwise, depends on the defender
        switch(defender.attackStyle) {
            case 'TwoHanded': return attacker[`forest${type}Percent`];
            case 'Ranged': return attacker[`mountain${type}Percent`];
            case 'OneHanded': return attacker[`ocean${type}Percent`];
            default: return 0;
        }
    }

    function getDamageArmourRatio(attacker, defender) {
        const modifier = Math.min(95, (defender.armour - 30) / 126 * 50 + 25);
        return 1 - modifier / 100;
    }

    function getAccuracy(attacker, defender) {
        let accuracy = 75 + (attacker.attackLevel - defender.defenseLevel + attacker.bonusAccuracy - defender.bonusEvasion) / 2.0;
        accuracy = util.clamp(accuracy, 60, 90);
        return accuracy / 100;
    }

    function getDamageDistributions(monsterId) {
        const playerStats = getPlayerStats();
        const monsterStats = getMonsterStats(monsterId);
        const playerDamage_ = getInternalDamageDistribution(playerStats, monsterStats);
        const monsterDamage_ = getInternalDamageDistribution(monsterStats, playerStats);
        playerDamage_.normalize();
        monsterDamage_.normalize();
        return [playerDamage_, monsterDamage_];
    }

    function getSurvivalChance(player, monster, loopsPerFight, fights = 10, applyCringeMultiplier = false) {
        const loopsPerAttack = monster.attackSpeed * 10;
        let attacksPerFight = loopsPerFight / loopsPerAttack;
        if(fights === 1 && applyCringeMultiplier) {
            const playerLoopsPerAttack = player.attackSpeed * 10;
            const playerAttacksPerFight = loopsPerFight / playerLoopsPerAttack;
            const cringeMultiplier = Math.min(1.4, Math.max(1, 1.4 - playerAttacksPerFight / 50));
            attacksPerFight *= cringeMultiplier;
        }
        const foodPerAttack = loopsPerAttack / estimatorAction.LOOPS_PER_FOOD;
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT_PERCENT') / 100);
        const healPerAttack = Math.round(healPerFood * foodPerAttack);
        const healPerFight = healPerAttack * attacksPerFight;
        let deathChance = 0;
        let scenarioChance = 1;
        let health = player.health;
        for(let i=0;i<fights;i++) {
            const currentDeathChance = monster.damage_.getRightTail(attacksPerFight, health + healPerFight);
            deathChance += currentDeathChance * scenarioChance;
            scenarioChance *= 1 - currentDeathChance;
            const damage = monster.damage_.getMeanRange(attacksPerFight, healPerFight, health + healPerFight);
            health -= damage - healPerFight;
            if(isNaN(health) || health === Infinity || health === -Infinity) {
                // TODO NaN / Infinity result from above?
                break;
            }
        }
        const cringeCutoff = 0.10;
        if(fights === 1 && !applyCringeMultiplier && deathChance < cringeCutoff) {
            const other = getSurvivalChance(player, monster, loopsPerFight, fights, true);
            const avg = (1 - deathChance + other) / 2;
            if(avg > 1 - cringeCutoff / 2) {
                return avg;
            }
        }
        return 1 - deathChance;
    }

    return exports;

}
