(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {}
    };

    async function initialise() {
        const actions = await request.listActions();
        for(const action of actions) {
            exports.list.push(action);
            exports.byId[action.id] = action;
            exports.byName[action.name] = action;
        }
        return exports;
    }

    return initialise();

}
