(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byTechnicalName: {},
    };

    async function initialise() {
        const skills = await request.listSkills();
        for(const skill of skills) {
            exports.list.push(skill);
            exports.byId[skill.id] = skill;
            exports.byName[skill.displayName] = skill;
            exports.byTechnicalName[skill.technicalName] = skill;
        }
        return exports;
    }

    return initialise();

}
