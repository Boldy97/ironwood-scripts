(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {}
    };

    async function initialise() {
        const structures = await request.listStructures();
        for(const structure of structures) {
            exports.list.push(structure);
            exports.byId[structure.id] = structure;
            exports.byName[structure.name] = structure;
        }
        return exports;
    }

    return initialise();

}
