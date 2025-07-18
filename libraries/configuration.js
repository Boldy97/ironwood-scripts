(configurationStore) => {

    const exports = {
        registerCheckbox,
        registerInput,
        registerDropdown,
        registerButton,
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

    const BUTTON_KEYS = ['category', 'key', 'name', 'handler'];
    function registerButton(item) {
        validate(item, BUTTON_KEYS);
        return register(Object.assign(item, {
            type: 'button'
        }));
    }

    function register(item) {
        const handler = item.handler;
        item.handler = (value, isInitial) => {
            item.value = value;
            handler(value, item.key, isInitial);
            if (!isInitial) {
                save(item, value);
            }
        }
        let initialValue;
        if (item.key in configs) {
            initialValue = configs[item.key];
        } else {
            initialValue = item.default;
        }
        item.handler(initialValue, true);
        exports.items.push(item);
        return item;
    }

    async function save(item, value) {
        if (item.type === 'button') {
            return;
        }
        if (item.type === 'toggle') {
            value = !!value;
        }
        if (item.type === 'input' || item.type === 'json' || item.type === 'dropdown') {
            value = JSON.stringify(value);
        }
        await configurationStore.save(item.key, value);
    }

    function validate(item, keys) {
        for (const key of keys) {
            if (!(key in item)) {
                throw `Missing ${key} while registering a configuration item`;
            }
        }
    }

    return exports;

}
