(request, configuration, events, components, elementWatcher, Promise) => {

    let enabled = false;
    let conversionsByType = {};
    let savedFilters = [];
    let currentFilter = {
        listingType: 'SELL',
        type: 'None',
        amount: 0,
        key: 'SELL-None'
    };
    let listUpdatePromiseWrapper = null;

    async function initialise() {
        const category = configuration.registerCategory('ui-features', 'UI Features');
        configuration.registerToggle('market-filter', 'Market filter', true, handleConfigStateChange, category);
        events.register('xhr', handleXhr);

        $(document).on('mouseenter mouseleave click', '.saveFilterHoverTrigger', function(e) {
            switch(e.type) {
                case 'mouseenter':
                    if(currentFilter.type === 'None') {
                        return $('.saveFilterHover.search').addClass('greenOutline');
                    }
                    return $('.saveFilterHover:not(.search)').addClass('greenOutline');
                case 'mouseleave':
                case 'click':
                    return $('.saveFilterHover').removeClass('greenOutline');
            }
        });

        $(document).on('input', 'market-listings-component .search > input', clearFilter);
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(1)', async function() {
            currentFilter.listingType = 'SELL';
            showComponent();
            await applyFilter(currentFilter);
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(2)', async function() {
            currentFilter.listingType = 'BUY';
            showComponent();
            await applyFilter(currentFilter);
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(3)', async function() {
            await clearFilter();
            hideComponent();
        });

        window.$('head').append($(`
            <style>
                .greenOutline {
                    outline: 2px solid rgb(83, 189, 115) !important;
                }
            </style>
        `));
    }

    function handleConfigStateChange(state) {
        enabled = state;
        if(!enabled) {
            hideComponent();
        }
    }

    function handleXhr(xhr) {
        if(!enabled) {
            return;
        }
        if(!xhr.url.endsWith('getMarketItems')) {
            return;
        }
        update();
    }

    async function update() {
        const listingsContainer = $('market-listings-component .card')[0];
        if(!listingsContainer) {
            return;
        }
        const conversions = await request.getMarketConversion();
        conversionsByType = {};
        for(const conversion of conversions) {
            const typeKey = `${conversion.listingType}-${conversion.type}`;
            if(!conversionsByType[typeKey]) {
                conversionsByType[typeKey] = [];
            }
            conversion.key = `${conversion.name}-${conversion.amount}-${conversion.price}`;
            conversionsByType[typeKey].push(conversion);
        }
        for(const type in conversionsByType) {
            if(type.startsWith('SELL-')) {
                conversionsByType[type].sort((a,b) => a.ratio - b.ratio);
            } else {
                conversionsByType[type].sort((a,b) => b.ratio - a.ratio);
            }
        }

        savedFilters = await request.getMarketFilters();

        $('market-listings-component .search').addClass('saveFilterHover');

        try {
            await elementWatcher.childAddedContinuous('market-listings-component .card', () => {
                if(listUpdatePromiseWrapper) {
                    listUpdatePromiseWrapper.resolve();
                    listUpdatePromiseWrapper = null;
                }
            })
        } catch(error) {
            console.warn(`Could probably not detect the market listing component, cause : ${error}`);
            return;
        }

        await clearFilter();
    }

    async function applyFilter(filter) {
        Object.assign(currentFilter, {search:null}, filter);
        currentFilter.key = `${currentFilter.listingType}-${currentFilter.type}`;
        if(currentFilter.type && currentFilter.type !== 'None') {
            await clearSearch();
        }
        syncListingsView();
    }

    async function clearSearch() {
        if(!$('market-listings-component .search > input').val()) {
            return;
        }
        listUpdatePromiseWrapper = new Promise.Expiring(5000);
        $('market-listings-component .search > .clear-button').click();
        return listUpdatePromiseWrapper.promise;
    }

    function syncListingsView() {
        const elements = $('market-listings-component .search ~ button').map(function(index,reference) {
            reference = $(reference);
            return {
                name: reference.find('.name').text(),
                amount: parseInt(reference.find('.amount').text().replace(/[,\.]/g, '')),
                price: parseInt(reference.find('.cost').text().replace(/[,\.]/g, '')),
                reference: reference
            };
        }).toArray();
        for(const element of elements) {
            element.key = `${element.name}-${element.amount}-${element.price}`;
        }
        if(currentFilter.search) {
            for(const element of elements) {
                element.reference.find('.ratio').remove();
                element.reference.show();
            }
            const searchReference = $('market-listings-component .search > input');
            searchReference.val(currentFilter.search);
            searchReference[0].dispatchEvent(new Event('input'));
            return;
        }
        let conversions = conversionsByType[currentFilter.key];
        if(!conversions) {
            for(const element of elements) {
                element.reference.find('.ratio').remove();
                element.reference.show();
            }
            return;
        }
        if(currentFilter.amount) {
            conversions = conversions.slice(0, currentFilter.amount);
        }
        const conversionsByKey = {};
        for(const conversion of conversions) {
            conversionsByKey[conversion.key] = conversion;
        }
        for(const element of elements) {
            element.reference.find('.ratio').remove();
            const match = conversionsByKey[element.key];
            if(match) {
                element.reference.show();
                element.reference.find('.amount').after(`<div class='ratio'>(${match.ratio.toFixed(2)})</div>`);
            } else {
                element.reference.hide();
            }
        }
    }

    async function clearFilter() {
        await applyFilter({
            type: 'None',
            amount: 0
        });
        syncCustomView();
    }

    async function saveFilter() {
        let filter = structuredClone(currentFilter);
        if(currentFilter.type === 'None') {
            filter.search = $('market-listings-component .search > input').val();
            if(!filter.search) {
                return;
            }
        }
        filter = await request.saveMarketFilter(filter);
        savedFilters.push(filter);
        componentBlueprint.selectedTabIndex = 0;
        syncCustomView();
    }

    async function removeFilter(filter) {
        await request.removeMarketFilter(filter.id);
        savedFilters = savedFilters.filter(a => a.id !== filter.id);
        syncCustomView();
    }

    function syncCustomView() {
        for(const option of components.search(componentBlueprint, 'filterDropdown').options) {
            option.selected = option.value === currentFilter.type;
        }
        components.search(componentBlueprint, 'amountInput').value = currentFilter.amount;
        components.search(componentBlueprint, 'savedFiltersTab').hidden = !savedFilters.length;
        if(!savedFilters.length) {
            componentBlueprint.selectedTabIndex = 1;
        }
        const savedFiltersSegment = components.search(componentBlueprint, 'savedFiltersSegment');
        savedFiltersSegment.rows = [];
        for(const savedFilter of savedFilters) {
            let text = `Type : ${savedFilter.type}`;
            if(savedFilter.amount) {
                text = `Type : ${savedFilter.amount} x ${savedFilter.type}`;
            }
            if(savedFilter.search) {
                text = `Search : ${savedFilter.search}`;
            }
            savedFiltersSegment.rows.push({
                type: 'buttons',
                buttons: [{
                    text: text,
                    size: 3,
                    color: 'primary',
                    action: async function() {
                        await applyFilter(savedFilter);
                        syncCustomView();
                    }
                },{
                    text: 'Remove',
                    color: 'danger',
                    action: removeFilter.bind(null,savedFilter)
                }]
            });
        }
        showComponent();
    }

    function hideComponent() {
        components.removeComponent(componentBlueprint);
    }

    function showComponent() {
        components.addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId : 'marketFilterComponent',
        dependsOn: 'market-page',
        parent : 'market-listings-component > .groups > :last-child',
        selectedTabIndex : 0,
        tabs : [{
            id: 'savedFiltersTab',
            title : 'Saved filters',
            hidden: true,
            rows: [{
                type: 'segment',
                id: 'savedFiltersSegment',
                rows: []
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Clear filter',
                    color: 'warning',
                    action: async function() {
                        await clearFilter();
                        await clearSearch();
                    }
                }]
            }]
        }, {
            title : 'Filter',
            rows: [{
                type: 'dropdown',
                id: 'filterDropdown',
                action: type => applyFilter({type}),
                class: 'saveFilterHover',
                options: [{
                    text: 'None',
                    value: 'None',
                    selected: false
                }, {
                    text: 'Food',
                    value: 'Food',
                    selected: false
                }, {
                    text: 'Charcoal',
                    value: 'Charcoal',
                    selected: false
                }, {
                    text: 'Compost',
                    value: 'Compost',
                    selected: false
                }]
            }, {
                type: 'input',
                id: 'amountInput',
                name: 'Amount',
                value: '',
                action: amount => applyFilter({amount:+amount}),
                class: 'saveFilterHover'
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Save filter',
                    action: saveFilter,
                    color: 'success',
                    class: 'saveFilterHoverTrigger'
                }]
            }, {
                type: 'buttons',
                buttons: [{
                    text: 'Clear filter',
                    color: 'warning',
                    action: async function() {
                        await clearFilter();
                        await clearSearch();
                    }
                }]
            }]
        }]
    };

    initialise();

}
