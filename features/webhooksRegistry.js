(webhooks) => {

    function initialise() {
        webhooks.register('webhook-update', 'Update', 'UPDATE');
        webhooks.register('webhook-guild', 'Guild', 'GUILD');
    }

    initialise();

}
