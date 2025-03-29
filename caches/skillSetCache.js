(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
    };

    async function initialise() {
        const skillSets = await request.listSkillSets();
        for(const skillSet of skillSets) {
            exports.list.push(skillSet);
            exports.byId[skillSet.id] = skillSet;
            exports.byName[skillSet.name] = skillSet;
        }
        return exports;
    }

    return initialise();

}
