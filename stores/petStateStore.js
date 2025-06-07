(events, petUtil, util, localDatabase, petCache) => {

    const DATABASE_KEY = 'pets';
    let state = [];

    async function initialise() {
        await loadSavedData();
        events.register('page', handlePage);
        events.register('reader-pet', handlePetReader);
    }

    async function loadSavedData() {
        const savedData = await localDatabase.getVariousEntry(DATABASE_KEY);
        if(savedData) {
            state = savedData.filter(pet => pet.version === petUtil.VERSION);
            events.emit('state-pet', state);
        }
    }

    function handlePage(page) {
        if(page.type === 'taming' && page.menu === 'pets') {
            emitEvent(state);
        }
    }

    function handlePetReader(event) {
        let updated = false;
        if(event.type === 'list') {
            const duplicateNames = new Set(util.getDuplicates(event.value.map(a => a.name)));
            const defaultNames = new Set(petCache.list.map(a => a.name));
            const newState = event.value.map(pet => {
                pet.duplicate = duplicateNames.has(pet.name);
                pet.default = defaultNames.has(pet.name);
                if(pet.duplicate || pet.default) {
                    return pet;
                }
                const match = find(pet);
                if(match) {
                    delete pet.parsed;
                    Object.assign(match, pet);
                    return match;
                }
                updated = true;
                if(petUtil.isEncodedPetName(pet.name)) {
                    Object.assign(pet, petUtil.textToPet(pet.name));
                }
                return pet;
            });
            if(state.length !== newState.length) {
                updated = true;
            }
            state = newState;
        } else if(event.type === 'single') {
            const match = find(event.value);
            if(match && !match.duplicate && !match.default && !match.parsed) {
                Object.assign(match, event.value);
                updated = true;
            }
        }
        if(updated) {
            emitEvent(state);
        }
    }

    function find(pet) {
        return state.find(pet2 => pet2.name === pet.name);
    }

    async function emitEvent(state) {
        const savedState = state.map(pet => Object.assign({}, pet));
        for(const pet of savedState) {
            delete pet.element;
        }
        await localDatabase.saveVariousEntry(DATABASE_KEY, savedState);
        events.emit('state-pet', state);
    }

    initialise();

}
