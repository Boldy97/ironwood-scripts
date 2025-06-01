(Promise, localConfigurationStore, _remoteConfigurationStore) => {

    const initialised = new Promise.Expiring(2000, 'configurationStore');
    let configs = null;

    const exports = {
        save,
        getConfigs
    };

    const configurationStore = _remoteConfigurationStore || localConfigurationStore;

    async function initialise() {
        configs = await configurationStore.load();
        for (const key in configs) {
            configs[key] = JSON.parse(configs[key]);
        }
        initialised.resolve(exports);
    }

    async function save(key, value) {
        await configurationStore.save(key, value);
        configs[key] = value;
    }

    function getConfigs() {
        return configs;
    }

    initialise();

    return initialised;

}
