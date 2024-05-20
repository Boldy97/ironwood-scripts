(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'petCache');

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byImage: null,
        idToIndex: null
    };

    async function tryInitialise() {
        try {
            await initialise();
            initialised.resolve(exports);
        } catch(e) {
            initialised.reject(e);
        }
    }

    async function initialise() {
        const pets = await request.listPets();
        exports.byId = {};
        exports.byName = {};
        exports.byImage = {};
        exports.idToIndex = {};
        for(const pet of pets) {
            exports.list.push(pet);
            exports.byId[pet.id] = pet;
            exports.byName[pet.name] = pet;
            exports.idToIndex[pet.id] = exports.list.length-1;
            const lastPart = pet.image.split('/').at(-1);
            exports.byImage[lastPart] = pet;
            pet.abilities = [{
                [pet.abilityName1]: pet.abilityValue1
            }];
            if(pet.abilityName2) {
                pet.abilities.push({
                    [pet.abilityName2]: pet.abilityValue2
                });
            }
            delete pet.abilityName1;
            delete pet.abilityValue1;
            delete pet.abilityName2;
            delete pet.abilityValue2;
        }
    }

    tryInitialise();

    return initialised;

}
