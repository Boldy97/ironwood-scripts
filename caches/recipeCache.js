(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'recipeCache');

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byImage: null
    };

    async function tryInitialise() {
        try {
            await initialise();
            initialised.resolve(exports);
        } catch(e) {
            initialised.reject(e);
        }
    }

    async function initialise() {
        exports.list = await request.listRecipes();
        exports.byId = {};
        exports.byName = {};
        exports.byImage = {};
        for(const recipe of exports.list) {
            exports.byId[recipe.id] = recipe;
            exports.byName[recipe.name] = recipe;
            const lastPart = recipe.image.split('/').at(-1);
            exports.byImage[lastPart] = recipe;
        }
    }

    tryInitialise();

    return initialised;

}
