(auth, request, Promise) => {

    const authenticated = auth.ready;
    const isReady = new Promise.Deferred();

    const exports = {
        ready: isReady.promise,
        list: [],
        byId: null,
        byName: null,
        byImage: null,
        attributes: null
    };

    async function initialise() {
        await authenticated;
        const enrichedItems = await request.listItems();
        exports.byId = {};
        exports.byName = {};
        exports.byImage = {};
        for(const enrichedItem of enrichedItems) {
            const item = Object.assign(enrichedItem.item, enrichedItem);
            delete item.item;
            exports.list.push(item);
            exports.byId[item.id] = item;
            exports.byName[item.name] = item;
            const lastPart = item.image.split('/').at(-1);
            if(exports.byImage[lastPart]) {
                exports.byImage[lastPart].duplicate = true;
            } else {
                exports.byImage[lastPart] = item;
            }
            if(!item.attributes) {
                item.attributes = {};
            }
            if(item.charcoal) {
                item.attributes.CHARCOAL = item.charcoal;
            }
            if(item.compost) {
                item.attributes.COMPOST = item.compost;
            }
            if(item.speed) {
                item.attributes.SPEED = item.speed;
            }
        }
        for(const image of Object.keys(exports.byImage)) {
            if(exports.byImage[image].duplicate) {
                delete exports.byImage[image];
            }
        }
        exports.attributes = await request.listItemAttributes();
        exports.attributes.push({
            technicalName: 'CHARCOAL',
            name: 'Charcoal',
            image: '/assets/items/charcoal.png'
        },{
            technicalName: 'COMPOST',
            name: 'Compost',
            image: '/assets/misc/compost.png'
        });
        isReady.resolve();
    }

    initialise();

    return exports;

}
