(events) => {

    function initialise() {
        registerInterceptorUrlChange();
        events.emit('url', window.location.href);
    }

    function registerInterceptorUrlChange() {
        const pushState = history.pushState;
        history.pushState = function() {
            pushState.apply(history, arguments);
            if (window['log-debug-messages']) console.debug(`Detected page ${arguments[2]}`);
            events.emit('url', arguments[2]);
        };
        const replaceState = history.replaceState;
        history.replaceState = function() {
            replaceState.apply(history, arguments);
            if (window['log-debug-messages']) console.debug(`Detected page ${arguments[2]}`);
            events.emit('url', arguments[2]);
        }
    }

    initialise();

}
