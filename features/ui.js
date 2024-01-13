(configuration) => {

    const id = crypto.randomUUID();
    const sections = [
        'challenges-page',
        'changelog-page',
        'daily-quest-page',
        'equipment-page',
        'guild-page',
        'home-page',
        'leaderboards-page',
        'market-page',
        'merchant-page',
        'quests-page',
        'settings-page',
        'skill-page',
        'upgrade-page'
    ].join(', ');
    const selector = `:is(${sections})`;
    let gap

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'ui-changes',
            name: 'UI changes',
            default: false,
            handler: handleConfigStateChange
        });
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
                    padding: 2px 6px !important;
                    min-height: 0 !important;
                }

                ${selector} :not(.multi-row) > :is(
                    button.item div.image,
                    button.row div.image,
                    div.item div.image,
                    div.item div.placeholder-image,
                    div.row div.image
                ) {
                    height: 32px !important;
                    width: 32px !important;
                    min-height: 0 !important;
                    min-width: 0 !important;
                }

                ${selector} div.lock {
                    height: unset !important;
                    padding: 0 !important;
                }

                action-component div.body >  div.image,
                produce-component div.body > div.image,
                daily-quest-page div.body > div.image {
                    height: 48px !important;
                    width: 48px !important;
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
                    height: 16px !important;
                    width: 16px !important;
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
