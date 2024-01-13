(events, itemCache, util, itemUtil) => {

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
        if(currentPage.type === 'equipment') {
            readEquipmentScreen();
        }
        if(currentPage.type === 'action') {
            readActionScreen();
        }
    }

    function readEquipmentScreen() {
        const equipment = {};
        const activeTab = $('equipment-page .categories button[disabled]').text().toLowerCase();
        $('equipment-page .header + .items > .item > .description').parent().each((i,element) => {
            itemUtil.extractItem(element, equipment);
        });
        events.emit(`reader-equipment-${activeTab}`, {
            type: 'full',
            value: equipment
        });
    }

    function readActionScreen() {
        const equipment = {};
        $('skill-page .header > .name:contains("Consumables")').closest('.card').find('button > .name:not(.placeholder)').parent().each((i,element) => {
            itemUtil.extractItem(element, equipment);
        });
        events.emit('reader-equipment-equipment', {
            type: 'partial',
            value: equipment
        });
    }

    initialise();

}
