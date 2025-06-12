(request) => {

    const exports = {
        list: [],
        byId: {},
        bySkill: {},
        byImage: {}
    };

    async function initialise() {
        const masteries = await request.listMasteries();
        for(const mastery of masteries) {
            exports.list.push(mastery);
            exports.byId[mastery.id] = mastery;
            exports.bySkill[mastery.skill] = mastery;
            const lastPart = mastery.image.split('/').at(-1);
            exports.byImage[lastPart] = mastery;
        }
        return exports;
    }

    return initialise();

}
