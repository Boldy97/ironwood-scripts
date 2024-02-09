(logService) => {

    class Deferred {
        #name;
        #promise;
        resolve;
        reject;
        constructor(name) {
            this.#name = name;
            this.#promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            }).catch(error => {
                if(error) {
                    console.warn(error);
                    logService.error(`error in ${this.constructor.name} (${this.#name})`, error);
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
        constructor(timeout, name) {
            super(name);
            const timeoutReference = window.setTimeout(() => {
                this.resolve();
            }, timeout);
            this.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Expiring extends Deferred {
        constructor(timeout, name) {
            super(name);
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
        constructor(checker, interval, timeout, name) {
            super(timeout, name);
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
