(fallbackCache) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byTier: {}
    };

    async function initialise() {
        const expeditions = await fallbackCache.load('expedition');
        for(const expedition of expeditions) {
            exports.list.push(expedition);
            exports.byId[expedition.id] = expedition;
            exports.byName[expedition.name] = expedition;
            exports.byTier[expedition.tier] = expedition;
        }
        return exports;
    }

    return initialise();

}
