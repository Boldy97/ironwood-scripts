() => {

    const exports = {
        register,
        emit,
        getLast,
        getLastCache
    };

    const handlers = {};
    const lastCache = {};

    function register(name, handler) {
        if(!handlers[name]) {
            handlers[name] = [];
        }
        handlers[name].push(handler);
        if(lastCache[name]) {
            handle(handler, lastCache[name], name);
        }
    }

    // options = { skipCache }
    function emit(name, data, options) {
        if(!options?.skipCache) {
            lastCache[name] = data;
        }
        if(!handlers[name]) {
            return;
        }
        for(const handler of handlers[name]) {
            handle(handler, data, name);
        }
    }

    function handle(handler, data, name) {
        try {
            handler(data, name);
        } catch(e) {
            console.error('Something went wrong', e);
        }
    }

    function getLast(name) {
        return lastCache[name];
    }

    function getLastCache() {
        return lastCache;
    }

    return exports;

}
