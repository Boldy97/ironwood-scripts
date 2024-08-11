(configuration, elementWatcher, util, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'target-market-amount',
            name: 'Target Amount',
            default: true,
            handler: handleConfigStateChange
        });
        elementWatcher.addRecursiveObserver(onListingOpened, 'app-component > div.scroll div.wrapper', 'market-page', 'market-listings-component', 'div.groups', 'div.sticky', 'div.preview');
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onListingOpened(element) {
        if(!enabled) {
            return;
        }
        const buyButton = getBuyButton(element);
        if(!buyButton.length) {
            return; // avoid triggering on other elements
        }
        const ownedAmount = getOwnedAmount(element);
        const availableAmount = getAvailableAmount(element);
        const input = getInput(element);
        const targetButton = createTargetButton(buyButton);
        attachInputListener(input, targetButton, ownedAmount, availableAmount);
        attachTargetButtonListener(input, targetButton, ownedAmount);
    }

    function getOwnedAmount(element) {
        return util.parseNumber($(element).find('.row:contains("Owned")')
            .contents()
            .filter(function() {
                return this.nodeType === Node.TEXT_NODE;
            }).text());
    }

    function getAvailableAmount(element) {
        return util.parseNumber($(element).find('.row:contains("Available")')
            .contents()
            .filter(function() {
                return this.nodeType === Node.TEXT_NODE;
            }).text());
    }

    function getInput(element) {
        return $(element).find('input[placeholder=Quantity]');
    }

    function getBuyButton(element) {
        return $(element).find('button.action:contains("Buy")');
    }

    function createTargetButton(buyButton) {
        const targetButton = buyButton.clone()
            .text('Target')
            .css('background-color', colorMapper('componentLight'));
        buyButton.before(targetButton);
        return targetButton;
    }

    function attachInputListener(input, targetButton, ownedAmount, availableAmount) {
        input.on('change paste keyup', function() {
            const value = +input.val();
            if(!!value && value > ownedAmount && value - ownedAmount <= availableAmount) {
                targetButton.removeAttr('disabled');
            } else {
                targetButton.attr('disabled', true);
            }
        });
    }

    function attachTargetButtonListener(input, targetButton, ownedAmount) {
        targetButton.on('click', function() {
            const value = +input.val();
            input.val(value - ownedAmount);
            input[0].dispatchEvent(new Event('input'));
            return false;
        });
    }

    initialise();

}
