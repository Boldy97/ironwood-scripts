(configuration, localDatabase, events) => {
    let enabled = false;
    let updateInterval = null;
    let marketPageActive = false;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'market-sell-price-buttons',
            name: 'Market sell-price buttons',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', pageChangeHandler);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function pageChangeHandler(page) {
        if (!enabled) {
            return;
        }

        marketPageActive = page.type === 'market';

        if (marketPageActive) {
            if (updateInterval === null) {
                updateInterval = setInterval(addPriceButtonsIfSellWindowOpen, 200);
            }
        } else {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }

    function createButton(text, onClick) {
        const element = $(`<button class='myButton'>${text}</button>`)
            .css('background-color', '#28211b')
            .css('display', 'inline-block')
            .css('padding', '5px')
            .css('margin', '5px');

        if (onClick) {
            element.click(onClick);
        }

        return element;
    }

    const ListingPrice = {
        Min: 5,
        MarketLowest: 6
    }

    function findPrice(listingRowIndex) {
        return $(`market-list-component > div > div:nth-child(2) > div > div:nth-child(${listingRowIndex})`).contents().filter((_, node) => node.nodeType === 3).text().trim();
    }

    function addPriceButtonsIfSellWindowOpen() {
        const priceRowInput = $('market-list-component div>input[placeholder="Price"]').first();
        const priceRowButtonsContainer = $('#market-list-component-price-buttons');

        if (priceRowInput.length > 0 && priceRowButtonsContainer.length === 0) {
            const minButton = createButton('Min', () => {
                const minPrice = findPrice(ListingPrice.Min);
                priceRowInput.val(minPrice);
            });

            const marketLowestButton = createButton('Low', () => {
                const marketLowestPrice = findPrice(ListingPrice.MarketLowest);
                priceRowInput.val(marketLowestPrice);
            });

            const buttonsContainer = $('<div/>')
                .attr('id', 'market-list-component-price-buttons')
                .append(minButton)
                .append(marketLowestButton);

            $(priceRowInput).before(buttonsContainer);
        }
    }

    initialise();
}
