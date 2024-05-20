(events, petUtil, util, localDatabase, petCache) => {

    const STORE_NAME = 'various';
    const KEY_NAME = 'pets';
    let state = [];

    async function initialise() {
        await loadSavedData();
        events.register('page', handlePage);
        events.register('reader-pet', handlePetReader);
    }

    async function loadSavedData() {
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        const entry = entries.find(entry => entry.key === KEY_NAME);
        if(entry) {
            state = entry.value;
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
        await localDatabase.saveEntry(STORE_NAME, {
            key: KEY_NAME,
            value: savedState
        });
        events.emit('state-pet', state);
    }

    initialise();

}
