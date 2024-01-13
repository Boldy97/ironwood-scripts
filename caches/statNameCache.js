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
        'LOWER_TIER_CHANCE',
        'MERCHANT_SELL_CHANCE',
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
        'FOOD_PRESERVATION_CHANCE',
        'HEAL',
        'HEALTH',
        'HEALTH_PERCENT',
        'INCREASED_POTION_EFFECT',
        'MAP_FIND_CHANCE',
        'PARRY_CHANCE',
        'PASSIVE_FOOD_CONSUMPTION',
        'REVIVE_TIME',
        'STUN_CHANCE'
    ]);

    function validate(name) {
        if(!statNames.has(name)) {
            throw `Unsupported stat usage : ${name}`;
        }
    }

    return exports;

}