(events, util, masteryCache, itemUtil) => {

    const emitEvent = events.emit.bind(null, 'reader-mastery');

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
            readMasteryScreen(page.skill);
        }
        if(page.type === 'action') {
            readActionScreen(page.skill);
        }
    }

    function readMasteryScreen(skillId) {
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
