() => {

    const exports = {
        error,
        get
    };

    const errors = [];

    function initialise() {
        window.onerror = function(message, url, lineNumber, columnNumber, error) {
            errors.push({
                time: Date.now(),
                message,
                url,
                lineNumber,
                columnNumber,
                error
            });
            return false;
        };
    }

    function error() {
        errors.push({
            time: Date.now(),
            value: [...arguments]
        });
    }

    function get() {
        return errors;
    }

    initialise();

    return exports;

}