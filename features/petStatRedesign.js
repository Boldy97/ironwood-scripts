(configuration, events, elementCreator, petPassiveCache, petCache, colorMapper, petUtil) => {

    let enabled = false;
    let showLootTypeEnabled = false;
    const emitEvent = events.emit.bind(null, 'redesign-pet');

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-stat-redesign',
            name: 'Stat redesign',
            default: true,
            handler: handleConfigStateChange
        });
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-stat-redesign-loot-type',
            name: 'Stat redesign - loot type',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('state-pet', update);
        elementCreator.addStyles(styles);
    }

    function handleConfigStateChange(state, name) {
        if(name === 'pet-stat-redesign') {
            enabled = state;
        }
        if(name === 'pet-stat-redesign-loot-type') {
            showLootTypeEnabled = state;
        }
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
        const table = $(`<div class='custom-pet-stat-redesign-table'></div>`);
        tags.append(table);
        if(showLootTypeEnabled) {
            // abilities
            const basepet = petCache.byId[pet.species];
            for(const ability of basepet.abilities) {
                const name = Object.keys(ability)[0];
                const value = Object.values(ability)[0];
                table.append(elementCreator.getTag(value, petUtil.IMAGES[name]));
            }
            // spacing
            table.append(`<div class='spacing'></div>`);
        }
        // stats
        table.append(elementCreator.getTag(`${pet.health}%`, petUtil.IMAGES.health, 'stat-health'));
        table.append(elementCreator.getTag(`${pet.attack}%`, petUtil.IMAGES.attack, 'stat-attack'));
        table.append(elementCreator.getTag(`${pet.defense}%`, petUtil.IMAGES.defense, 'stat-defense'));
        // spacing
        table.append(`<div class='spacing'></div>`);
        // passives
        for(const id of pet.passives) {
            const passive = petPassiveCache.byId[id];
            table.append(elementCreator.getTag(passive.stats.level, passive.image, `passive-${passive.stats.name}`));
        }
        return true;
    }

    const styles = `
        .custom-pet-stat-redesign-table {
            display: flex;
        }

        .custom-pet-stat-redesign-table > .spacing {
            padding: 5px;
        }

        .custom-pet-stat-redesign-table > div[class*="stat-"] {
            color: #ccc;
        }

        .custom-pet-stat-redesign-table > div[class*="passive-"] {
            background-color: rgba(255, 255, 255, 0.05);
        }
    `;

    initialise();

}