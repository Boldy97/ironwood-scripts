(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-various');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        const various = {};
        if(page.type === 'action') {
            readActionScreen(various, page.skill);
        }
        emitEvent(various);
    }

    function readActionScreen(various, skillId) {
        const amountText = $('skill-page .header > .name:contains("Loot")').parent().find('.amount').text();
        const amountValue = !amountText ? null : util.parseNumber(amountText.split(' / ')[1]) - util.parseNumber(amountText.split(' / ')[0]);
        various.maxAmount = {
            [skillId]: amountValue
        };
    }

    initialise();

}
