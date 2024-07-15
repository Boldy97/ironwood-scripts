(configuration, itemCache, util, statsStore, dropCache, actionCache) => {

    let enabled = false;
    let entered = false;
    let element;
    const converters = {
        SPEED: val => val/2,
        DURATION: val => val && util.secondsToDuration(val),
        OWNED: (val, item) => statsStore.getInventoryItem(item.id),
        CHARCOAL: (val, item) => item.charcoal,
        COMPOST: (val, item) => item.compost,
        ARCANE_POWDER: (val, item) => item.arcanePowder,
        PET_SNACKS: (val, item) => item.petSnacks,
        UNTRADEABLE: (val) => val ? 'Yes' : null,
        MIN_MARKET_PRICE: (val, item) => {
            // calcMarketPrice
            if(itemCache.specialIds.gem.includes(item.id)) {
                return item.attributes.SELL_PRICE * 1.2;
            }
            if(itemCache.specialIds.food.includes(item.id)) {
                return Math.round(0.8 * item.stats.global.HEAL);
            }
            if(itemCache.specialIds.smithing.includes(item.id)) {
                return 2 * Math.round(item.attributes.SELL_PRICE * 3/4);
            }
            return 2 * item.attributes.SELL_PRICE;
        },
        DROP_CHANCE: (val, item) => {
            const chances = dropCache.byItem[item.id].map(a => a.chance);
            if(!chances.length) {
                return;
            }
            const max = chances.reduce((acc,val) => Math.max(acc,val));
            if(max > 0.05) {
                return;
            }
            return `${util.formatNumber(100 * max)}%`;
        }
    }

    function initialise() {
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
        $(document).on('click', 'div.image > img', handleMouseLeave);
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
        for(const attribute of itemCache.attributes) {
            let value = item.attributes[attribute.technicalName];
            if(converters[attribute.technicalName]) {
                value = converters[attribute.technicalName](value, item);
            }
            if(value && Number.isInteger(value)) {
                value = util.formatNumber(value);
            }
            updateRow(attribute.technicalName, value);
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
        const attributesHtml = itemCache.attributes
            .map(a => `<div class='${a.technicalName}-row'><img src='${a.image}'/><span>${a.name}</span><span class='${a.technicalName}'/></div>`)
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
                    image-rendering: auto;
                }
                #custom-item-hover img.pixelated {
                    image-rendering: pixelated;
                }
            </style>
        `);
        element = $(`
            <div id='custom-item-hover' style='display:none'>
                <div>
                    <img class='image pixelated'/>
                    <span class='name'/>
                </div>
                ${attributesHtml}
            </div>
        `);
        $('body').append(element);
    }

    initialise();

}
