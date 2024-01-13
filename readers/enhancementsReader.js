(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-enhancements');

    let currentPage;

    function initialise() {
        events.register('page', handlePage);
        window.setInterval(update, 1000);
    }

    function handlePage(page) {
        currentPage = page;
        update();
    }

    function update() {
        if(!currentPage) {
            return;
        }
        if(currentPage.type === 'enhancement' && $('home-page .categories .category-active').text() === 'Enhance') {
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
