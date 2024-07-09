(events, util, structuresCache) => {

    const emitEvent = events.emit.bind(null, 'reader-enchantments');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'enchantment' && $('home-page .categories .category-active').text() === 'Enchant') {
            readEnchantmentsScreen();
        }
    }

    function readEnchantmentsScreen() {
        const enchantments = {};
        $('home-page .categories + .card button').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const structure = structuresCache.byName[name];
            if(!structure) {
                return;
            }
            const level = util.parseNumber(element.find('.level').text());
            enchantments[structure.id] = level;
        });
        emitEvent({
            type: 'full',
            value: enchantments
        });
    }

    initialise();

}
