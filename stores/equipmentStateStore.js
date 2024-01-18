(events, util, itemCache) => {

    let state = {};

    function initialise() {
        events.register('reader-equipment-equipment', handleEquipmentReader);
    }

    function handleEquipmentReader(event) {
        let updated = false;
        if(event.type === 'full' || event.type === 'cache') {
            if(util.compareObjects(state, event.value)) {
                return;
            }
            updated = true;
            state = event.value;
        }
        if(event.type === 'partial') {
            for(const key of Object.keys(event.value)) {
                if(state[key] === event.value[key]) {
                    continue;
                }
                updated = true;
                // remove items of similar type
                for(const itemType in itemCache.specialIds) {
                    if(Array.isArray(itemCache.specialIds[itemType]) && itemCache.specialIds[itemType].includes(+key)) {
                        console.log(`Matched ${key} to ${itemType}`);
                        for(const itemId of itemCache.specialIds[itemType]) {
                            delete state[itemId];
                        }
                    }
                }
                state[key] = event.value[key];
            }
        }
        if(updated) {
            events.emit('state-equipment-equipment', state);
        }
    }

    initialise();

}
