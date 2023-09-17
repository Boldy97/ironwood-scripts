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
        const handler = handleConfigStateChange.bind(null, webhook);
        configuration.registerCheckbox({
            category: 'Webhooks',
            key: `${name}-enabled`,
            name: `${text} webhook enabled`,
            default: false,
            handler: handler
        });
        configuration.registerInput({
            category: 'Webhooks',
            key: name,
            name: `${text} webhook URL`,
            default: '',
            inputType: 'text',
            handler: handler
        });
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
