(localDatabase) => {

    const exports = {
        load,
        save
    };

    const STORE_NAME = 'settings';

    async function load() {
        const entries = await localDatabase.getAllEntries(STORE_NAME);
        const configurations = {};
        for(const entry of entries) {
            configurations[entry.key] = entry.value;
        }
        return configurations;
    }

    async function save(key, value) {
        await localDatabase.saveEntry(STORE_NAME, {key, value});
    }

    return exports;

}
