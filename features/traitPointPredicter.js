(events, configuration, components, modal, elementCreator, util) => {

    let enabled = false;
    let traitPointMutationObserver = null

    let traitPointData = [];

    async function initialise() {
        configuration.registerCheckbox({
            category: 'Traits',
            key: 'trait-point-util-enabled',
            name: 'Trait Point Predicter',
            default: enabled,
            handler: handleConfigStateChange
        });
        elementCreator.addStyles(styles);
        events.register('page', handlePage);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function refresh() {
        handlePage(events.getLast('page'));
    }

    function disconnectObservers() {
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

    async function handlePage(last) {
        if (!enabled) {
            return;
        }
        if (!last || last.type !== 'traits') {
            disconnectObservers();
            traitPointData = [];
            return;
        }

        updateTraitPointComponent();
        components.addComponent(traitPointComponentBlueprint);

        observePointsTillTrait();
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
