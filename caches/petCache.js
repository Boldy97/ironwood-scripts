(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byImage: {},
        idToIndex: {}
    };

    async function initialise() {
        const pets = await request.listPets();
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
        return exports;
    }

    return initialise();

}
