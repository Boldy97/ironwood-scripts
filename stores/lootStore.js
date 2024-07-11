(events) => {

    let state = null;

    function initialise() {
        events.register('reader-loot', handle);
    }

    function handle(event) {
        // first time
        if(state == null) {
            return emit(event);
        }
        // compare action and skill
        if(state.skill !== event.skill || state.action !== event.action) {
            return emit(event);
        }
        // check updated amounts
        let updated = false;
        for(const key in state.loot) {
            if(event.loot[key] !== state.loot[key] || event.loot[key] < state.loot[key]) {
                updated = true;
                break;
            }
        }
        if(updated) {
            return emit(event);
        }
    }

    function emit(event) {
        state = event;
        events.emit('state-loot', state);
    }

    initialise();

}
