(configuration, events, userStore, itemStore, colorMapper, util, elementCreator, Promise) => {

    const isReady = new Promise.Deferred();
    let enabled = false;
    let markedListings = [];

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'market-competition',
            name: 'Market competition indicator',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('xhr', handleXhr);
        $(document).on('click', 'market-listings-component .card > .tabs > button:last-child', render);
        elementCreator.addStyles(styles);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    async function handleXhr(xhr) {
        if(!enabled || !xhr.url.endsWith('getMarketItems')) {
            return;
        }
        await itemStore.ready;
        const listings = xhr.response.listings;
        await processListings(listings, '1', (a,b) => a < b); // sell
        await processListings(listings, '2', (a,b) => a > b); // buy
        markedListings = listings
            .filter(a => a.color)
            .map(a => ({
                color: a.color,
                competitors: a.competitors,
                key: `${itemStore.byId[a.itemId].name}-${a.cost}`
            }));
        isReady.resolve();
    }

    async function processListings(listings, type, comparator) {
        await userStore.ready;
        const ownedListings = listings
            .filter(a => a.name === userStore.name)
            .filter(a => a.type === type);
        for(const listing of ownedListings) {
            const otherListings = listings
                .filter(a => a.itemId === listing.itemId)
                .filter(a => a.type === type)
                .filter(a => a.name !== userStore.name);
            const warnListings = otherListings.filter(a => a.cost === listing.cost);
            const dangerListings = otherListings.filter(a => comparator(a.cost, listing.cost));
            if(warnListings.length) {
                listing.color = 'warning';
                listing.competitors = warnListings.map(a => a.name);
            }
            if(dangerListings.length) {
                listing.color = 'danger';
                listing.competitors = dangerListings.map(a => a.name);
            }
        }
    }

    async function render() {
        if(!enabled) {
            return;
        }
        $('.market-competition').remove();
        await isReady.promise;
        const elements = $('market-listings-component .search ~ button').map(function(index,reference) {
            reference = $(reference);
            return {
                name: reference.find('.name').text(),
                price: util.parseNumber(reference.find('.cost').text()),
                reference: reference
            };
        }).toArray();
        for(const element of elements) {
            element.key = `${element.name}-${element.price}`;
        }
        for(const listing of markedListings) {
            const match = elements.find(a => a.key === listing.key);
            const title = listing.competitors.join(', ');
            match.reference.find('.cost').before(`<div class='market-competition market-competition-${listing.color}' title='${title}'></div>`);
        }

    }

    const styles = `
        .market-competition {
            width: 16px;
            height: 16px;
            border-radius: 50%;
        }

        .market-competition-warning {
            background-color: ${colorMapper('warning')}
        }

        .market-competition-danger {
            background-color: ${colorMapper('danger')}
        }
    `;

    initialise();

}
