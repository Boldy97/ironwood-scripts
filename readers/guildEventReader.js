(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-guild-event');
    const ONE_MINUTE = 1000 * 60;
    const TWO_DAYS = 1000 * 60 * 60 * 24 * 2;

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
        const eventRunning = $('guild-page .header:contains("Event")').parent().text().includes('Guild Credits');
        let eventStartMillis = null;
        let eventType = null;
        if(eventRunning) {
            const time = [];
            $('guild-page .header:contains("Event")').parent().find('.date').children().each((index, element) => time.push($(element).text()));
            const eventSecondsRemaining = util.parseDuration(time.join(' '));
            eventStartMillis = Date.now() - TWO_DAYS + 1000 * eventSecondsRemaining;
            eventStartMillis = util.roundToMultiple(eventStartMillis, ONE_MINUTE);
            eventType = $('guild-page .header:contains("Event")').parent().find('.date').prev().text().split(' Event')[0];
        }
        const data = {
            eventRunning,
            eventStartMillis,
            eventType
        };
        emitEvent({
            type: 'full',
            value: data
        });
    }

    initialise();

}
