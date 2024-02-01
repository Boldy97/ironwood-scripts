(events, util) => {

    const SOURCES = [
        'inventory',
        'equipment-runes',
        'equipment-tomes',
        'structures',
        'enhancements',
        'structures-guild'
    ];

    const stateBySource = {};

    function initialise() {
        for(const source of SOURCES) {
            stateBySource[source] = {};
            events.register(`reader-${source}`, handleReader.bind(null, source));
        }
    }

    function handleReader(source, event) {
        let updated = false;
        console.log(`Received ${event.type} data for ${source}`);
        if(event.type === 'full' || event.type === 'cache') {
            if(util.compareObjects(stateBySource[source], event.value)) {
                return;
            }
            updated = true;
            stateBySource[source] = event.value;
        }
        if(event.type === 'partial') {
            for(const key of Object.keys(event.value)) {
                if(stateBySource[source][key] === event.value[key]) {
                    continue;
                }
                updated = true;
                stateBySource[source][key] = event.value[key];
            }
        }
        if(updated) {
            events.emit(`state-${source}`, stateBySource[source]);
        }
    }

    initialise();

}
