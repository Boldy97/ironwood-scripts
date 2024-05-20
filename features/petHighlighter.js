(events) => {

    const exports = {
        highlight
    };

    let currentColor = null;
    let currentNames = null;

    function initialise() {
        events.register('page', update);
        events.register('state-pet', update);
    }

    function highlight(color, names) {
        currentColor = color;
        currentNames = names;
    }

    function update() {
        if(!currentColor || !currentNames || !currentNames.length) {
            return;
        }
        const page = events.getLast('page');
        if(page?.type === 'taming' && page.menu === 'pets') {
            events.getLast('state-pet')
                .filter(pet => currentNames.includes(pet.name) && pet.element)
                .forEach(pet => {
                    $(pet.element).css('box-shadow', `inset 0px 0px 8px 0px ${currentColor}`)
                });
        }
    }

    initialise();

    return exports;

}
