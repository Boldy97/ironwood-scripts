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

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function renderMain(pets) {
        if(!enabled || !pets.length) {
            return;
        }
        highestValues = getHighestValuesByFamily(pets);
        for(const pet of pets) {
            const tags = $(pet.element).find('.tags');
            highlight(pet, tags);
        }
    }

    function renderSingle(event) {
        if(!enabled || event.type !== 'single') {
            return;
        }
        const redesignPetData = events.getLast('redesign-pet');
        if(!redesignPetData) {
            return;
        }
        const pets = redesignPetData.slice(0);
        const index = pets.findIndex(pet => pet.name === event.value.name);
        if(index === -1) {
            pets.push(event.value);
        } else {
            pets[index] = event.value;
        }
        highestValues = getHighestValuesByFamily(pets);
        highlight(event.value, $(event.modal));
    }

    function highlight(pet, root) {
        const colorGood = colorMapper('success');
        const colorBad = colorMapper('danger');
        const colorMid = colorMapper('focus');
        for(const stat of stats) {
            const top = highestValues[pet.family][stat];
            if(pet[stat] === top.value) {
                root.find(`.stat-${stat}`).css('box-shadow', `inset 0px 0px 6px 0px ${top.count === 1 ? colorGood : colorMid}`);
            } else {
                root.find(`.stat-${stat}`).css('box-shadow', '');
            }
        }
        for(const id of pet.passives) {
            const passive = petPassiveCache.byId[id].stats;
            const top = highestValues[pet.family][passive.name];
            if(passive.name === 'hunger') {
                root.find(`.passive-${passive.name}`).css('box-shadow', `inset 0px 0px 6px 0px ${colorBad}`);
            } else if(passive.value === top.value) {
                root.find(`.passive-${passive.name}`).css('box-shadow', `inset 0px 0px 6px 0px ${top.count === 1 ? colorGood : colorMid}`);
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
                const values = pets
                    .filter(pet => pet.family === family)
                    .map(pet => pet[stat])
                    .sort((a,b) => b-a);
                result[family][stat] = {
                    value: values[0] || 0,
                    count: 1 + values.lastIndexOf(values[0])
                };
            }
            for(const stat of passiveStats) {
                const values = pets
                    .filter(pet => pet.family === family)
                    .flatMap(pet => pet.passives)
                    .map(id => petPassiveCache.byId[id])
                    .filter(passive => passive.stats.name === stat)
                    .map(passive => passive.stats.value)
                    .sort((a,b) => b-a);
                result[family][stat] = {
                    value: values[0] || 0,
                    count: 1 + values.lastIndexOf(values[0])
                };
            }
        }
        return result;
    }

    initialise();

}
