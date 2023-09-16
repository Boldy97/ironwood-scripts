() => {

    class Deferred {
        promise;
        resolve;
        reject;
        constructor() {
            this.promise = new Promise((resolve, reject)=> {
                this.resolve = resolve;
                this.reject = reject;
            }).catch(error => {
                if(error) {
                    console.warn(error);
                }
                throw error;
            });
        }
    }

    class Delayed extends Deferred {
        constructor(timeout) {
            super();
            const timeoutReference = window.setTimeout(() => {
                this.resolve();
            }, timeout);
            this.promise.finally(() => {
                window.clearTimeout(timeoutReference)
            });
        }
    }

    class Expiring extends Deferred {
        constructor(timeout) {
            super();
            const timeoutReference = window.setTimeout(() => {
                this.reject(`Timed out after ${timeout} ms`);
            }, timeout);
            this.promise.finally(() => {
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
            this.promise.finally(() => {
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
