(events) => {

    const emitEvent = events.emit.bind(null, 'state-market');
    const state = {};

    function initialise() {
        events.register('reader-market', handleMarketReader);
    }

    function handleMarketReader(event) {
        state[event.type] = event.listings;
        state.lastType = event.type;
        state.last = event.listings;
        emitEvent(state);
    }

    initialise();

}
