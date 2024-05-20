() => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        idToIndex: {}
    };

    function initialise() {
        const traits = ['Attack & Defense', 'Attack & Special Def', 'Special Atk & Defense', 'Special Atk & Special Def'];
        for(const trait of traits) {
            const value = {
                id: exports.list.length,
                name: trait,
                attack: trait.startsWith('Attack'),
                defense: trait.endsWith('Defense'),
                specialAttack: trait.startsWith('Special Atk'),
                specialDefense: trait.endsWith('Special Def')
            };
            exports.list.push(value);
            exports.byId[value.id] = value;
            exports.byName[value.name] = value;
            exports.idToIndex[value.id] = exports.list.length-1;
        }
    }

    initialise();

    return exports;

}
