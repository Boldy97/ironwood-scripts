() => {

    const exports = {
        error,
        get
    };

    const errors = [];

    function error() {
        errors.push({
            time: Date.now(),
            value: [...arguments]
        });
    }

    function get() {
        return errors;
    }

    return exports;

}