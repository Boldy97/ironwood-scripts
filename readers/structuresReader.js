(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-structures');

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
        if(currentPage.type === 'structure' && $('home-page .categories .category-active').text() === 'Build') {
            readStructuresScreen();
        }
    }

    function readStructuresScreen() {
        const structures = {};
        $('home-page .categories + .card button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const level = util.parseNumber(element.find('.level').text());
            structures[name] = level;
        });
        emitEvent({
            type: 'full',
            value: structures
        });
    }

    initialise();

}
