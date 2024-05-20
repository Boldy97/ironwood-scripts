(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'expeditionCache');

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byTier: {}
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
        const expeditions = await request.listExpeditions();
        for(const expedition of expeditions) {
            exports.list.push(expedition);
            exports.byId[expedition.id] = expedition;
            exports.byName[expedition.name] = expedition;
            exports.byTier[expedition.tier] = expedition;
        }
    }

    tryInitialise();

    return initialised;

}
