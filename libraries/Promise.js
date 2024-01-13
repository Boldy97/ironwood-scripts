() => {

    class Deferred {
        #promise;
        resolve;
        reject;
        constructor() {
            this.#promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            }).catch(error => {
                if(error) {
                    console.warn(error);
                }
                throw error;
            });
        }

        then() {
            this.#promise.then.apply(this.#promise, arguments);
            return this;
        }

        catch() {
            this.#promise.catch.apply(this.#promise, arguments);
            return this;
        }

        finally() {
            this.#promise.finally.apply(this.#promise, arguments);
            return this;
        }
    }

    class Delayed extends Deferred {
        constructor(timeout) {
            super();
            const timeoutReference = window.setTimeout(() => {
                this.resolve();
            }, timeout);
            this.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Expiring extends Deferred {
        constructor(timeout) {
            super();
            if(timeout <= 0) {
                return;
            }
            const timeoutReference = window.setTimeout(() => {
                this.reject(`Timed out after ${timeout} ms`);
            }, timeout);
            this.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Checking extends Expiring {
        #checker;
        constructor(checker, interval, timeout) {
            super(timeout);
            this.#checker = checker;
            this.#check();
            const intervalReference = window.setInterval(this.#check.bind(this), interval);
            this.finally(() => {
                window.clearInterval(intervalReference)
            });
        }
        #check() {
            const checkResult = this.#checker();
            if(!checkResult) {
                return;
            }
            this.resolve(checkResult);
        }
    }

    return {
        Deferred,
        Delayed,
        Expiring,
        Checking
    };

}
