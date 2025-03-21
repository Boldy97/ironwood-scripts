(events) => {

    function initialise() {
        registerInterceptorUrlChange();
        events.emit('url', window.location.href);
    }

    function registerInterceptorUrlChange() {
        const pushState = history.pushState;
        history.pushState = function() {
            pushState.apply(history, arguments);
            events.emit('url', arguments[2]);
        };
        const replaceState = history.replaceState;
        history.replaceState = function() {
            replaceState.apply(history, arguments);
            events.emit('url', arguments[2]);
        }
    }

    initialise();

}
