(Promise) => {

    const authenticated = new Promise.Deferred();
    let TOKEN = null;

    const exports = {
        ready: authenticated.promise,
        isReady: false,
        register,
        getHeaders
    };

    function initialise() {
        window.setTimeout(addAuthenticatedMarker, 3000);
    }

    function addAuthenticatedMarker() {
        if(!TOKEN) {
            $('.logo').append(`<span id='authenticatedMarker' style='color: #ffffff80;font-size:.75rem;margin-left:8px;margin-bottom:16px;font-weight:400'>:'(</span>`);
        }
    }

    function register(name, password) {
        TOKEN = 'Basic ' + btoa(name + ':' + password);
        authenticated.resolve();
        exports.isReady = true;
        $('#authenticatedMarker').remove();
    }

    function getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': TOKEN
        };
    }

    initialise();

    return exports;

}
