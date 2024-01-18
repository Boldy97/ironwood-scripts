(Promise, configurationStore) => {

    const exports = {
        registerCheckbox,
        registerInput,
        registerDropdown,
        registerJson,
        items: []
    };

    const configs = configurationStore.getConfigs();

    const CHECKBOX_KEYS = ['category', 'key', 'name', 'default', 'handler'];
    function registerCheckbox(item) {
        validate(item, CHECKBOX_KEYS);
        return register(Object.assign(item, {
            type: 'checkbox'
        }));
    }

    const INPUT_KEYS = ['category', 'key', 'name', 'default', 'inputType', 'handler'];
    function registerInput(item) {
        validate(item, INPUT_KEYS);
        return register(Object.assign(item, {
            type: 'input'
        }));
    }

    const DROPDOWN_KEYS = ['category', 'key', 'name', 'options', 'default', 'handler'];
    function registerDropdown(item) {
        validate(item, DROPDOWN_KEYS);
        return register(Object.assign(item, {
            type: 'dropdown'
        }));
    }

    const JSON_KEYS = ['key', 'default', 'handler'];
    function registerJson(item) {
        validate(item, JSON_KEYS);
        return register(Object.assign(item, {
            type: 'json'
        }));
    }

    function register(item) {
        const handler = item.handler;
        item.handler = (value, isInitial) => {
            item.value = value;
            handler(value, item.key, isInitial);
            if(!isInitial) {
                save(item, value);
            }
        }
        if(item.key in configs) {
            value = configs[item.key];
        } else {
            value = item.default;
        }
        item.handler(value, true);
        exports.items.push(item);
        return item;
    }

    async function save(item, value) {
        if(item.type === 'toggle') {
            value = !!value;
        }
        if(item.type === 'input' || item.type === 'json') {
            value = JSON.stringify(value);
        }
        await configurationStore.save(item.key, value);
    }

    function validate(item, keys) {
        for(const key of keys) {
            if(!(key in item)) {
                throw `Missing ${key} while registering a configuration item`;
            }
        }
    }

    return exports;

}
