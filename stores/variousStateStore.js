(events, skillCache) => {

    const emitEvent = events.emit.bind(null, 'state-various');
    const state = {};

    function initialise() {
        events.register('reader-various', handleReader);
    }

    function handleReader(event) {
        const updated = merge(state, event);
        if(updated) {
            emitEvent(state);
        }
    }

    function merge(target, source) {
        let updated = false;
        for(const key in source) {
            if(!(key in target)) {
                target[key] = source[key];
                updated = true;
                continue;
            }
            if(typeof target[key] === 'object' && typeof source[key] === 'object') {
                updated |= merge(target[key], source[key]);
                continue;
            }
            if(target[key] !== source[key]) {
                target[key] = source[key];
                updated = true;
                continue;
            }
        }
        return updated;
    }

    initialise();

}
