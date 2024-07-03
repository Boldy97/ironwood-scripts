(events) => {

    const emitEvent = events.emit.bind(null, 'reader-settings');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'settings') {
            readScreen();
        }
    }

    function readScreen() {
        const data = {
            name: $('settings-page .name:contains("Username")').next().text()
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
