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
        if(Object.keys(event.loot).length !== Object.keys(state.loot).length) {
            return emit(event);
        }
        for(const key in event.loot) {
            if(event.loot[key] !== state.loot[key] || event.loot[key] !== state.loot[key]) {
                return emit(event);
            }
        }
    }

    function emit(event) {
        state = event;
        events.emit('state-loot', state);
    }

    initialise();

}
