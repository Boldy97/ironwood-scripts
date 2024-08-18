(configuration) => {

    function initialise() {
        configuration.registerCheckbox({
            category: 'Logging',
            key: 'log-debug-messages',
            name: 'Log Debug Messages',
            default: true,
            handler: handleConfigStateChange
        });
    }

    function handleConfigStateChange(state) {
        window['log-debug-messages'] = state;
    }

    initialise();
}