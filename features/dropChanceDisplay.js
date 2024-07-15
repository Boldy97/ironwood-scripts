(configuration, events, dropCache, itemCache, util) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'drop-chance-display',
            name: 'Drop Chance Display',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', handlePage);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePage(page) {
        if(!enabled || page.type !== 'action') {
            return;
        }
        const list = $('action-drops-component .item')
            .toArray()
            .map(element => ({
                element,
                name: $(element).find('.name').text()
            }));
        if(!list.length) {
            return;
        }
        const drops = dropCache.byAction[page.action];
        list.forEach(a => {
            a.item = itemCache.byName[a.name];
            a.drop = drops.find(b => b.item === a.item.id);
        });
        $('.pancakeChance').remove();
        for(const a of list) {
            $(a.element).find('.chance').after(
                $(`<div class='pancakeChance'>&nbsp;(${util.formatNumber(100 * a.drop.chance)}%)</div>`)
                    .css('color', '#aaa')
            );
        }
    }

    initialise();

}
