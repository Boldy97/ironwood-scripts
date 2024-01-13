(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byName: null
    };

    async function initialise() {
        const enrichedStructures = await request.listStructures();
        exports.byName = {};
        for(const enrichedStructure of enrichedStructures) {
            exports.list.push(enrichedStructure);
            exports.byName[enrichedStructure.name] = enrichedStructure;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
