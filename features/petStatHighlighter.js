(configuration, events, util, colorMapper, petCache, petPassiveCache, petUtil) => {

    let enabled = false;
    const stats = petUtil.STATS_BASE;
    const passiveStats = util.distinct(petPassiveCache.list.map(a => a.stats.name));
    let highestValues = null;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-stat-highlighter',
            name: 'Highlight best stats [needs stat redesign]',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('redesign-pet', renderMain);
        events.register('reader-pet', renderSingle);
    }

    function handleConfigStateChange(state, name) {
        enabled = state;
    }

    function renderMain(pets) {
        if(!enabled || !pets.length) {
            return;
        }
        highestValues = getHighestValuesByFamily(pets);
        const color = colorMapper('success');
        for(const pet of pets) {
            const tags = $(pet.element).find('.tags');
            highlight(pet, color, tags);
        }
    }

    function renderSingle(event) {
        if(!enabled || event.type !== 'single') {
            return;
        }
        const pets = events.getLast('redesign-pet').slice(0);
        pets.push(event.value);
        highestValues = getHighestValuesByFamily(pets);
        const color = colorMapper('success');
        highlight(event.value, color, $(event.modal));
    }

    function highlight(pet, color, root) {
        for(const stat of stats) {
            if(pet[stat] === highestValues[pet.family][stat]) {
                root.find(`.stat-${stat}`).css('box-shadow', `inset 0px 0px 8px 0px ${color}`);
            } else {
                root.find(`.stat-${stat}`).css('box-shadow', '');
            }
        }
        for(const id of pet.passives) {
            const passive = petPassiveCache.byId[id].stats;
            if(passive.value === highestValues[pet.family][passive.name]) {
                root.find(`.passive-${passive.name}`).css('box-shadow', `inset 0px 0px 8px 0px ${color}`);
            } else {
                root.find(`.passive-${passive.name}`).css('box-shadow', '');
            }
        }
    }

    function getHighestValuesByFamily(pets) {
        const result = {};
        for(const pet of pets) {
            pet.family = petCache.byId[pet.species].family;
        }
        const families = util.distinct(pets.map(pet => pet.family));
        for(const family of families) {
            result[family] = {};
            for(const stat of stats) {
                result[family][stat] = pets
                    .filter(pet => pet.family === family)
                    .map(pet => pet[stat])
                    .sort((a,b) => b-a)[0] || 0;
            }
            for(const stat of passiveStats) {
                result[family][stat] = pets
                    .filter(pet => pet.family === family)
                    .flatMap(pet => pet.passives)
                    .map(id => petPassiveCache.byId[id])
                    .filter(passive => passive.stats.name === stat)
                    .map(passive => passive.stats.value)
                    .sort((a,b) => b-a)[0] || 0;
            }
        }
        return result;
    }

    initialise();

}
