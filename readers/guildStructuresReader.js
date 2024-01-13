(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-structures-guild');

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
        if(currentPage.type === 'guild' && $('guild-page .tracker + div button.row-active').text() === 'Buildings') {
            readGuildStructuresScreen();
        }
    }

    function readGuildStructuresScreen() {
        const structures = {};
        $('guild-page .card').first().find('button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const level = util.parseNumber(element.find('.amount').text());
            structures[name] = level;
        });
        emitEvent({
            type: 'full',
            value: structures
        });
    }

    initialise();

}
