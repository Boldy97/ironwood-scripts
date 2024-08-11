(events, util) => {

    const emitEvent = events.emit.bind(null, 'state-exp');
    const state = {};

    function initialise() {
        events.register('reader-exp', handleExpReader);
    }

    function handleExpReader(event) {
        let updated = false;
        for(const skill of event) {
            if(!state[skill.id]) {
                state[skill.id] = {
                    id: skill.id,
                    exp: 0,
                    level: 1
                };
            }
            const level = util.expToLevel(skill.exp);
            if(skill.exp > state[skill.id].exp || level !== state[skill.id].level) {
                updated = true;
                state[skill.id].exp = skill.exp;
                state[skill.id].level = level;
            }
        }
        if(updated) {
            emitEvent(state);
        }
    }

    initialise();

}
