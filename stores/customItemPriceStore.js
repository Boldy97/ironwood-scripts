(localDatabase, itemCache, Promise) => {

    const STORE_NAME = 'item-price';
    let prices = {};

    const exports = {
        get,
        set
    };

    const initialised = new Promise.Expiring(2000, 'customItemPriceStore');

    async function initialise() {
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        prices = {};
        for(const entry of entries) {
            prices[entry.key] = entry.value;
        }
        initialised.resolve(exports);
    }

    function get(id) {
        if(prices[id]) {
            return prices[id];
        }
        return getDefault(+id);
    }

    function getDefault(id) {
        if(id === itemCache.specialIds.coins) {
            return 1;
        }
        if(id === itemCache.specialIds.charcoal) {
            return get(itemCache.byName['Pine Log'].id);
        }
        if(id === itemCache.specialIds.stardust) {
            return 2;
        }
        if(id === itemCache.specialIds.masteryContract) {
            return 2;
        }
        const item = itemCache.byId[id];
        if(item.attributes['UNTRADEABLE']) {
            return item.attributes.SELL_PRICE;
        }
        return item.attributes.MIN_MARKET_PRICE;
    }

    async function set(id, price) {
        if(!price || price === getDefault(id)) {
            await localDatabase.removeEntry(STORE_NAME, id);
            delete prices[id];
            return;
        }
        await localDatabase.saveEntry(STORE_NAME, {
            key: id,
            value: price
        });
        prices[id] = price;
    }

    initialise();

    return initialised;

}
