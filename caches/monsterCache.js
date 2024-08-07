(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {}
    };

    async function initialise() {
        const monsters = await request.listMonsters();
        for(const monster of monsters) {
            exports.list.push(monster);
            exports.byId[monster.id] = monster;
            exports.byName[monster.name] = monster;
        }
        return exports;
    }

    return initialise();

}
