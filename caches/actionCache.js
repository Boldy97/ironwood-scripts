(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null
    };

    async function initialise() {
        const actions = await request.listActions();
        exports.byId = {};
        exports.byName = {};
        for(const action of actions) {
            exports.list.push(action);
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
