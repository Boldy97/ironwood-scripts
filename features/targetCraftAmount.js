(configuration, elementWatcher, util, colorMapper) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'target-craft-amount',
            name: 'Target Craft Amount',
            default: true,
            handler: handleConfigStateChange
        });
        elementWatcher.addRecursiveObserver(onAmountModal, 'app-component > div.scroll div.wrapper', 'skill-page', 'modal-component');
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onAmountModal(modal) {
        if(!enabled) {
            return;
        }
        if(!$(modal).find('button.craft:contains("Craft")').length) {
            return; // avoid triggering on other modals
        }
        const ownedAmount = getOwnedAmount(modal);
        const input = getInput(modal);
        const craftButton = getCraftButton(modal);
        const targetButton = createTargetButton(modal, craftButton);
        attachInputListener(input, targetButton, ownedAmount);
        attachTargetButtonListener(input, targetButton, craftButton, ownedAmount);
    }

    function getOwnedAmount(modal) {
        return util.parseNumber($(modal).find('.row:contains("Owned")')
            .contents()
            .filter(function() {
                return this.nodeType === Node.TEXT_NODE;
            }).text());
    }

    function getInput(modal) {
        return $(modal).find('input[name=quantity]');
    }

    function getCraftButton(modal) {
        return $(modal).find('button.craft[type=submit]');
    }

    function createTargetButton(modal, craftButton) {
        const targetButton = craftButton.clone()
            .text('Target')
            .css('background-color', colorMapper('componentLight'));
        craftButton.after(targetButton);
        return targetButton;
    }

    function attachInputListener(input, targetButton, ownedAmount) {
        input.on('change paste keyup', function() {
            const value = +input.val();
            if(!!value && value > ownedAmount) {
                targetButton.removeAttr('disabled');
            } else {
                targetButton.attr('disabled', true);
            }
        });
    }

    function attachTargetButtonListener(input, targetButton, craftButton, ownedAmount) {
        targetButton.on('click', function() {
            const value = +input.val();
            input.val(value - ownedAmount);
            input[0].dispatchEvent(new Event('input'));
            craftButton.click();
            return false;
        });
    }

    initialise();

}
