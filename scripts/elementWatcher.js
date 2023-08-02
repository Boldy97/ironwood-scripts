(Promise) => {

    const exports = {
        exists,
        childAdded,
        childAddedContinuous
    }

    const $ = window.$;

    async function exists(selector) {
        const promiseWrapper = new Promise.Checking(() => {
            return $(selector)[0];
        }, 10, 5000);
        return promiseWrapper.promise;
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

        return promiseWrapper.promise;
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
