(auth, request, Promise) => {

    const authenticated = auth.ready;
    const isReady = new Promise.Deferred();

    const exports = {
        ready: isReady.promise,
        byId: null,
        byName: null
    };

    async function initialise() {
        await authenticated;
        const actions = await request.listActions();
        exports.byId = {};
        exports.byName = {};
        for(const action of actions) {
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
        isReady.resolve();
    }

    initialise();

    return exports;

}
