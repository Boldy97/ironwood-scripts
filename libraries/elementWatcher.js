(Promise) => {

    const exports = {
        exists,
        childAdded,
        childAddedContinuous
    }

    const $ = window.$;

    async function exists(selector, delay, timeout, inverted) {
        delay = delay !== undefined ? delay : 10;
        timeout = timeout !== undefined ? timeout : 5000;
        const promiseWrapper = new Promise.Checking(() => {
            let result = $(selector)[0];
            return inverted ? !result : result;
        }, delay, timeout);
        return promiseWrapper;
    }

    async function childAdded(selector) {
        const promiseWrapper = new Promise.Expiring(5000);

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
            for(const mutation of mutations) {
                if(mutation.addedNodes?.length) {
                    callback();
                }
            }
        });
        observer.observe(parent, { childList: true });
    }

    return exports;

}
