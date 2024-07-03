(events, util, structuresCache) => {

    const emitEvent = events.emit.bind(null, 'reader-structures-guild');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'guild' && $('guild-page .tracker ~ div button.row-active .name').text() === 'Buildings') {
            readGuildStructuresScreen();
        }
    }

    function readGuildStructuresScreen() {
        const structures = {};
        $('guild-page .card').first().find('button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const structure = structuresCache.byName[name];
            if(!structure) {
                return;
            }
            const level = util.parseNumber(element.find('.amount').text());
            structures[structure.id] = level;
        });
        emitEvent({
            type: 'full',
            value: structures
        });
    }

    initialise();

}
