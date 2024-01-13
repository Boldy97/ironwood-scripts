(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byTechnicalName: null,
    };

    async function initialise() {
        const skills = await request.listSkills();
        exports.byId = {};
        exports.byName = {};
        exports.byTechnicalName = {};
        for(const skill of skills) {
            exports.list.push(skill);
            exports.byId[skill.id] = skill;
            exports.byName[skill.displayName] = skill;
            exports.byTechnicalName[skill.technicalName] = skill;
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
