(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'ingredientCache');

    const exports = {
        list: [],
        byAction: null,
        byItem: null
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
        const ingredients = await request.listIngredients();
        exports.byAction = {};
        exports.byItem = {};
        for(const ingredient of ingredients) {
            if(!exports.byAction[ingredient.action]) {
                exports.byAction[ingredient.action] = [];
            }
            exports.byAction[ingredient.action].push(ingredient);
            if(!exports.byItem[ingredient.item]) {
                exports.byItem[ingredient.item] = [];
            }
            exports.byItem[ingredient.item].push(ingredient);
        }
    }

    tryInitialise();

    return initialised;

}
