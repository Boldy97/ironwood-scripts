(Promise, elementCreator) => {

    const loaded = new Promise.Deferred('scriptRegistry');

    const exports = {
        isLoaded
    };

    async function initialise() {
        const promises = [
            elementCreator.addScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'),
            elementCreator.addScript('https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js'),
            elementCreator.addScript('https://code.jquery.com/ui/1.14.1/jquery-ui.js'),
        ];
        await window.Promise.all(promises);
        loaded.resolve();
    }

    function isLoaded() {
        return loaded;
    }

    initialise();

    return exports;

}
