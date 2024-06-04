(configuration, events, elementCreator, petPassiveCache, colorMapper, petUtil) => {

    let enabled = false;
    const emitEvent = events.emit.bind(null, 'redesign-pet');

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-stat-redesign',
            name: 'Stat redesign',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('state-pet', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update(state) {
        if(!enabled) {
            return;
        }
        let changed = false;
        for(const pet of state.filter(pet => pet.default)) {
            renderDefault(pet);
        }
        for(const pet of state.filter(pet => !pet.default && pet.duplicate)) {
            renderDuplicate(pet);
        }
        const pets = state.filter(pet => !pet.default && !pet.duplicate && pet.parsed);
        for(const pet of pets) {
            if(renderParsed(pet)) {
                changed = true;
            }
        }
        if(changed) {
            emitEvent(pets);
        }
    }

    function renderDefault(pet) {
        const tags = $(pet.element).find('.tags');
        if(tags.find('.tag-default').length) {
            return false;
        }
        const color = colorMapper('warning');
        const tag = elementCreator.getTag('Default name', undefined, 'tag-default')
            .css('box-shadow', `inset 0px 0px 8px 0px ${color}`);
        tags.append(tag);
        return true;
    }

    function renderDuplicate(pet) {
        const tags = $(pet.element).find('.tags');
        if(tags.find('.tag-duplicate').length) {
            return false;
        }
        const color = colorMapper('warning');
        const tag = elementCreator.getTag('Duplicate name', undefined, 'tag-duplicate')
            .css('box-shadow', `inset 0px 0px 8px 0px ${color}`);
        tags.append(tag);
        return true;
    }

    function renderParsed(pet) {
        const tags = $(pet.element).find('.tags');
        if(tags.find('.stat-health').length) {
            return false;
        }
        tags.empty();
        const table = $(`<div style='display:inline-grid;grid-template-rows:1fr 1fr;grid-auto-flow:column'></div>`);
        tags.append(table);
        // stats
        table.append(elementCreator.getTag(`${pet.health}%`, petUtil.IMAGES.health, 'stat-health'));
        table.append(elementCreator.getTag(`${pet.attack}%`, petUtil.IMAGES.attack, 'stat-attack'));
        table.append(elementCreator.getTag(`${pet.defense}%`, petUtil.IMAGES.defense, 'stat-defense'));
        // spacing
        table.append(`<div style='padding:5px'></div>`);
        table.append(`<div style='padding:5px'></div>`);
        table.append(`<div style='padding:5px'></div>`);
        // passives
        for(const id of pet.passives) {
            const passive = petPassiveCache.byId[id];
            table.append(elementCreator.getTag(passive.name, null, `passive-${passive.stats.name}`));
        }
        return true;
    }

    initialise();

}