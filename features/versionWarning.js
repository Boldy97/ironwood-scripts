(events, request, toast) => {

    function initialise() {
        events.register('xhr', handleXhr);
    }

    async function handleXhr(xhr) {
        if(!xhr.url.endsWith('/getUser')) {
            return;
        }
        const version = await request.getVersion();
        if(!window.PANCAKE_VERSION || version === window.PANCAKE_VERSION) {
            return;
        }
        toast.create({
            text: `<a href='https://greasyfork.org/en/scripts/475356-ironwood-rpg-pancake-scripts' target='_blank'>Consider updating Pancake-Scripts to ${version}!<br>Click here to go to GreasyFork</a`,
            image: 'https://img.icons8.com/?size=48&id=iAqIpjeFjcYz&format=png',
            time: 5000
        });
    }

    initialise();

}
