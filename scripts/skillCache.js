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
        const skills = await request.listSkills();
        exports.byId = {};
        exports.byName = {};
        for(const skill of skills) {
            exports.byId[skill.id] = skill;
            exports.byName[skill.name] = skill;
        }
        isReady.resolve();
    }

    initialise();

    return exports;

}
