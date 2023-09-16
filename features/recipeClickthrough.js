(request, configuration, util) => {

    let enabled = false;
    let recipeCacheByName;
    let recipeCacheByImage;
    let element;

    async function initialise() {
        const category = configuration.registerCategory('ui-features', 'UI Features');
        configuration.registerToggle('recipe-click', 'Recipe clickthrough', true, handleConfigStateChange, category);
        $(document).on('click', 'div.image > img', handleClick);
    }

    function handleConfigStateChange(state) {
        enabled = state;
        setupRecipeCache();
    }

    async function setupRecipeCache() {
        if(!enabled || recipeCacheByName) {
            return;
        }
        recipeCacheByName = {};
        recipeCacheByImage = {};
        const recipes = await request.listRecipes();
        for(const recipe of recipes) {
            if(!recipeCacheByName[recipe.name]) {
                recipeCacheByName[recipe.name] = recipe;
            }
            const lastPart = recipe.image.split('/').at(-1);
            if(!recipeCacheByImage[lastPart]) {
                recipeCacheByImage[lastPart] = recipe;
            }
        }
    }

    function handleClick(event) {
        if(!enabled || !recipeCacheByName) {
            return;
        }
        if($(event.currentTarget).closest('button').length) {
            return;
        }
        event.stopPropagation();
        const name = $(event.relatedTarget).find('.name').text();
        const nameMatch = recipeCacheByName[name];
        if(nameMatch) {
            return followRecipe(nameMatch);
        }

        const parts = event.target.src.split('/');
        const lastPart = parts[parts.length-1];
        const imageMatch = recipeCacheByImage[lastPart];
        if(imageMatch) {
            return followRecipe(imageMatch);
        }
    }

    function followRecipe(recipe) {
        util.goToPage(recipe.url);
    }

    initialise();

}
