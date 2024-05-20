(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'structuresCache');

    const exports = {
        list: [],
        byId: {},
        byName: {}
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
        const structures = await request.listStructures();
        for(const structure of structures) {
            exports.list.push(structure);
            exports.byId[structure.id] = structure;
            exports.byName[structure.name] = structure;
        }
    }

    tryInitialise();

    return initialised;

}
