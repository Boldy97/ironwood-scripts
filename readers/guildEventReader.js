(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-guild-event');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'guild' && $('guild-page .tracker ~ div button.row-active .name').text() === 'Events') {
            readScreen();
        }
    }

    function readScreen() {
        // TODO check this works when the event is on cooldown
        const eventRunning = $('guild-page .header:contains("Event")').parent().text().includes('Guild Credits');
        let eventSecondsRemaining = null;
        if(eventRunning) {
            const time = [];
            $('guild-page .header:contains("Event")').parent().find('.date').children().each((index, element) => time.push($(element).text()));
            eventSecondsRemaining = util.parseDuration(time.join(' '));
        }
        const data = {
            eventRunning,
            eventSecondsRemaining
        };
        emitEvent({
            type: 'full',
            value: data
        });
    }

    initialise();

}
