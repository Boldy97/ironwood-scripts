(configuration, events, request) => {

    let enabled = false;
    const LAST_SENT = {};

    function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'data-forwarder',
            name: 'Data Forwarder',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('reader-guild', handleEvent);
        events.register('reader-structures-guild', handleEvent);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleEvent(data, eventName) {
        if(!enabled) {
            return;
        }
        if(data.type !== 'full') {
            return;
        }
        if(LAST_SENT[eventName] && LAST_SENT[eventName] > fifteenMinutesAgo()) {
            return;
        }
        LAST_SENT[eventName] = Date.now();
        console.log(eventName, data.value);
        switch(eventName) {
            case 'reader-guild': return request.forwardDataGuildLevel(data.value.name, data.value.level);
            case 'reader-structures-guild': return request.forwardDataGuildStructures(events.getLast('reader-guild').value.name, data.value);
            default: throw 'Unmapped event name : ' + eventName;
        }
    }

    function fifteenMinutesAgo() {
        return Date.now() - 1000 * 60 * 15;
    }

    initialise();

}
