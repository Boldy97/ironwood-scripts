(skillCache, actionCache, monsterCache, itemCache, dropCache, statsStore, Distribution, estimatorAction) => {

    const exports = {
        get,
        getDamageDistributions,
        getSurvivalChance
    };

    function get(skillId, actionId) {
        const skill = skillCache.byId[skillId];
        const action = actionCache.byId[actionId];
        const monsterIds = action.monster ? [action.monster] : action.monsterGroup;
        const playerStats = getPlayerStats();
        const sampleMonsterStats = getMonsterStats(monsterIds[Math.floor(monsterIds.length / 2)]);
        playerStats.damage_ = new Distribution();
        sampleMonsterStats.damage_ = new Distribution();
        for(const monsterId of monsterIds) {
            const monsterStats = getMonsterStats(monsterId);
            let damage_ = getInternalDamageDistribution(playerStats, monsterStats, monsterIds.length > 1);
            const weight = damage_.expectedRollsUntill(monsterStats.health);
            playerStats.damage_.addDistribution(damage_, weight);
            damage_ = getInternalDamageDistribution(monsterStats, playerStats, monsterIds.length > 1);
            sampleMonsterStats.damage_.addDistribution(damage_, weight);
        }
        playerStats.damage_.normalize();
        sampleMonsterStats.damage_.normalize();

        const loopsPerKill = playerStats.attackSpeed * playerStats.damage_.expectedRollsUntill(sampleMonsterStats.health) * 10 + 5;
        const actionCount = estimatorAction.LOOPS_PER_HOUR / loopsPerKill;
        const efficiency = 1 + statsStore.get('EFFICIENCY', skill.technicalName) / 100;
        const actualActionCount = actionCount * efficiency;
        const dropCount = actualActionCount * (1 + statsStore.get('DOUBLE_DROP', skill.technicalName) / 100);
        const attacksReceivedPerHour = estimatorAction.LOOPS_PER_HOUR / 10 / sampleMonsterStats.attackSpeed;
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT') / 100);
        const damagePerHour = attacksReceivedPerHour * sampleMonsterStats.damage_.average();
        const foodPerHour = damagePerHour / healPerFood * (1 - statsStore.get('FOOD_PRESERVATION_CHANCE') / 100);

        let exp = estimatorAction.LOOPS_PER_HOUR * action.exp / 1000;
        exp *= efficiency;
        exp *= 1 + statsStore.get('DOUBLE_EXP', skill.technicalName) / 100;
        exp *= 1 + statsStore.get('COMBAT_EXP', skill.technicalName) / 100;
        exp *= getExpTriangleModifier(playerStats, sampleMonsterStats);
        const drops = estimatorAction.getDrops(skillId, actionId, true, dropCount);
        const equipments = estimatorAction.getEquipmentUses(skillId, actionId, true, foodPerHour);
        const survivalChance = getSurvivalChance(playerStats, sampleMonsterStats, loopsPerKill);

        let statCoinSnatch;
        if(statCoinSnatch = statsStore.get('COIN_SNATCH')) {
            const attacksPerHour = estimatorAction.LOOPS_PER_HOUR / 10 / playerStats.attackSpeed;
            const coinsPerHour = (statCoinSnatch + 1) / 2 * attacksPerHour;
            drops[itemCache.specialIds.coins] = (drops[itemCache.specialIds.coins] || 0) + coinsPerHour;
        }

        let statCarveChance = 0.1;
        if(action.type !== 'OUTSKIRTS' && (statCarveChance = statsStore.get('CARVE_CHANCE') / 100)) {
            const boneDrop = dropCache.byAction[actionId].find(a => a.chance === 1);
            const boneDropCount = drops[boneDrop.item];
            const coinDrop = dropCache.byAction[actionId].find(a => a.item === itemCache.specialIds.coins);
            const averageAmount = (1 + coinDrop.amount) / 2;
            drops[itemCache.specialIds.coins] -= statCarveChance * coinDrop.chance * averageAmount / 2 * boneDropCount;
            const mappings = dropCache.boneCarveMappings[boneDrop.item];
            for(const other of mappings) {
                drops[other] = (drops[other] || 0) + statCarveChance * coinDrop.chance * boneDropCount / mappings.length;
            }
        }

        return {
            type: 'COMBAT',
            skill: skillId,
            speed: loopsPerKill,
            productionSpeed: loopsPerKill * actionCount / dropCount,
            exp,
            drops,
            ingredients: {},
            equipments,
            player: playerStats,
            monster: sampleMonsterStats,
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
            blockChance: statsStore.get('BLOCK_CHANCE')/100,
            critChance: statsStore.get('CRIT_CHANCE')/100,
            stunChance: statsStore.get('STUN_CHANCE')/100,
            parryChance: statsStore.get('PARRY_CHANCE')/100,
            bleedChance: statsStore.get('BLEED_CHANCE')/100,
            damageRange: (75 + statsStore.get('DAMAGE_RANGE'))/100,
            dungeonDamage: 1 + statsStore.get('DUNGEON_DAMAGE')/100,
            attackLevel,
            defenseLevel
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
            blockChance: 0,
            critChance: 0,
            stunChance: 0,
            parryChance: 0,
            bleedChance: 0,
            damageRange: 0.75,
            dungeonDamage: 1,
            attackLevel: monster.level,
            defenseLevel: monster.level
        };
    }

    function getInternalDamageDistribution(attacker, defender, isDungeon) {
        let damage = attacker.damage;
        damage *= getDamageTriangleModifier(attacker, defender);
        damage *= getDamageScalingRatio(attacker, defender);
        damage *= getDamageArmourRatio(attacker, defender);
        damage *= !isDungeon ? 1 : attacker.dungeonDamage;

        const maxDamage_ = new Distribution(damage);
        // crit
        if(attacker.critChance) {
            maxDamage_.convolution(
                Distribution.getRandomChance(attacker.critChance),
                (dmg, crit) => dmg * (crit ? 1.5 : 1)
            );
        }
        // damage range
        const result = maxDamage_.convolutionWithGenerator(
            dmg => Distribution.getRandomOutcomeRounded(dmg * attacker.damageRange, dmg),
            (dmg, randomDamage) => randomDamage
        );
        // block
        if(defender.blockChance) {
            result.convolution(
                Distribution.getRandomChance(defender.blockChance),
                (dmg, blocked) => blocked ? 0 : dmg
            );
        }
        // stun
        if(defender.stunChance) {
            let stunChance = defender.stunChance;
            // only when defender accurate
            stunChance *= getAccuracy(defender, attacker);
            // can also happen on defender parries
            stunChance *= 1 + defender.parryChance;
            // modifier based on speed
            stunChance *= attacker.attackSpeed / defender.attackSpeed;
            // convert to actual stunned percentage
            const stunnedPercentage = stunChance * 2.5 / attacker.attackSpeed;
            result.convolution(
                Distribution.getRandomChance(stunnedPercentage),
                (dmg, stunned) => stunned ? 0 : dmg
            );
        }
        // accuracy
        const accuracy = getAccuracy(attacker, defender);
        result.convolution(
            Distribution.getRandomChance(accuracy),
            (dmg, accurate) => accurate ? dmg : 0
        );
        // === special effects ===
        const intermediateClone_ = result.clone();
        // parry attacker - deal back 25% of a regular attack
        if(attacker.parryChance) {
            let parryChance = attacker.parryChance;
            if(attacker.attackSpeed < defender.attackSpeed) {
                parryChance *= attacker.attackSpeed / defender.attackSpeed;
            }
            const parried_ = intermediateClone_.clone();
            parried_.convolution(
                Distribution.getRandomChance(parryChance),
                (dmg, parried) => parried ? Math.round(dmg/4.0) : 0
            );
            result.convolution(
                parried_,
                (dmg, extra) => dmg + extra
            );
            if(attacker.attackSpeed > defender.attackSpeed) {
                // we can parry multiple times during one turn
                parryChance *= (attacker.attackSpeed - defender.attackSpeed) / attacker.attackSpeed;
                parried_.convolution(
                    Distribution.getRandomChance(parryChance),
                    (dmg, parried) => parried ? dmg : 0
                );
                result.convolution(
                    parried_,
                    (dmg, extra) => dmg + extra
                );
            }
        }
        // parry defender - deal 50% of a regular attack
        if(defender.parryChance) {
            result.convolution(
                Distribution.getRandomChance(defender.parryChance),
                (dmg, parried) => parried ? Math.round(dmg/2) : dmg
            );
        }
        // bleed - 50% of damage over 3 seconds (assuming to be within one attack round)
        if(attacker.bleedChance) {
            const bleed_ = intermediateClone_.clone();
            bleed_.convolution(
                Distribution.getRandomChance(attacker.bleedChance),
                (dmg, bleed) => bleed ? 5 * Math.round(dmg/10) : 0
            );
            result.convolution(
                bleed_,
                (dmg, extra) => dmg + extra
            );
        }
        return result;
    }

    function getDamageTriangleModifier(attacker, defender) {
        if(!attacker.attackStyle || !defender.attackStyle) {
            return 1.0;
        }
        if(attacker.attackStyle === defender.attackStyle) {
            return 1.0;
        }
        if(attacker.attackStyle === 'OneHanded' && defender.attackStyle === 'Ranged') {
            return 1.1;
        }
        if(attacker.attackStyle === 'Ranged' && defender.attackStyle === 'TwoHanded') {
            return 1.1;
        }
        if(attacker.attackStyle === 'TwoHanded' && defender.attackStyle === 'OneHanded') {
            return 1.1;
        }
        return 0.9;
    }

    function getExpTriangleModifier(attacker, defender) {
        if(!attacker.attackStyle || !defender.attackStyle) {
            return 1;
        }
        return getDamageTriangleModifier(attacker, defender) - 0.1;
    }

    function getDamageScalingRatio(attacker, defender) {
        const ratio = attacker.attackLevel / defender.defenseLevel;
        if(attacker.isPlayer) {
            return Math.min(1, ratio);
        }
        return Math.max(1, ratio);
    }

    function getDamageArmourRatio(attacker, defender) {
        if(!defender.armour) {
            return 1;
        }
        const scale = 25 + Math.min(70, (defender.armour - 25) * 50 / 105);
        return (100 - scale) / 100;
    }

    function getAccuracy(attacker, defender) {
        let accuracy = 75 + (attacker.attackLevel - defender.defenseLevel) / 2.0;
        accuracy = Math.max(60, accuracy);
        accuracy = Math.min(90, accuracy);
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
        const healPerFood = statsStore.get('HEAL') * (1 + statsStore.get('FOOD_EFFECT') / 100);
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
