(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'petPassiveCache');

    const exports = {
        list: [],
        byId: null,
        byName: null,
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
        const petPassives = await request.listPetPassives();
        exports.byId = {};
        exports.byName = {};
        exports.idToIndex = {};
        for(const petPassive of petPassives) {
            exports.list.push(petPassive);
            exports.byId[petPassive.id] = petPassive;
            exports.byName[petPassive.name] = petPassive;
            exports.idToIndex[petPassive.id] = exports.list.length-1;
            petPassive.stats = {
                name: petPassive.statName,
                value: petPassive.statValue
            };
            delete petPassive.statName;
            delete petPassive.statValue;
        }
    }

    tryInitialise();

    return initialised;

}
