(events, elementWatcher, configuration) => {

    let sortType = 'None';
    let submenuObserver = null;
    let cardMutationObserver = null;

    async function initialise() {
        configuration.registerDropdown({
            category: 'UI Features',
            key: 'trait-sort',
            name: 'Trait Sorting',
            default: sortType,
            noHeader: true,
            compact: true,
            layout: '5/2',
            options: ['None', 'Lv. ASC', 'Lv. DESC'],
            handler: handleConfigAnimationTypeChange
        });
        events.register('page', handlePage);
    }

    async function handlePage() {
        const last = events.getLast('page');
        if (!last || last.type !== 'traits') {

            if (cardMutationObserver) {
                cardMutationObserver.disconnect();
                cardMutationObserver = null;
            }
            if (submenuObserver) {
                submenuObserver.disconnect();
                submenuObserver = null;
            }

            return;
        };

        await elementWatcher.exists('traits-page .header > .name:contains("Equipped")');

        observeCardChanges();
        observeSubmenuClicks();
        applyFilter();
    }

    function handleConfigAnimationTypeChange(state) {
        sortType = state;
    }

    function applyFilter() {
        if (sortType === 'None') return;

        if (cardMutationObserver) cardMutationObserver.disconnect();

        $('.card').each(function () {
            const $card = $(this);
            const $buttons = $card.find('button.row');

            const sorted = $buttons.toArray().sort((a, b) => {
                const levelA = parseInt($(a).find('.level').text().replace('Lv. ', '')) || 0;
                const levelB = parseInt($(b).find('.level').text().replace('Lv. ', '')) || 0;

                if (sortType === 'Lv. ASC') return levelA - levelB;
                if (sortType === 'Lv. DESC') return levelB - levelA;
                return 0;
            });

            $buttons.detach();
            $card.append(sorted);
        });

        observeCardChanges();
    }

    function observeCardChanges() {
        if (cardMutationObserver) cardMutationObserver.disconnect();

        const container = document.querySelector('traits-page > .groups > .last');
        if (!container) return;

        cardMutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length || mutation.removedNodes.length) {
                    applyFilter();
                    break;
                }
            }
        });

        cardMutationObserver.observe(container, {
            childList: true,
            subtree: true
        });
    }

    function observeSubmenuClicks() {
        if (submenuObserver) submenuObserver.disconnect();

        submenuObserver = new MutationObserver(() => {
            const traitsBtn = $('div.card:has(.header .name:contains("Menu")) button.row:contains("Traits")');
            traitsBtn.off('click.traitSorter').on('click.traitSorter', handlePage);
        });

        submenuObserver.observe(document.body, { childList: true, subtree: true });
    }

    initialise();
}
