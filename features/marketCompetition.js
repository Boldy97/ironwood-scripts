(configuration, events, toast, util, elementCreator, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'market-competition',
            name: 'Market competition indicator',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('state-market', handleMarketData);
        elementCreator.addStyles(styles);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleMarketData(marketData) {
        if(!enabled || marketData.lastType !== 'OWN') {
            return;
        }
        const page = events.getLast('page');
        if(page.type !== 'market') {
            return;
        }
        showToasts(marketData);
        showCircles(marketData);
    }

    function showToasts(marketData) {
        if(!marketData.SELL) {
            toast.create({
                text: 'Missing "Buy" listing data for the competition checker'
            });
        }
        if(!marketData.BUY) {
            toast.create({
                text: 'Missing "Orders" listing data for the competition checker'
            });
        }
    }

    function showCircles(marketData) {
        $('.market-competition').remove();
        for(const listing of marketData.OWN) {
            if(!marketData[listing.type]) {
                continue;
            }
            const matching = marketData[listing.type].filter(a => !a.isOwn && a.item === listing.item);
            const same = matching.filter(a => a.price === listing.price);
            const better = matching.filter(a =>
                (listing.type === 'SELL' && a.price < listing.price) ||
                (listing.type === 'BUY' && a.price > listing.price)
            );
            if(!same.length && !better.length) {
                continue;
            }
            const color = better.length ? 'danger' : 'warning';
            const text = better.concat(same)
                    .map(a => `${util.formatNumber(a.amount)} @ ${util.formatNumber(a.price)}`)
                    .join(' / ');
            listing.element.find('.cost').before(`<div class='market-competition market-competition-${color}' title='${text}'></div>`);
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
