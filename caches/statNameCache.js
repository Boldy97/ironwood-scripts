(request) => {

    const exports = {
        list: [],
        byName: {},
        validate
    };

    async function initialise() {
        const stats = await request.listItemStats();
        stats.push('MAX_AMOUNT'); // frontend only
        for(const stat of stats) {
            exports.list.push(stat);
            exports.byName[stat] = stat;
        }
        return exports;
    }

    function validate(name) {
        if(!exports.byName[name]) {
            throw `Unsupported stat usage : ${name}`;
        }
    }

    return initialise();

}