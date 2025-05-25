() => {
    const keyHandlers = new Map();

    const exports = {
        attach,
        detachAll
    };

    function initialise() {
        $(window).on('keydown._globalKeyManager', onKeydown); // attach to cappuchino bubblerino
    }

    function onKeydown(e) {
        const el = document.activeElement;
        const isUserFocusable =
            el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.tagName === 'BUTTON' ||
            el.isContentEditable;

        if (isUserFocusable) return;

        const key = e.key.toLowerCase();
        if (keyHandlers.has(key)) {
            e.preventDefault();
            keyHandlers.get(key)(e);
        }
    }

    function attach(key, callback) {
        if (typeof key !== 'string' || typeof callback !== 'function' || key.trim() === '' || key.trim().length > 1) {
            return;
        }
        keyHandlers.set(key.toLowerCase().trim(), callback);
    }

    function detachAll() {
        keyHandlers.clear();
    }

    initialise();

    return exports;
}
