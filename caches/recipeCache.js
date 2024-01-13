(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byName: null,
        byImage: null
    };

    async function initialise() {
        const recipes = await request.listRecipes();
        exports.byName = {};
        exports.byImage = {};
        for(const recipe of recipes) {
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
