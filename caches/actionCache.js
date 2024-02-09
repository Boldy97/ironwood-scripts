(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'actionCache');

    const exports = {
        list: [],
        byId: null,
        byName: null
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
        const actions = await request.listActions();
        exports.byId = {};
        exports.byName = {};
        for(const action of actions) {
            exports.list.push(action);
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
    }

    tryInitialise();

    return initialised;

}
