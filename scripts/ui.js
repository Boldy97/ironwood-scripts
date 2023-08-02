(configuration) => {

    const id = crypto.randomUUID();
    const sections = [
        //'inventory-page',
        'equipment-page',
        'home-page',
        'merchant-page',
        'market-page',
        'daily-quest-page',
        'quest-shop-page',
        'skill-page',
        'upgrade-page',
        'leaderboards-page',
        'changelog-page',
        'settings-page',
        'guild-page'
    ].join(', ');
    const selector = `:is(${sections})`;
    let gap

    function initialise() {
        const category = configuration.registerCategory('ui-features', 'UI Features');
        configuration.registerToggle('ui-changes', 'UI changes', true, handleConfigStateChange, category);
    }

    function handleConfigStateChange(state) {
        if(state) {
            add();
        } else {
            remove();
        }
    }

    function add() {
        document.documentElement.style.setProperty('--gap', '8px');
        const element = $(`
            <style>
                ${selector} :not(.multi-row) > :is(
                    button.item,
                    button.row,
                    button.socket-button,
                    button.level-button,
                    div.item,
                    div.row
                ) {
                    padding: 5px 12px 5px 6px !important;
                    min-height: 0 !important;
                    min-width: 0 !important;
                }

                ${selector} :not(.multi-row) > :is(
                    button.item div.image,
                    button.row div.image,
                    div.item div.image,
                    div.item div.placeholder-image,
                    div.row div.image
                ) {
                    height: 24px !important;
                    width: 24px !important;
                    min-height: 0 !important;
                    min-width: 0 !important;
                }

                div.progress div.image,
                daily-quest-page div.body div.image {
                    height: 40px !important;
                    width: 40px !important;
                }

                div.progress div.body {
                    padding: 8px !important;
                }

                action-component div.bars {
                    padding: 0 !important;
                }

                equipment-component button {
                    padding: 0 !important;
                }

                inventory-page .items {
                    grid-gap: 0 !important;
                }

                div.scroll.custom-scrollbar .header,
                div.scroll.custom-scrollbar button {
                    height: 28px !important;
                }

                div.scroll.custom-scrollbar img {
                    height: 20px !important;
                    width: 20px !important;
                }

                .scroll {
                    overflow-y: auto !important;
                }
                .scroll {
                    -ms-overflow-style: none;  /* Internet Explorer 10+ */
                    scrollbar-width: none;  /* Firefox */
                }
                .scroll::-webkit-scrollbar {
                    display: none;  /* Safari and Chrome */
                }
            </style>
        `).attr('id', id);
        window.$('head').append(element);
    }

    function remove() {
        document.documentElement.style.removeProperty('--gap');
        $(`#${id}`).remove();
    }

    initialise();

}
