(events, util, skillCache, skillSetCache) => {

    const emitEvent = events.emit.bind(null, 'reader-marks');
    const sets = ['Forest', 'Mountain', 'Ocean', 'All'].map(name => skillSetCache.byName[name]);

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'marks' && page.menu === 'skill marks') {
            readMarksScreen();
        }
    }

    function readMarksScreen() {
        const marks = {
            exp: {},
            eff: {}
        };
        // singles
        $('marks-page .header:contains("Skill Marks")').parent().find('.row').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text().replace(/ Mark$/, '');
            const amount = util.parseNumber(element.find('.amount').text());
            if(amount) {
                const skill = skillCache.match(name);
                marks.exp[skill.id] = 4;
            }
        });
        // sets
        let oneSetUnlocked = false;
        for(const set of sets) {
            if(containsAllKeys(marks.exp, set.skills)) {
                oneSetUnlocked = true;
                for(const skillId of set.skills) {
                    marks.eff[skillId] = (marks.eff[skillId] || 0) + 2;
                }
            }
        }
        const tamingSkill = skillCache.byName['Taming'];
        if(oneSetUnlocked && marks.exp[tamingSkill.id]) {
            marks.eff[tamingSkill.id] = (marks.eff[tamingSkill.id] || 0) + 2;
        }
        emitEvent({
            type: 'full',
            value: marks
        });
    }

    function containsAllKeys(object, keys) {
        for(const key of keys) {
            if(!object[key]) {
                return false;
            }
        }
        return true;
    }

    initialise();

}
