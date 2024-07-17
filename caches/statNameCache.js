() => {

    const exports = {
        validate
    };

    const statNames = new Set([
        // ITEM_STAT_ATTRIBUTE
        'AMMO_PRESERVATION_CHANCE',
        'ATTACK_SPEED',
        'BONUS_LEVEL',
        'COIN_SNATCH',
        'COMBAT_EXP',
        'DOUBLE_EXP',
        'DOUBLE_DROP',
        'EFFICIENCY',
        'EXTRA_HARVEST_CHANCE',
        'STARDUST_CRAFT_CHANCE',
        'PRESERVATION',
        'SKILL_SPEED',
        // ITEM_ATTRIBUTE
        'ARMOUR',
        'BLEED_CHANCE',
        'BLOCK_CHANCE',
        'CARVE_CHANCE',
        'COIN_SNATCH',
        'COMBAT_EXP',
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
        // FRONTEND ONLY
        'MAX_AMOUNT'
    ]);

    function validate(name) {
        if(!statNames.has(name)) {
            throw `Unsupported stat usage : ${name}`;
        }
    }

    return exports;

}