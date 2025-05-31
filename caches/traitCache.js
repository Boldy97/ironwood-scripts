(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byImage: {}
    };

    async function initialise() {
        const traits = await request.listTraits();
        for(const trait of traits) {
            exports.list.push(trait);
            exports.byId[trait.id] = trait;
            exports.byName[trait.name] = trait;
            const lastPart = trait.image.split('/').at(-1);
            exports.byImage[lastPart] = trait;
        }
        return exports;
    }

    return initialise();

}
