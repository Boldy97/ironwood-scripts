(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'actionCache');

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
        const actions = await request.listActions();
        for(const action of actions) {
            exports.list.push(action);
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
    }

    tryInitialise();

    return initialised;

}
