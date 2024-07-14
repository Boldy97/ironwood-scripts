(configuration, elementWatcher) => {

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'quest-disabler',
            name: 'Quest Disabler',
            default: false,
            handler: toggle
        });
    }

    async function toggle(state) {
        await elementWatcher.exists('nav-component button[routerLink="/quests"]');
        $('nav-component button[routerLink="/quests"]')
            .attr('disabled', state)
            .css('pointer-events', state ? 'none' : '')
            .find('.name')
            .css('color', state ? '#db6565' : 'white')
            .css('text-decoration', state ? 'line-through' : '');
    }

    initialise();

}
