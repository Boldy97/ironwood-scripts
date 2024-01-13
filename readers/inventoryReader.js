(events, itemCache, util, itemUtil) => {

    const emitEvent = events.emit.bind(null, 'reader-inventory');

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
        if(currentPage.type === 'inventory') {
            readInventoryScreen();
        }
        if(currentPage.type === 'action') {
            readActionScreen();
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

    initialise();

}
