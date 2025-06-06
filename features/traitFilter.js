(events, elementWatcher, configuration, components, localDatabase, elementCreator, colorMapper, skillCache) => {

    const STORE_NAME = 'various';
    const KEY_SORTTYPE = 'trait-sort-type'

    let enabled = false;
    let sortType = 'None';
    let traitNameFilter = '';
    let submenuObserver = null;
    let cardMutationObserver = null;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'Traits',
            key: 'trait-sort-enabled',
            name: 'Sort / Filter',
            default: enabled,
            handler: handleConfigStateChange
        });
        elementCreator.addStyles(styles);
        events.register('page', handlePage);
        const savedState = await localDatabase.getAllEntries(STORE_NAME);
        sortType = savedState?.find(s => s.key === KEY_SORTTYPE)?.value || sortType;
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function refresh() {
        handlePage(events.getLast('page'));
    }

    function disconnectObservers() {

        if (cardMutationObserver) {
            cardMutationObserver.disconnect();
            cardMutationObserver = null;
        }
        if (submenuObserver) {
            submenuObserver.disconnect();
            submenuObserver = null;
        }
    }

    function updateSortAndFilterComponent() {
        const sortDropdown = components.search(sortTraitComponentBlueprint, 'sortDropdown');
        sortDropdown.default = sortType;
        sortDropdown.options = Object.keys(STRATEGY)
            .map(option => ({
                text: option,
                value: option,
                selected: option === sortType
            }));
    }

    async function handlePage(last) {
        if (!enabled) {
            return;
        }
        if (!last || last.type !== 'traits') {
            disconnectObservers();
            return;
        }

        updateSortAndFilterComponent();

        await elementWatcher.exists('traits-page .header > .name:contains("Equipped")');
        components.addComponent(sortTraitComponentBlueprint);

        observeCardChanges();
        observeSubmenuClicks();
        applySortOrFilter();
    }

    const STRATEGY = {
        'None': { compare: (a, b) => getId(a) - getId(b) },
        'By Lv. Asc': { compare: (a, b) => getLevel(a) - getLevel(b) },
        'By Lv. Desc': { compare: (a, b) => getLevel(b) - getLevel(a) },
        'By name Asc': { compare: (a, b) => getName(a).localeCompare(getName(b)) },
        'By name Desc': { compare: (a, b) => getName(b).localeCompare(getName(a)) },
        'Only Gathering': { filter: btn => getCategory(btn) === 'Gathering' },
        'Only Crafting': { filter: btn => getCategory(btn) === 'Crafting' },
        'Only Combat': { filter: btn => getCategory(btn) === 'Combat' },
    }

    function getLevel(btn) {
        return +$(btn).find('.level').text().replace('Lv. ', '') || 0;
    }

    function getName(btn) {
        return $(btn).find('.name').text().toLowerCase();
    }

    function getCategory(btn) {
        const baseName = getName(btn).split(' ')[0];
        const skill = skillCache.list.find(s => s.displayName.toLowerCase().startsWith(baseName));
        return (skill && skill.type) || 'Other';
    }

    function getId(btn) {
        const baseName = getName(btn).split(' ')[0];
        const skill = skillCache.list.find(s => s.displayName.toLowerCase().startsWith(baseName));
        return (skill && skill.type) || -1;
    }

    function applySortOrFilter() {
        if (cardMutationObserver) cardMutationObserver.disconnect();

        const { compare, filter } = STRATEGY[sortType] || {};

        $('.last > .card').filter(function () {
            const headerName = $(this).find('.header > .name').text().trim();
            return headerName === 'Traits'; // headerName === 'Equipped' || 
        }).each(function () {
            const $card = $(this);
            const $buttons = $card.find('button.row');
            $buttons.show();

            if (filter) {
                $buttons.each((_, btn) => $(btn).toggle(filter(btn)));
            }

            if (compare) {
                const sorted = $buttons.toArray().sort(compare);
                $(sorted).appendTo($card);
            }

            const $noResult = $card.find('.no-results');
            const visibleCount = $buttons.filter(':visible').length;
            const hasEmptyVisible = $card.find('.empty').length > 0;

            if (visibleCount === 0 && !hasEmptyVisible) {
                if ($noResult.length === 0) {
                    $('<div>').addClass('no-results').text('No results')
                        .appendTo($card);
                }
            } else {
                $noResult.remove();
            }

            const hiddenCount = $buttons.filter(':hidden').length;
            let $hiddenCountDiv = $card.find('.hidden-count');

            if (hiddenCount > 0) {
                if ($hiddenCountDiv.length === 0) {
                    $hiddenCountDiv = $('<div>').addClass('hidden-count').appendTo($card);
                }
                $hiddenCountDiv.text(`${hiddenCount} trait${hiddenCount > 1 ? 's' : ''} hidden by filter`);
            } else {
                $hiddenCountDiv.remove();
            }
        });

        observeCardChanges();
    }

    function observeCardChanges() {
        if (cardMutationObserver) {
            cardMutationObserver.disconnect();
        }

        const container = document.querySelector('traits-page > .groups > .last');
        if (!container) {
            return;
        }

        cardMutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length || mutation.removedNodes.length) {
                    applySortOrFilter();
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
        if (submenuObserver) {
            submenuObserver.disconnect();
        }

        submenuObserver = new MutationObserver(() => {
            const traitsBtn = $('div.card:has(.header .name:contains("Menu")) button.row:contains("Traits")');
            traitsBtn.off('click.traitSorter').on('click.traitSorter', refresh);
        });

        submenuObserver.observe(document.body, { childList: true, subtree: true });
    }

    const sortTraitComponentBlueprint = {
        componentId: 'trait-sort-component',
        dependsOn: 'traits-page .header:contains("Traits")',
        parent: 'traits-page .header:contains("Traits")',
        desiredChildIndex: 1,
        selectedTabIndex: 0,
        light: true,
        class: 'noMarginTop',
        tabs: [{
            rows: [{
                id: 'sortDropdown',
                type: 'dropdown',
                options: [],
                action: value => {
                    sortType = value;
                    localDatabase.saveEntry(STORE_NAME, { key: KEY_SORTTYPE, value: sortType });
                    refresh();
                }
            }]
        }]
    };

    const styles = `
        #trait-sort-component {
            width: auto;
            visibility: hidden;
            margin-left: auto;
            margin-right: var(--gap);
        }
        #trait-sort-component .customRow {
            padding-top: 0;
            padding-bottom: 0;
        }
        #trait-sort-component .myItemSelect {
            background-color: ${colorMapper('componentRegular')};
            visibility: visible;
            height: inherit;
            padding: 0px var(--gap);
        }
        #trait-sort-component + * {
            margin-left: 0;
        }
        .hidden-count,
        .no-results {
            padding: 6px 0;
            text-align: center;
            color: gray;
            background-color: ${colorMapper('componentRegular')};
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
        }
    `;

    initialise();
}
