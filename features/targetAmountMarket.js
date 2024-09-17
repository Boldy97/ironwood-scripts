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
        elementWatcher.addRecursiveObserver(onListingOpened, 'app-component > div.scroll div.wrapper', 'market-page', 'market-order-component', 'div.groups', 'div.sticky', 'div.modal');
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onListingOpened(element) {
        if(!enabled) {
            return;
        }
        const otherButton = getOtherButton(element);
        if(!otherButton.length) {
            return; // avoid triggering on other elements
        }
        const input = getInput(element);
        const targetButton = createTargetButton(otherButton);
        attachInputListener(input, targetButton, element);
        attachTargetButtonListener(input, targetButton, element);
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
            }).text()) || Infinity;
    }

    function getInput(element) {
        return $(element).find('input[placeholder=Quantity]');
    }

    function getOtherButton(element) {
        return $(element).find('button.action:contains("Buy"),button.action:contains("Order")');
    }

    function createTargetButton(buyButton) {
        const targetButton = buyButton.clone()
            .text('Target')
            .css('background-color', colorMapper('componentLight'));
        buyButton.before(targetButton);
        return targetButton;
    }

    function attachInputListener(input, targetButton, element) {
        input.on('change paste keyup input', function() {
            const value = +input.val();
            const ownedAmount = getOwnedAmount(element);
            const availableAmount = getAvailableAmount(element);
            if(!!value && value > ownedAmount && value - ownedAmount <= availableAmount) {
                targetButton.removeAttr('disabled');
            } else {
                targetButton.attr('disabled', true);
            }
        });
    }

    function attachTargetButtonListener(input, targetButton, element) {
        targetButton.on('click', function() {
            const value = +input.val();
            const ownedAmount = getOwnedAmount(element);
            input.val(value - ownedAmount);
            input[0].dispatchEvent(new Event('input'));
            return false;
        });
    }

    initialise();

}
