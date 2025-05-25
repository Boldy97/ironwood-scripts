() => {
    const keyHandlers = new Map();

    const exports = {
        attach,
        detach,
        detachAll
    };

    function initialise() {
        $(window).on('keydown._globalKeyManager', onKeydown);
    }

    function onKeydown(e) {
        console.log('Key pressed:', e.key);
        const el = document.activeElement;
        const isUserFocusable =
            el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.tagName === 'BUTTON' ||
            el.isContentEditable;

        const key = e.key.toLowerCase();
        const handler = keyHandlers.get(key);

        if (!handler) return;

        if (isUserFocusable && !handler.override) return;

        console.log(`Key handler found for: ${key}`);
        e.preventDefault();
        handler.callback(e);
    }

    function attach(key, callback, override = false) {
        if (typeof key !== 'string' || typeof callback !== 'function' || key.trim() === '') return;

        const normalizedKey = key.trim().toLowerCase();
        keyHandlers.set(normalizedKey, { callback, override });
        console.log(keyHandlers);
    }

    function detach(key) {
        if (typeof key !== 'string' || key.trim() === '') return;

        const normalizedKey = key.trim().toLowerCase();
        keyHandlers.delete(normalizedKey);
        console.log(keyHandlers);
    }

    function detachAll() {
        keyHandlers.clear();
    }

    initialise();

    return exports;
}
