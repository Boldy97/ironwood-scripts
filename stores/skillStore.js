(request, Promise) => {

    const isReady = new Promise.Deferred();

    const exports = {
        ready: isReady.promise,
        list: [],
        byId: null,
        byName: null,
    };

    async function initialise() {
        const skills = await request.listSkills();
        exports.byId = {};
        exports.byName = {};
        for(const skill of skills) {
            exports.list.push(skill);
            exports.byId[skill.id] = skill;
            exports.byName[skill.name] = skill;
        }
        isReady.resolve();
    }

    initialise();

    return exports;

}
