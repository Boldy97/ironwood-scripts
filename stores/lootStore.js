(events, util) => {

    let state = null;

    function initialise() {
        events.register('reader-loot', handle);
    }

    function handle(event) {
        // first time
        if(state == null) {
            return emit(event, false);
        }
        // compare action and skill
        if(state.skill !== event.skill || state.action !== event.action) {
            return emit(event, false);
        }
        // check updated amounts
        if(Object.keys(event.loot).length !== Object.keys(state.loot).length) {
            return emit(event, true);
        }
        for(const key in event.loot) {
            if(event.loot[key] !== state.loot[key] || event.loot[key] !== state.loot[key]) {
                return emit(event, true);
            }
        }
    }

    function emit(event, includePartialDelta) {
        if(includePartialDelta) {
            event.delta = util.deltaObjects(state.loot, event.loot);
        } else {
            event.delta = event.loot;
        }
        state = event;
        events.emit('state-loot', state);
    }

    initialise();

}
