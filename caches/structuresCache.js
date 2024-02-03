(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null
    };

    async function initialise() {
        const structures = await request.listStructures();
        exports.byId = {};
        exports.byName = {};
        for(const structure of structures) {
            exports.list.push(structure);
            exports.byId[structure.id] = structure;
            exports.byName[structure.name] = structure;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
