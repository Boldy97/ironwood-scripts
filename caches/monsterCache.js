(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'monsterCache');

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
        const monsters = await request.listMonsters();
        exports.byId = {};
        exports.byName = {};
        for(const monster of monsters) {
            exports.list.push(monster);
            exports.byId[monster.id] = monster;
            exports.byName[monster.name] = monster;
        }
    }

    tryInitialise();

    return initialised;

}
