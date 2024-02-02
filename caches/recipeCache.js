(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byImage: null
    };

    async function initialise() {
        exports.list = await request.listRecipes();
        exports.byId = {};
        exports.byName = {};
        exports.byImage = {};
        for(const recipe of exports.list) {
            if(!exports.byId[recipe.id]) {
                exports.byId[recipe.id] = recipe;
            }
            if(!exports.byName[recipe.name]) {
                exports.byName[recipe.name] = recipe;
            }
            if(!exports.byName[recipe.name]) {
                exports.byName[recipe.name] = recipe;
            }
            const lastPart = recipe.image.split('/').at(-1);
            if(!exports.byImage[lastPart]) {
                exports.byImage[lastPart] = recipe;
            }
        }
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
