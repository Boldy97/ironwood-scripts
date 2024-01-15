(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-enhancements');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'enhancement' && $('home-page .categories .category-active').text() === 'Enhance') {
            readEnhancementsScreen();
        }
    }

    function readEnhancementsScreen() {
        const enhancements = {};
        $('home-page .categories + .card button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const level = util.parseNumber(element.find('.level').text());
            enhancements[name] = level;
        });
        emitEvent({
            type: 'full',
            value: enhancements
        });
    }

    initialise();

}
