(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byTechnicalName: {},
        match,
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

    function match(name) {
        name = name.toLowerCase();
        for(let skill of exports.list) {
            if(name === skill.displayName.toLowerCase()) {
                return skill;
            }
            if(name === skill.technicalName.toLowerCase()) {
                return skill;
            }
        }
    }

    return initialise();

}
