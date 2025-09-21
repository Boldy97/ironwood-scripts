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

    async function handleReader(event) {
        let updated = false;
        if(event.type === 'material') {
            updated |= handleMaterialReader(event);
        }
        if(event.type === 'full') {
            updated |= handlePointsReader(event);
        }
        if(updated) {
            await localDatabase.saveVariousEntry(DATABASE_KEY, state);
            emitEvent(state);
        }
    }

    function handleMaterialReader(event) {
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
        return updated;
    }

    function handlePointsReader(event) {
        let updated = false;
        const newPoints = {};
        for(const passive of event.passives) {
            updated |= !state.points[passive]; // additions
            newPoints[passive] = 1;
        }
        for(const key of Object.keys(state.points)) {
            updated |= !newPoints[key]; // removal
        }
        state.points = newPoints;
        return updated;
    }

    initialise();

}
