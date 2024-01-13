(util, itemCache) => {

    const exports = {
        extractItem
    };

    function extractItem(element, target, ignoreMissing) {
        element = $(element);
        const name = element.find('.name').text();
        let item = itemCache.byName[name];
        if(!item) {
            const src = element.find('img').attr('src');
            if(src) {
                const image = src.split('/').at(-1);
                item = itemCache.byImage[image];
            }
        }
        if(!item) {
            if(!ignoreMissing) {
                console.warn(`Could not find item with name [${name}]`);
            }
            return false;
        }
        let amount = 1;
        let amountElements = element.find('.amount, .value');
        if(amountElements.length) {
            amount = amountElements.text();
            if(!amount) {
                return false;
            }
            if(amount.includes(' / ')) {
                amount = amount.split(' / ')[0];
            }
            amount = util.parseNumber(amount);
        }
        let uses = element.find('.uses, .use').text();
        if(uses && !uses.endsWith('HP')) {
            amount += util.parseNumber(uses);
        }
        target[item.id] = (target[item.id] || 0) + amount;
        return item;
    }

    return exports;

}
