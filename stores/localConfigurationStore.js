(localDatabase) => {

    const exports = {
        load,
        save
    };

    const databaseName = 'PancakeScripts';
    const storeName = 'settings';
    let database;

    async function load() {
        const entries = await localDatabase.getAllEntries(storeName);
        const configurations = {};
        for(const entry of entries) {
            configurations[entry.key] = entry.value;
        }
        return configurations;
    }

    async function save(key, value) {
        await localDatabase.saveEntry(storeName, {key, value});
    }

    return exports;

}
