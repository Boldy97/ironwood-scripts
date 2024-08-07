(request, toast, statsStore, EstimationGenerator, logService, events, util) => {

    const exports = {
        submit
    };

    async function submit() {
        const data = get();
        try {
            await forward(data);
        } catch(e) {
            exportToClipboard(data);
        }
    }

    function get() {
        return {
            stats: statsStore.get(),
            state: (new EstimationGenerator()).export(),
            logs: logService.get(),
            events: events.getLastCache()
        };
    }

    async function forward(data) {
        await request.report(data);
        toast.create({
            text: 'Forwarded debug data',
            image: 'https://img.icons8.com/?size=48&id=13809'
        });
    }

    function exportToClipboard(data) {
        toast.copyToClipboard(JSON.stringify(data), 'Failed to forward, exported to clipboard instead');
    }

    return exports;

}