(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byImage: {}
    };

    async function initialise() {
        exports.list = await request.listRecipes();
        for(const recipe of exports.list) {
            exports.byId[recipe.id] = recipe;
            exports.byName[recipe.name] = recipe;
            const lastPart = recipe.image.split('/').at(-1);
            exports.byImage[lastPart] = recipe;
        }
        return exports;
    }

    return initialise();

}
