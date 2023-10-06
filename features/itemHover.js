(auth, configuration, itemStore, util) => {

    let enabled = false;
    let entered = false;
    let element;
    const converters = {
        SPEED: a => a/2,
        DURATION: a => util.secondsToDuration(a/10)
    }

    async function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'item-hover',
            name: 'Item hover info',
            default: true,
            handler: handleConfigStateChange
        });
        await setup();
        $(document).on('mouseenter', 'div.image > img', handleMouseEnter);
        $(document).on('mouseleave', 'div.image > img', handleMouseLeave);
        $(document).on('click', 'div.image > img', handleMouseLeave);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleMouseEnter(event) {
        if(!enabled || entered || !itemStore.byId) {
            return;
        }
        entered = true;
        const name = $(event.relatedTarget).find('.name').text();
        const nameMatch = itemStore.byName[name];
        if(nameMatch) {
            return show(nameMatch);
        }

        const parts = event.target.src.split('/');
        const lastPart = parts[parts.length-1];
        const imageMatch = itemStore.byImage[lastPart];
        if(imageMatch) {
            return show(imageMatch);
        }
    }

    function handleMouseLeave(event) {
        if(!enabled || !itemStore.byId) {
            return;
        }
        entered = false;
        hide();
    }

    function show(item) {
        element.find('.image').attr('src', `/assets/${item.image}`);
        element.find('.name').text(item.name);
        for(const attribute of itemStore.attributes) {
            let value = item.attributes[attribute.technicalName];
            if(converters[attribute.technicalName]) {
                value = converters[attribute.technicalName](value);
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

    async function setup() {
        await itemStore.ready;
        const attributesHtml = itemStore.attributes
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
                }
            </style>
        `);
        element = $(`
            <div id='custom-item-hover' style='display:none'>
                <div>
                    <img class='image'/>
                    <span class='name'/>
                </div>
                ${attributesHtml}
            </div>
        `);
        $('body').append(element);
    }

    initialise();

}
