(configuration, util, elementWatcher, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'market-price-buttons',
            name: 'Price buttons',
            default: true,
            handler: handleConfigStateChange
        });
        $(document).on('click', 'market-list-component .search ~ button.row', () => addPriceButtons('sell'));
        $(document).on('click', 'market-order-component .search ~ button.row', () => addPriceButtons('order'));
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function createButton(text, getPrice, priceRowInput) {
        const baseColor = colorMapper('componentRegular');
        const hoverColor = colorMapper('componentHover');
        const mouseDownColor = colorMapper('componentSelected');

        const element = $(`<button class='myButton'>${text}</button>`)
            .css('background-color', baseColor)
            .css('display', 'inline-block')
            .css('padding', '5px')
            .css('margin', '5px')
            .hover(
                (event) => $(event.currentTarget).css('background-color', hoverColor),
                (event) => $(event.currentTarget).css('background-color', baseColor),
            )
            .on('mousedown', (event) => $(event.currentTarget).css('background-color', mouseDownColor))
            .on('mouseup mouseleave', (event) => $(event.currentTarget).css('background-color', baseColor));

        element.click(() => {
            const price = getPrice();
            priceRowInput.val(price);
            priceRowInput[0].dispatchEvent(new Event('input', {bubbles: true}));
        });

        return element;
    }

    function findPrice(name) {
        return util.parseNumber($(`.modal .row:not(.item-description):contains("${name}")`).text());
    }

    async function addPriceButtons(type) {
        if(!enabled) {
            return;
        }
        const priceRowInput = $(await elementWatcher.exists('.modal input[placeholder="Price"]', 200));
        const priceRowButtonsContainer = $('#market-component-price-buttons');
        if(priceRowButtonsContainer.length) {
            return;
        }

        const buttonsContainer = $('<div/>')
            .attr('id', 'market-component-price-buttons');

        const minButton = createButton('Min', () => findPrice('Minimum'), priceRowInput);
        buttonsContainer.append(minButton);
        if(type === 'order') {
            const marketHighestButton = createButton('High', () => findPrice('Market Highest'), priceRowInput);
            buttonsContainer.append(marketHighestButton);
        }
        if(type === 'sell') {
            const marketLowestButton = createButton('Low', () => findPrice('Market Lowest'), priceRowInput);
            buttonsContainer.append(marketLowestButton);
        }

        $(priceRowInput).before(buttonsContainer);
    }

    initialise();
}
