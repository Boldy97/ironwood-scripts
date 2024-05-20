(Promise) => {

    const exports = {
        exists,
        childAdded,
        childAddedContinuous,
        idle,
        addRecursiveObserver
    }

    const $ = window.$;

    async function exists(selector, delay, timeout, inverted) {
        delay = delay !== undefined ? delay : 10;
        timeout = timeout !== undefined ? timeout : 5000;
        const promiseWrapper = new Promise.Checking(() => {
            let result = $(selector)[0];
            return inverted ? !result : result;
        }, delay, timeout, `elementWatcher - exists - ${selector}`);
        return promiseWrapper;
    }

    async function childAdded(selector) {
        const promiseWrapper = new Promise.Expiring(5000, `elementWatcher - childAdded - ${selector}`);

        try {
            const parent = await exists(selector);
            const observer = new MutationObserver(function(mutations, observer) {
                for(const mutation of mutations) {
                    if(mutation.addedNodes?.length) {
                        observer.disconnect();
                        promiseWrapper.resolve();
                    }
                }
            });
            observer.observe(parent, { childList: true });
        } catch(error) {
            promiseWrapper.reject(error);
        }

        return promiseWrapper;
    }

    async function childAddedContinuous(selector, callback) {
        const parent = await exists(selector);
        const observer = new MutationObserver(function(mutations, observer) {
            if(mutations.find(a => a.addedNodes?.length)) {
                callback();
            }
        });
        observer.observe(parent, { childList: true });
    }

    async function addRecursiveObserver(callback, ...chain) {
        const root = await exists(chain[0]);
        chain = chain.slice(1).map(a => a.toUpperCase());
        _addRecursiveObserver(callback, root, chain);
    }

    function _addRecursiveObserver(callback, element, chain) {
        if(chain.length === 0) {
            callback(element);
        }
        const observer = new MutationObserver(function(mutations, observer) {
            const match = mutations
                .flatMap(a => Array.from(a.addedNodes))
                .find(a => a.tagName === chain[0]);
            if(match) {
                _addRecursiveObserver(callback, match, chain.slice(1));
            }
        });
        observer.observe(element, { childList: true });
        for(const child of element.children) {
            if(child.tagName === chain[0]) {
                _addRecursiveObserver(callback, child, chain.slice(1));
            }
        }
    }

    async function idle() {
        const promise = new Promise.Expiring(1000, 'elementWatcher - idle');
        window.requestIdleCallback(() => {
            promise.resolve();
        });
        return promise;
    }

    return exports;

}
