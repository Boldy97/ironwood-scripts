(events, elementWatcher, configuration, components, localDatabase, modal, elementCreator, util) => {

    const STORE_NAME = 'various';
    const KEY_SORTTYPE = 'trait-util-sort-type'

    let enabled = false;
    let sortType = 'None';
    let traitNameFilter = '';
    let submenuObserver = null;
    let cardMutationObserver = null;
    let traitPointMutationObserver = null

    let traitPointData = [];

    async function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'trait-util-enabled',
            name: 'Trait Utilities',
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
            if (traitPointMutationObserver) {
                traitPointMutationObserver.disconnect();
                traitPointMutationObserver = null;
            }

    }

    function updateTraitPointComponent() {
        const NEEDMOREDATA = 'Not enough data';
        const timeBetweenTraitPoints = components.search(traitPointComponentBlueprint, 'time-between-trait-points');
        const nextTraitPointIn = components.search(traitPointComponentBlueprint, 'next-trait-point-in');

        if (traitPointData.length < 2) {
            timeBetweenTraitPoints.value = NEEDMOREDATA;
            nextTraitPointIn.value = NEEDMOREDATA;
            return;
        }

        let totalPointsGained = 0;
        let totalTimeElapsed = 0;
        for (let i = 1; i < traitPointData.length; i++) {
            const current = traitPointData[i];
            const previous = traitPointData[i - 1];
            const pointsGained = current.now - previous.now;
            const timeElapsed = current.time - previous.time;
            if (pointsGained > 0 && timeElapsed > 0) {
                totalPointsGained += pointsGained;
                totalTimeElapsed += timeElapsed;
            }
        }

        if (totalPointsGained <= 0 || totalTimeElapsed <= 0) {
            timeBetweenTraitPoints.value = NEEDMOREDATA;
            nextTraitPointIn.value = NEEDMOREDATA;
            return;
        }

        const secondsPerPoint = totalTimeElapsed / totalPointsGained / 1000;
        let pointsRemaining = traitPointData[traitPointData.length - 1].next - traitPointData[traitPointData.length - 1].now;
        timeBetweenTraitPoints.value = util.secondsToDuration(secondsPerPoint.toFixed(0));
        if (pointsRemaining <= 0) {
            nextTraitPointIn.value = '0';
        } else {
            const secondsToNextPoint = Math.ceil(pointsRemaining * secondsPerPoint);
            nextTraitPointIn.value = util.secondsToDuration(secondsToNextPoint.toFixed(0));
        }
    }

    function updateSortAndFilterComponent() {
        const sortDropdown = components.search(sortAndFilterComponentBlueprint, 'sortDropdown');
        sortDropdown.default = sortType;
        sortDropdown.options = ['None', 'Lv. ASC', 'Lv. DESC'].map(option => ({
            text: option,
            value: option,
            selected: option === sortType
        }));
    }

    async function handlePage(last) {
        if(!enabled) {
            return;
        }
        if(!last || last.type !== 'traits') {
            disconnectObservers();
            traitPointData = [];
            return;
        }

        updateTraitPointComponent();
        components.addComponent(traitPointComponentBlueprint);

        updateSortAndFilterComponent();
        observePointsTillTrait();

        await elementWatcher.exists('traits-page .header > .name:contains("Equipped")');
        components.addComponent(sortAndFilterComponentBlueprint);

        observeCardChanges();
        observeSubmenuClicks();
        applySort();
        applyNameFilter();
    }

    function applySort() {
        if (sortType === 'None') {
            return;
        }

        if (cardMutationObserver) {
            cardMutationObserver.disconnect();
        }

        $('.last > .card').each(function () {
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

    function applyNameFilter() {
        if (cardMutationObserver) {
            cardMutationObserver.disconnect();
        }

        $('.last > .card').each(function () {
            const $buttons = $(this).find('button.row');

            $buttons.each(function () {
                const $btn = $(this);
                const traitName = $btn.find('.name').text().toLowerCase();
                const filter = traitNameFilter.trim().toLowerCase();

                if (!filter) {
                    $btn.show();
                    return;
                }

                if (traitName.includes(filter)) {
                    $btn.show();
                } else {
                    $btn.hide();
                }
            });
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
                    applySort();
                    break;
                }
            }
        });

        cardMutationObserver.observe(container, {
            childList: true,
            subtree: true
        });
    }

    function observePointsTillTrait() {
        if (traitPointMutationObserver) {
            traitPointMutationObserver.disconnect();
        }

        const target = document.querySelector(
            'traits-page > .groups > .group:nth-of-type(2) .card .row .name:nth-child(1)'
        );

        if (!target || !target.textContent.includes('Points Till Trait')) {
            return;
        }

        const amountElement = target.nextElementSibling;
        if (!amountElement) {
            return;
        }

        traitPointMutationObserver = new MutationObserver(() => {
            const text = amountElement.textContent.trim();
            const match = text.match(/([\d,]+)\s*\/\s*([\d,]+)\s*TP/i);
            if (match) {
                const now = parseInt(match[1].replace(/,/g, ''), 10);
                const next = parseInt(match[2].replace(/,/g, ''), 10);
                const currentMillis = Date.now();

                traitPointData.push({
                    time: currentMillis,
                    now,
                    next
                });

                if (traitPointData.length > 100) {
                    traitPointData.splice(0, traitPointData.length - 100);
                }

                refresh();
            }
        });

        traitPointMutationObserver.observe(amountElement, {
            characterData: true,
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

    async function reviewData() {
        const modalId = await modal.create({
            title: 'Trait Point gained history',
            image: 'https://ironwoodrpg.com/assets/misc/changelog.png',
            maxWidth: 600
        });
        traitPointDataReviewComponent.parent = `#${modalId}`;

        const traitPointReviewList = components.search(traitPointDataReviewComponent, 'traitPointDataList');
        traitPointReviewList.entries = traitPointData;

        components.addComponent(traitPointDataReviewComponent);
    }

    const sortAndFilterComponentBlueprint = {
        componentId: 'trait-util-sort-and-filter-component',
        dependsOn: 'traits-page',
        parent: 'traits-page > .groups > .last',
        prepend: true,
        selectedTabIndex: 0,
        class: 'noMarginTop',
        tabs: [{
            title: 'tab',
            rows: [{
                type: 'header',
                title: 'Trait Sorting and Filtering',
            }, {
                id: 'filterName_input',
                type: 'input',
                name: 'Trait Name',
                value: '',
                clearable: true,
                inputType: 'text',
                text: 'Filter by name',
                layout: '1/2',
                action: value => {
                    traitNameFilter = value;
                    refresh();
                },
            }, {
                id: 'sortDropdown',
                type: 'dropdown',
                name: 'Trait Sorting',
                compact: true,
                default: '',
                options: [],
                text: 'Sort Traits',
                layout: '1/2',
                action: value => {
                    sortType = value;
                    localDatabase.saveEntry(STORE_NAME, { key: KEY_SORTTYPE, value: sortType });
                    refresh();
                }
            }]
        }]
    };

    const traitPointComponentBlueprint = {
        componentId: 'trait-util-trait-point-component',
        dependsOn: 'traits-page',
        parent: 'traits-page > .groups > .group:eq(1)',
        prepend: false,
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                type: 'header',
                title: 'Trait Points Helper',
                name: 'Review data',
                color: 'info',
                action: () => reviewData(),
            }, {
                type: 'item',
                id: 'time-between-trait-points',
                name: 'Time between Trait Points',
                extra: '(average)',
                image: 'https://img.icons8.com/?size=48&id=1HQMXezy5LeT&format=png',
                imageFilter: 'invert(100%)',
                value: ''
            }, {
                type: 'item',
                id: 'next-trait-point-in',
                name: 'Next Trait in',
                extra: '(approximation)',
                image: 'https://img.icons8.com/?size=48&id=1HQMXezy5LeT&format=png',
                imageFilter: 'invert(100%)',
                value: ''
            }]
        }]
    };

    const traitPointDataReviewComponent = {
        componentId: 'traitPointDataReviewComponent',
        dependsOn: 'traits-page',
        parent: 'MODAL ID GOES HERE',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                id: 'traitPointDataList',
                type: 'listView',
                maxHeight: 500,
                render: ($element, item) => {

                    $element.append(
                        $('<div/>').addClass('traitPointViewContent').append(
                            $('<div/>').addClass('traitPointViewTop').append(
                                $('<span/>').addClass('traitPointNow').text('Current amount: ' + String(item.now || 'N/A')),
                                $('<span/>').addClass('traitPointNext').text('Total required: ' + String(item.next || 'N/A'))
                            ),
                            $('<div/>').addClass('traitPointViewBottom').append(
                                $('<span/>').addClass('traitPointTime').text('Time: ' + (item.time ? new Date(item.time).toLocaleTimeString() : 'N/A'))
                            )
                        )
                    );

                    return $element;
                },
                entries: []
            }]
        }]
    };

    const styles = `
        .traitPointViewContent {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            padding: 0.75rem 1rem;
            justify-content: space-between;
            background: #222; /* optional: dark background */
            border-radius: 4px; /* optional */
        }
        .traitPointViewTop,
        .traitPointViewBottom {
            display: flex;
            justify-content: space-between;
            padding: 0 0.25rem;
        }
        .traitPointNow,
        .traitPointNext {
            font-weight: bold;
            color: #4CAF50; /* greenish */
        }
        .traitPointTime {
            color: #999;
            font-size: 0.85em;
            font-style: italic;
        }
    `;

    initialise();
}
