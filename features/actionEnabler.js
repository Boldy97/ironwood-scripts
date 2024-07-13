(configuration, events) => {

    let enabled = false;

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'action-enabler',
            name: 'Action Enabler',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('page', handlePage);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handlePage(page) {
        if(!enabled ||page.type !== 'action') {
            return;
        }
        $('skill-page .header > .name:contains("Actions")')
            .closest('.card')
            .find('button[disabled]')
            .not('.container > button')
            .removeAttr('disabled')
            .find('.level')
            .css('color', '#db6565');
    }

    initialise();

}
