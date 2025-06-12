(configuration, elementWatcher) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'conversion-hider',
            name: 'Hide unavailable conversions',
            default: true,
            handler: handleConfigStateChange
        });
        const chains = [
            ['app-component > div.scroll div.wrapper', 'skill-page'],
            ['app-component > div.scroll div.wrapper', 'taming-page'],
            ['app-component > div.scroll div.wrapper', 'home-page', '.groups', '.group', 'automate-component']
        ];
        for(const chain of chains) {
            elementWatcher.addRecursiveObserver(onSelection, ...chain, 'charcoal-component');
            elementWatcher.addRecursiveObserver(onSelection, ...chain, 'compost-component');
            elementWatcher.addRecursiveObserver(onSelection, ...chain, 'arcane-powder-component');
            elementWatcher.addRecursiveObserver(onSelection, ...chain, 'pet-snacks-component');
            elementWatcher.addRecursiveObserver(onSelection, ...chain, 'metal-parts-component');
            elementWatcher.addRecursiveObserver(onSelection, ...chain, 'sigil-pieces-component');
        }
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onSelection(screen) {
        if(!enabled) {
            return;
        }
        $(screen).find('button[disabled]').remove();
    }

    initialise();

}
