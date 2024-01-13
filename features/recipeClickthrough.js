(recipeCache, configuration, util) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'recipe-click',
            name: 'Recipe clickthrough',
            default: true,
            handler: handleConfigStateChange
        });
        $(document).on('click', 'div.image > img', handleClick);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleClick(event) {
        if(!enabled) {
            return;
        }
        if($(event.currentTarget).closest('button').length) {
            return;
        }
        event.stopPropagation();
        const name = $(event.relatedTarget).find('.name').text();
        const nameMatch = recipeCache.byName[name];
        if(nameMatch) {
            return followRecipe(nameMatch);
        }

        const parts = event.target.src.split('/');
        const lastPart = parts[parts.length-1];
        const imageMatch = recipeCache.byImage[lastPart];
        if(imageMatch) {
            return followRecipe(imageMatch);
        }
    }

    function followRecipe(recipe) {
        util.goToPage(recipe.url);
    }

    initialise();

}
