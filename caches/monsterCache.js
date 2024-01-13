(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null
    };

    async function initialise() {
        const monsters = await request.listMonsters();
        exports.byId = {};
        exports.byName = {};
        for(const monster of monsters) {
            exports.list.push(monster);
            exports.byId[monster.id] = monster;
            exports.byName[monster.name] = monster;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
