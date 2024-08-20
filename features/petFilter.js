(configuration, events, components, elementCreator, petCache, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-filter',
            name: 'Pet filter',
            default: true,
            handler: handleConfigStateChange
        });
        elementCreator.addStyles(styles);
        const options = [{
            text: 'None',
            value: 'None',
            selected: true
        }];
        options.push(
            ...petCache.list
                .map(a => a.family)
                ._distinct()
                .map(a => ({
                    family: a,
                    tier: petCache.list
                        .filter(b => b.family === a)
                        .map(b => b.tier)
                        .sort()[0]
                }))
                ._groupBy(a => a.tier)
                .flatMap(a => {
                    a.unshift({family:`--- Tier ${a[0].tier} ---`});
                    return a.map(b => ({
                        value: b.family,
                        text: b.family,
                        disabled: b.family.startsWith('---')
                    }));
                })
        );
        components.search(componentBlueprint, 'dropdown').options = options;
        events.register('page', handlePage);
        events.register('state-pet', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePage(page) {
        if(!enabled || page.type !== 'taming' || page.menu !== 'pets') {
            return;
        }
        components.addComponent(componentBlueprint);
    }

    function update() {
        const value = components.search(componentBlueprint, 'dropdown').options.find(a => a.selected).value;
        for(const pet of events.getLast('state-pet')) {
            if(pet.partOfTeam || pet.partOfRanch || !pet.element) {
                continue;
            }
            $(pet.element).css('display', value === 'None' || pet.family === value ? 'flex' : 'none');
        }
    }

    const componentBlueprint = {
        componentId: 'petFilterComponent',
        dependsOn: '.header:contains("Pets") ~ .sort',
        parent: '.header:contains("Pets") ~ .sort',
        selectedTabIndex: 0,
        tabs: [{
            rows: [{
                id: 'dropdown',
                type: 'dropdown',
                action: update,
                options: []
            }]
        }]
    };

    const styles = `
        #petFilterComponent {
            width: auto;
            visibility: hidden;
        }
        #petFilterComponent .myItemSelect {
            background-color: ${colorMapper('componentRegular')};
            visibility: visible;
        }
    `;

    initialise();

}
