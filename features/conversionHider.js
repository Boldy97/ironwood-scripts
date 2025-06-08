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
        elementWatcher.addRecursiveObserver(onSelection, 'app-component > div.scroll div.wrapper', 'skill-page', 'charcoal-component');
        elementWatcher.addRecursiveObserver(onSelection, 'app-component > div.scroll div.wrapper', 'skill-page', 'compost-component');
        elementWatcher.addRecursiveObserver(onSelection, 'app-component > div.scroll div.wrapper', 'skill-page', 'arcane-powder-component');
        elementWatcher.addRecursiveObserver(onSelection, 'app-component > div.scroll div.wrapper', 'taming-page', 'pet-snacks-component');
        elementWatcher.addRecursiveObserver(onSelection, 'app-component > div.scroll div.wrapper', 'skill-page', 'metal-parts-component');
        elementWatcher.addRecursiveObserver(onSelection, 'app-component > div.scroll div.wrapper', 'skill-page', 'sigil-pieces-component');
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
