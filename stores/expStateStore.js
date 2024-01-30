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
                    level: 1,
                    virtualLevel: 1
                };
            }
            if(skill.exp > state[skill.id].exp) {
                updated = true;
                state[skill.id].exp = skill.exp;
                state[skill.id].level = util.expToLevel(skill.exp);
            }
        }
        if(updated) {
            emitEvent(state);
        }
    }

    initialise();

}
