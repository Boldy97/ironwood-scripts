(events, util, skillCache, traitCache) => {

    const emitEvent = events.emit.bind(null, 'reader-traits');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'traits' && page.menu === 'traits') {
            readTraitsScreen();
        }
    }

    function readTraitsScreen() {
        const result = {};

        $('traits-page .header:contains("Equipped"), traits-page .header:contains("Traits")').parent().find('.row').each((i,element) => {
            element = $(element);
            const traitName = element.find('.name').text();
            const level = util.parseNumber(element.find('.level').text());
            const skillName = traitName.match(/^\S+/)[0];
            const effectName = traitName.substring(skillName.length + 1);
            const stat = traitEffectToStat(effectName);
            const skill = skillCache.byName[skillName];
            const trait = traitCache.byName[traitName];
            if(!result[stat]) {
                result[stat] = {};
            }
            result[stat][skill.id] = trait.amount * level + trait.base;
        });

        emitEvent({
            type: 'full',
            value: result
        });
    }

    function traitEffectToStat(effect) {
        switch(effect) {
            case 'XP': return 'DOUBLE_EXP_CHANCE';
            case 'Yield': return 'DOUBLE_DROP_CHANCE';
            case 'Efficiency': return 'EFFICIENCY_CHANCE';
            case 'Multi Craft': return 'MULTICRAFT_CHANCE';
            case 'Loot': return 'DOUBLE_DROP_CHANCE';
        }
    }

    initialise();

}
