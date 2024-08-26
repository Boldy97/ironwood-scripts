() => {

    const exports = {
        validate
    };

    const statNames = new Set([
        // ITEM_STAT_ATTRIBUTE
        'BONUS_LEVEL',
        'COMBAT_EXP',
        'DOUBLE_EXP',
        'DOUBLE_DROP',
        'EFFICIENCY',
        'PRESERVATION',
        'SKILL_SPEED',
        // ITEM_ATTRIBUTE
        'ATTACK_SPEED',
        'ARMOUR',
        'BLEED_CHANCE',
        'BLOCK_CHANCE',
        'CARVE_CHANCE',
        'COIN_SNATCH',
        'CRIT_CHANCE',
        'DAMAGE',
        'DAMAGE_PERCENT',
        'DAMAGE_RANGE',
        'DECREASED_POTION_DURATION',
        'DUNGEON_DAMAGE',
        'FOOD_EFFECT',
        'HEAL',
        'HEALTH',
        'HEALTH_PERCENT',
        'INCREASED_POTION_EFFECT',
        'MAP_FIND_CHANCE',
        'PARRY_CHANCE',
        'PASSIVE_FOOD_CONSUMPTION',
        'STUN_CHANCE',
        'DUNGEON_TIME',
        'OPULENT_CHANCE',
        'TIER_VARIETY_CHANCE',
        // FRONTEND ONLY
        'AMMO_PRESERVATION_CHANCE',
        'MAX_AMOUNT'
    ]);

    function validate(name) {
        if(!statNames.has(name)) {
            throw `Unsupported stat usage : ${name}`;
        }
    }

    return exports;

}