(request, Promise) => {

    const exports = {
        load
    };

    const CACHES = [{
        name: 'action',
        fetcher: request.listActions,
        fallback: '{ACTION_CACHE_DATA}'
    },{
        name: 'drop',
        fetcher: request.listDrops,
        fallback: '{DROP_CACHE_DATA}'
    },{
        name: 'expedition',
        fetcher: request.listExpeditions,
        fallback: '{EXPEDITION_CACHE_DATA}'
    },{
        name: 'expeditionDrop',
        fetcher: request.listExpeditionDrops,
        fallback: '{EXPEDITION_DROP_CACHE_DATA}'
    },{
        name: 'ingredient',
        fetcher: request.listIngredients,
        fallback: '{INGREDIENT_CACHE_DATA}'
    },{
        name: 'item',
        fetcher: request.listItems,
        fallback: '{ITEM_CACHE_DATA}'
    },{
        name: 'itemAttribute',
        fetcher: request.listItemAttributes,
        fallback: '{ITEM_ATTRIBUTE_CACHE_DATA}'
    },{
        name: 'monster',
        fetcher: request.listMonsters,
        fallback: '{MONSTER_CACHE_DATA}'
    },{
        name: 'pet',
        fetcher: request.listPets,
        fallback: '{PET_CACHE_DATA}'
    },{
        name: 'petPassive',
        fetcher: request.listPetPassives,
        fallback: '{PET_PASSIVE_CACHE_DATA}'
    },{
        name: 'recipe',
        fetcher: request.listRecipes,
        fallback: '{RECIPE_CACHE_DATA}'
    },{
        name: 'skill',
        fetcher: request.listSkills,
        fallback: '{SKILL_CACHE_DATA}'
    },{
        name: 'structure',
        fetcher: request.listStructures,
        fallback: '{STRUCTURE_CACHE_DATA}'
    }];

    async function load(name) {
        const match = CACHES.find(a => a.name === name);
        try {
            const expiring = new Promise.Expiring(2000, 'fallbackCache - ' + name);
            match.fetcher()
                .then(a => expiring.resolve(a))
                .catch(a => expiring.reject(a));
            const result = await expiring;
            return result;
        } catch(e) {
            console.warn('Fetching fallback cache for ' + name, e);
            return JSON.parse(match.fallback);
        }
    }

    return exports;

}
