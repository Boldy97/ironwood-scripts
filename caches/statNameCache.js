(request) => {

    const exports = {
        list: [],
        byName: {},
        validate
    };

    async function initialise() {
        const stats = await request.listItemStats();
        // frontend only
        stats.push('MAX_AMOUNT');
        stats.push('MASTERY_PET_PASSIVE');
        stats.push('MASTERY_DUNGEON_RUNE');
        stats.push('MASTERY_AUTOMATION'); // currently not used
        stats.push('MASTERY_BOUNTIFUL_HARVEST');
        stats.push('MASTERY_OPULENT_CRAFTING');
        stats.push('MASTERY_SAVAGE_LOOTING');
        stats.push('MASTERY_INSATIABLE_POWER');
        stats.push('MASTERY_POTENT_CONCOCTION');
        stats.push('MASTERY_RUNIC_WISDOM');
        for(const stat of stats) {
            exports.list.push(stat);
            exports.byName[stat] = stat;
        }
        return exports;
    }

    function validate(name) {
        if(!exports.byName[name]) {
            throw `Unsupported stat usage : ${name}`;
        }
    }

    return initialise();

}