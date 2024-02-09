(Promise) => {

    const exports = {
        exists,
        childAdded,
        childAddedContinuous,
        idle
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

    async function idle() {
        const promise = new Promise.Expiring(1000, 'elementWatcher - idle');
        window.requestIdleCallback(() => {
            promise.resolve();
        });
        return promise;
    }

    return exports;

}
