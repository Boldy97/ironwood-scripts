(events, elementWatcher, itemCache, util) => {

    const emitEvent = events.emit.bind(null, 'reader-market');
    let inProgress = false;

    const exports = {
        trigger: update
    };

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 10000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'market') {
            readMarketScreen();
        }
    }

    async function readMarketScreen() {
        if(inProgress) {
            return;
        }
        try {
            inProgress = true;
            const selectedTab = $('market-listings-component .card > .tabs > button.tab-active').text().toLowerCase();
            const type = selectedTab === 'orders' ? 'BUY' : selectedTab === 'listings' ? 'OWN' : 'SELL';
            await elementWatcher.exists('market-listings-component .search ~ button', undefined, 10000);
            if($('market-listings-component .search > input').val()) {
                return;
            }
            const listings = [];
            $('market-listings-component .search ~ button').each((i,element) => {
                element = $(element);
                const name = element.find('.name').text();
                const item = itemCache.byName[name];
                if(!item) {
                    return;
                }
                const amount = util.parseNumber(element.find('.amount').text());
                const price = util.parseNumber(element.find('.cost').text());
                const listingType = type !== 'OWN' ? type : element.find('.tag').length ? 'BUY' : 'SELL';
                const isOwn = !!element.attr('disabled');
                listings.push({
                    type: listingType,
                    item: item.id,
                    amount,
                    price,
                    isOwn,
                    element
                });
            });
            emitEvent({
                type,
                listings,
            });
        } catch(e) {
            console.error('error in market reader', e);
            return;
        } finally {
            inProgress = false;
        }
    }

    initialise();

    return exports;

}
