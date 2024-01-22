(events) => {

    const emitEvent = events.emit.bind(null, 'state-market');
    let state = {};

    function initialise() {
        events.register('page', handlePage);
        events.register('reader-market', handleMarketReader);
    }

    function handlePage(event) {
        if(event.type == 'market') {
            state = {};
        }
    }

    function handleMarketReader(event) {
        state[event.type] = event.listings;
        state.lastType = event.type;
        state.last = event.listings;
        emitEvent(state);
    }

    initialise();

}
