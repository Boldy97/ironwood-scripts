(Promise) => {

    const authenticated = new Promise.Deferred();
    let TOKEN = null;

    const exports = {
        ready: authenticated.promise,
        isReady: false,
        register,
        getHeaders
    };

    function register(name, password) {
        TOKEN = 'Basic ' + btoa(name + ':' + password);
        authenticated.resolve();
        exports.isReady = true;
    }

    function getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': TOKEN
        };
    }

    return exports;

}
