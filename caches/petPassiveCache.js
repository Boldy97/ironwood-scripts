(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        idToIndex: {}
    };

    async function initialise() {
        const petPassives = await request.listPetPassives();
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
        return exports;
    }

    return initialise();

}
