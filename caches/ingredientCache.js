(fallbackCache) => {

    const exports = {
        list: [],
        byAction: {},
        byItem: {}
    };

    async function initialise() {
        const ingredients = await fallbackCache.load('ingredient');
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
        return exports;
    }

    return initialise();

}
