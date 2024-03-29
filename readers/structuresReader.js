(events, util, structuresCache) => {

    const emitEvent = events.emit.bind(null, 'reader-structures');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'structure' && $('home-page .categories .category-active').text() === 'Build') {
            readStructuresScreen();
        }
    }

    function readStructuresScreen() {
        const structures = {};
        $('home-page .categories + .card button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const structure = structuresCache.byName[name];
            if(!structure) {
                return;
            }
            const level = util.parseNumber(element.find('.level').text());
            structures[structure.id] = level;
        });
        emitEvent({
            type: 'full',
            value: structures
        });
    }

    initialise();

}
