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
        let uses = 0;
        if(amountElements.length) {
            amountText = amountElements.text();
            if(!amountText) {
                return false;
            }
            if(amountText.includes(' / ')) {
                amountText = amountText.split(' / ')[0];
            }
            amount = util.parseNumber(amountText);
            if(amountText.includes('&')) {
                const usesText = amountText.split('&')[1];
                uses = util.parseNumber(usesText);
            }
        }
        if(!uses) {
            const usesText = element.find('.uses, .use').text();
            if(usesText && !usesText.endsWith('HP')) {
                uses = util.parseNumber(usesText);
            }
        }
        amount += uses;
        target[item.id] = (target[item.id] || 0) + amount;
        return item;
    }

    return exports;

}
