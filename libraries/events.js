() => {

    const exports = {
        register,
        emit,
        getLast
    };

    const handlers = {};
    const lastCache = {};

    function register(name, handler) {
        if(!handlers[name]) {
            handlers[name] = [];
        }
        handlers[name].push(handler);
        if(lastCache[name]) {
            handle(handler, lastCache[name]);
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
            handle(handler, data);
        }
    }

    function handle(handler, data) {
        try {
            handler(data);
        } catch(e) {
            console.error('Something went wrong', e);
        }
    }

    function getLast(name) {
        return lastCache[name];
    }

    return exports;

}
