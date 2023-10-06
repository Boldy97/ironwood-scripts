(Promise) => {

    const exports = {
        getAllEntries,
        saveEntry
    }

    const isReady = new Promise.Deferred();
    let database = null;

    const databaseName = 'PancakeScripts';

    function initialise() {
        const request = window.indexedDB.open(databaseName, 1);
        request.onsuccess = function(event) {
            database = this.result;
            isReady.resolve();
        };
        request.onerror = function(event) {
            console.error(`Failed creating IndexedDB : ${event.target.errorCode}`);
        };
        request.onupgradeneeded = function(event) {
            console.debug('Creating IndexedDB');
            const db = event.target.result;
            const objectStore = db.createObjectStore('settings', { keyPath: 'key' });
            objectStore.createIndex('key', 'key', { unique: true });
        };
    }

    async function getAllEntries(storeName) {
        await isReady.promise;
        const result = new Promise.Expiring(1000);
        const entries = [];
        const store = database.transaction(storeName, 'readonly').objectStore(storeName);
        const request = store.openCursor();
        request.onsuccess = function(event) {
            const cursor = event.target.result;
            if(cursor) {
                entries.push(cursor.value);
                cursor.continue();
            } else {
                result.resolve(entries);
            }
        };
        request.onerror = function(event) {
            result.reject(event.error);
        };
        return result.promise;
    }

    async function saveEntry(storeName, entry) {
        await isReady.promise;
        const result = new Promise.Expiring(1000);
        const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
        const request = store.put(entry);
        request.onsuccess = function(event) {
            result.resolve();
        };
        request.onerror = function(event) {
            result.reject(event.error);
        };
        return result.promise;

    }

    initialise();

    return exports;

}
