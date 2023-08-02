() => {

    const exports = {
        registerName,
        getHeaders,
        authenticated,
        isAuthenticated
    };

    let TOKEN = null;
    let TOKEN_PROMISE = null;
    let TOKEN_PROMISE_RESOLVE = null;

    function initialise() {
        TOKEN_PROMISE = new Promise(r => {
            TOKEN_PROMISE_RESOLVE = r;
        });
        window.setTimeout(addAuthenticatedMarker, 3000);
    }

    function addAuthenticatedMarker() {
        if(!TOKEN) {
            $('.logo').append(`<span id='authenticatedMarker' style='color: #ffffff80;font-size:.75rem;margin-left:8px;margin-bottom:16px;font-weight:400'>:'(</span>`);
        }
    }

    function registerName(name, skipResolve) {
        TOKEN = 'Basic ' + btoa(name + ":");
        TOKEN_PROMISE_RESOLVE();
        $('#authenticatedMarker').remove();
    }

    function getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': TOKEN
        };
    }

    function isAuthenticated() {
        return !!TOKEN;
    }

    async function authenticated() {
        return TOKEN_PROMISE;
    }

    initialise();

    return exports;

}
