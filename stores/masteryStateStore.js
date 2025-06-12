(events, localDatabase) => {

    const emitEvent = events.emit.bind(null, 'state-mastery');
    const DATABASE_KEY = 'masteries';
    let state = {
        materials: {},
        points: {}
    };

    async function initialise() {
        await loadSavedData();
        events.register('reader-mastery', handleReader);
    }

    async function loadSavedData() {
        const savedData = await localDatabase.getVariousEntry(DATABASE_KEY);
        if(savedData) {
            state = savedData;
            emitEvent(state);
        }
    }

    function handleReader(event) {
        if(event.type === 'material') {
            handleMaterialReader(event);
        }
        if(event.type === 'points') {
            // TODO unimplemented
        }
    }

    async function handleMaterialReader(event) {
        if(!state.materials[event.skill]) {
            state.materials[event.skill] = {};
        }
        let updated = false;
        for(const item in event.materials) {
            if(state.materials[event.skill][item] === undefined || state.materials[event.skill][item] !== event.materials[item]) {
                updated = true;
            }
            state.materials[event.skill][item] = event.materials[item];
        }
        if(updated) {
            await localDatabase.saveVariousEntry(DATABASE_KEY, state);
            emitEvent(state);
        }
    }

    initialise();

}
