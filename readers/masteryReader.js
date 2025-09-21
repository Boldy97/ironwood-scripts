(events, util, masteryCache, itemUtil) => {

    const emitEvent = events.emit.bind(null, 'reader-mastery');
    // TODO when relic reading/processing is added, also process "XXX Relic Tiers"
    const passiveMap = {
        'Pet Passive Effect': 'MASTERY_PET_PASSIVE',
        'Dungeon Rune Effect': 'MASTERY_DUNGEON_RUNE',
        'Automation Speed': 'MASTERY_AUTOMATION',
        'Bountiful Harvest Effect': 'MASTERY_BOUNTIFUL_HARVEST',
        'Opulent Crafting Effect': 'MASTERY_OPULENT_CRAFTING',
        'Savage Looting Effect': 'MASTERY_SAVAGE_LOOTING',
        'Insatiable Power Effect': 'MASTERY_INSATIABLE_POWER',
        'Potent Concoction Effect': 'MASTERY_POTENT_CONCOCTION',
        'Runic Wisdom Effect': 'MASTERY_RUNIC_WISDOM',
    };

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'mastery' && page.menu === 'skills') {
            readMasterySkills(page.skill);
        }
        if(page.type === 'mastery' && page.menu === 'passives') {
            readMasteryPassives();
        }
        if(page.type === 'action') {
            readActionScreen(page.skill);
        }
    }

    function readMasterySkills(skillId) {
        const materials = {};
        $('mastery-page .group:first-child button.row')
            .each((_,element) => {
                itemUtil.extractItem(element, materials);
            });
        emitEvent({
            type: 'material',
            skill: skillId,
            materials
        });
    }

    function readMasteryPassives() {
        const passives = $('mastery-page .group:last-child button.row')
            .toArray()
            .map(a => $(a))
            .filter(a => util.parseNumber(a.find('.amount').text()))
            .map(a => a.find('.name').text())
            .map(a => passiveMap[a])
            .filter(a => a);
        emitEvent({
            type: 'full', // this needs to be full for the syncTracker, I know it's not ideal
            passives
        });
    }

    function readActionScreen(skillId) {
        const mastery = masteryCache.bySkill[skillId];
        let stored = 0;
        let required = 0;
        $('skill-page .tabs > .tab[disabled]:contains("Estimates")')
            .closest('.card')
            .find('.row > .name:contains("Mastery")')
            .parent()
            .find('.value')
            .each((_,element) => {
                const parts = $(element).text().split('/');
                stored = util.parseNumber(parts[0]);
                required = util.parseNumber(parts[1]);
            });
        if(required === 0) {
            return;
        }
        const material = mastery.materials.find(a => a.amount === required);
        emitEvent({
            type: 'material',
            skill: skillId,
            materials: {
                [material.item]: stored
            }
        });
    }

    initialise();

}
