(auth, configuration, itemCache) => {

    let enabled = false;
    let entered = false;
    let element;
    const rows = [
        ['SELL_PRICE', 'Sell Price', '/assets/misc/coin.png'],
        ['BUY_PRICE', 'Buy Price', '/assets/misc/merchant.png'],
        ['charcoal', 'Charcoal', '/assets/items/charcoal.png'],
        ['compost', 'Compost', '/assets/misc/compost.png'],
        ['LEVEL', 'Level', 'https://cdn-icons-png.flaticon.com/512/9742/9742828.png'],
        ['DAMAGE', 'Damage', 'https://cdn-icons-png.flaticon.com/512/9743/9743017.png'],
        ['ARMOUR', 'Armour', 'https://cdn-icons-png.flaticon.com/512/2592/2592488.png'],
        ['SPEED', 'Speed', 'https://cdn-icons-png.flaticon.com/512/3563/3563395.png', a => a/2],
        ['DAMAGE_PERCENT', 'Percent Damage', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['HEALTH', 'Health', 'https://cdn-icons-png.flaticon.com/512/2589/2589054.png'],
        ['HEAL', 'Heal', 'https://cdn-icons-png.flaticon.com/512/1635/1635524.png'],
        ['BLOCK_CHANCE', 'Block Chance', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['CRIT_CHANCE', 'Crit Chance', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['STUN_CHANCE', 'Stun Chance', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['PARRY_CHANCE', 'Parry Chance', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['BLEED_CHANCE', 'Bleed Chance', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['DAMAGE_RANGE', 'Damage Range', 'https://cdn-icons-png.flaticon.com/512/3723/3723446.png'],
        ['DUNGEON_DAMAGE', 'Dungeon Damage', 'https://cdn-icons-png.flaticon.com/512/2218/2218103.png'],
        ['FOOD_EFFECT', 'Food Effect', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['PRESERVATION_CHANCE', 'Preservation Chance', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['WOODCUTTING_EFFICIENCY', 'Woodcutting Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['FISHING_EFFICIENCY', 'Fishing Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['FARMING_EFFICIENCY', 'Farming Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['MINING_EFFICIENCY', 'Mining Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['ONE_HANDED_EFFICIENCY', 'One-Handed Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['TWO_HANDED_EFFICIENCY', 'Two-Handed Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['RANGED_EFFICIENCY', 'Ranged Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['DEFENSE_EFFICIENCY', 'Defense Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['GATHER_EFFICIENCY', 'Gather Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['CRAFT_EFFICIENCY', 'Craft Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['COMBAT_EFFICIENCY', 'Combat Efficiency', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['GATHER_YIELD', 'Gather Yield', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['COMBAT_YIELD', 'Combat Yield', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
        ['COMBAT_EXP', 'Combat Experience', 'https://cdn-icons-png.flaticon.com/512/3012/3012388.png'],
    ];

    async function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'item-hover',
            name: 'Item hover info',
            default: true,
            handler: handleConfigStateChange
        });
        setup();
        $(document).on('mouseenter', 'div.image > img', handleMouseEnter);
        $(document).on('mouseleave', 'div.image > img', handleMouseLeave);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleMouseEnter(event) {
        if(!enabled || entered || !itemCache.byId) {
            return;
        }
        entered = true;
        const name = $(event.relatedTarget).find('.name').text();
        const nameMatch = itemCache.byName[name];
        if(nameMatch) {
            return show(nameMatch);
        }

        const parts = event.target.src.split('/');
        const lastPart = parts[parts.length-1];
        const imageMatch = itemCache.byImage[lastPart];
        if(imageMatch) {
            return show(imageMatch);
        }
    }

    function handleMouseLeave(event) {
        if(!enabled || !itemCache.byId) {
            return;
        }
        entered = false;
        hide();
    }

    function show(item) {
        element.find('.image').attr('src', `/assets/${item.image}`);
        element.find('.name').text(item.name);
        for(const row of rows) {
            let value = item.attributes[row[0]];
            if(row[3]) {
                value = row[3](value);
            }
            updateRow(row[0], value);
        }
        element.show();
    }

    function updateRow(name, value) {
        if(!value) {
            element.find(`.${name}-row`).hide();
        } else {
            element.find(`.${name}`).text(value);
            element.find(`.${name}-row`).show();
        }
    }

    function hide() {
        element.hide();
    }

    function setup() {
        const rowshtml = rows
            .map(a => `<div class='${a[0]}-row'><img src='${a[2]}'/><span>${a[1]}</span><span class='${a[0]}'/></div>`)
            .join('');
        $('head').append(`
            <style>
                #custom-item-hover {
                    position: fixed;
                    right: .5em;
                    top: .5em;
                    display: flex;
                    font-family: Jost,Helvetica Neue,Arial,sans-serif;
                    flex-direction: column;
                    white-space: nowrap;
                    z-index: 1;
                    background-color: black;
                    padding: .4rem;
                    border: 1px solid #3e3e3e;
                    border-radius: .4em;
                    gap: .4em;
                }
                #custom-item-hover > div {
                    display: flex;
                    gap: .4em;
                }
                #custom-item-hover > div > *:last-child {
                    margin-left: auto;
                }
                #custom-item-hover img {
                    width: 24px;
                    height: 24px;
                }
            </style>
        `);
        element = $(`
            <div id='custom-item-hover' style='display:none'>
                <div>
                    <img class='image'/>
                    <span class='name'/>
                </div>
                ${rowshtml}
            </div>
        `);
        $('body').append(element);
    }

    initialise();

}
