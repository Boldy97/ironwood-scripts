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
        keyHandlers.set(key.toLowerCase(), callback);
    }

    function detachAll() {
        keyHandlers.clear();
    }

    initialise();

    return exports;
}
