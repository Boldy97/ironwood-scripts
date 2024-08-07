(events, itemUtil) => {

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 500);
    }

    function update() {
        const page = events.getLast('page');
        if(!page || page.type !== 'action') {
            return;
        }
        const lootCard = $('skill-page .card:not(:first-child) .header > .name:contains("Loot")')
            .closest('.card');
        if(!lootCard.length) {
            return;
        }
        const loot = {};
        lootCard.find('.row').each((i,element) => {
            itemUtil.extractItem(element, loot);
        });
        events.emit('reader-loot', {
            skill: page.skill,
            action: page.action,
            loot
        });
    }

    initialise();

}
