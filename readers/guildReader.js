(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-guild');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'guild') {
            readScreen();
        }
    }

    function readScreen() {
        const data = {
            name: $('guild-page .tracker .name').text(),
            level: util.parseNumber($('guild-page .tracker .level').text())
        };
        if(!data.name) {
            return;
        }
        emitEvent({
            type: 'full',
            value: data
        });
    }

    initialise();

}
