(events, configuration, colorMapper) => {

    const LISTING_LIMIT = 250;
    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'market-listing-limit-warning',
            name: 'Listing limit warning',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('reader-market', update);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update(marketData) {
        $('.market-listing-limit-warning').remove();
        if(!enabled) {
            return;
        }
        if(marketData.type === 'OWN') {
            return;
        }
        if(marketData.count <= LISTING_LIMIT) {
            return;
        }
        if(marketData.listings.length < LISTING_LIMIT) {
            return;
        }
        $('market-page .count').before(`
            <div class='market-listing-limit-warning' style='background-color:${colorMapper('componentLight')};white-space:nowrap;display:flex;align-items:center;padding:.4em;border-radius:.4em;gap:.4em'>
                <img src='https://img.icons8.com/?size=24&id=EggHJUeUuU6C' style='width:24px;height:24px'></img>
                <span>Not all listings visible</span>
            </div>
        `);
    }

    initialise();

}
