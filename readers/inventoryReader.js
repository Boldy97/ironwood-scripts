(events, itemCache, util, itemUtil) => {

    const emitEvent = events.emit.bind(null, 'reader-inventory');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'inventory') {
            readInventoryScreen();
        }
        if(page.type === 'action') {
            readActionScreen();
        }
        if(page.type === 'taming' && page.menu === 'expeditions') {
            readExpeditionsScreen();
        }
    }

    function readInventoryScreen() {
        const inventory = {};
        $('inventory-page .items > .item').each((i,element) => {
            itemUtil.extractItem(element, inventory, true);
        });
        emitEvent({
            type: 'full',
            value: inventory
        });
    }

    function readActionScreen() {
        const inventory = {};
        $('skill-page .header > .name:contains("Materials")').closest('.card').find('.row').each((i,element) => {
            itemUtil.extractItem(element, inventory);
        });
        emitEvent({
            type: 'partial',
            value: inventory
        });
    }

    function readExpeditionsScreen() {
        const inventory = {};
        $('taming-page .heading:contains("Materials") + button').each((i,element) => {
            itemUtil.extractItem(element, inventory);
        });
        emitEvent({
            type: 'partial',
            value: inventory
        });
    }

    initialise();

}
