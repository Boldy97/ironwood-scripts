(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'expeditionDropCache');

    const exports = {
        list: [],
        byExpedition: {},
        byItem: {}
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
        const drops = await request.listExpeditionDrops();
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
    }

    tryInitialise();

    return initialised;

}
