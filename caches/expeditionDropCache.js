(fallbackCache) => {

    const exports = {
        list: [],
        byExpedition: {},
        byItem: {}
    };

    async function initialise() {
        const drops = await fallbackCache.load('expeditionDrop');
        for(const drop of drops) {
            exports.list.push(drop);
            if(!exports.byExpedition[drop.expedition]) {
                exports.byExpedition[drop.expedition] = [];
            }
            exports.byExpedition[drop.expedition].push(drop);
            if(!exports.byItem[drop.item]) {
                exports.byItem[drop.item] = [];
            }
            exports.byItem[drop.item].push(drop);
        }
        return exports;
    }

    return initialise();

}
