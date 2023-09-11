(request, configuration) => {

    const exports = {
        register: register
    }

    function register(name, text, type) {
        const webhook = {
            type: type,
            enabled: false,
            url: ''
        };
        const category = configuration.registerCategory('webhook', 'Webhooks');
        const handler = handleConfigStateChange.bind(null, webhook);
        configuration.registerToggle(`${name}-enabled`, `${text} enabled`, false, handler, category);
        configuration.registerInput(name, 'Update', 'text', '', handler, category);
    }

    function handleConfigStateChange(webhook, state, name, initial) {
        if(name.endsWith('-enabled')) {
            webhook.enabled = state;
        } else {
            webhook.url = state;
        }
        if(!initial) {
            request.saveWebhook(webhook);
        }
    }

    return exports;

}
