(configuration, localDatabase, events, components, elementWatcher, Promise, itemCache, dropCache, marketReader, elementCreator) => {

    const STORE_NAME = 'market-filters';
    const TYPE_TO_ITEM = {
        'Food': itemCache.byName['Health'].id,
        'Charcoal': itemCache.byName['Charcoal'].id,
        'Compost': itemCache.byName['Compost'].id,
        'Arcane Powder': itemCache.byName['Arcane Powder'].id,
    };
    let savedFilters = [];
    let enabled = false;
    let currentFilter = {
        type: 'None',
        amount: 0,
        key: 'SELL-None'
    };
    let pageInitialised = false;
    let listingsUpdatePromise = null;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'market-filter',
            name: 'Market filter',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('state-market', update);

        savedFilters = await localDatabase.getAllEntries(STORE_NAME);

        // detect elements changing

        // clear filters when searching yourself
        $(document).on('click', 'market-listings-component .search > .clear-button', clearFilter);
        $(document).on('input', 'market-listings-component .search > input', clearFilter);

        // Buy tab -> trigger update
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(1)', function() {
            showComponent();
            marketReader.trigger();
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(2)', function() {
            showComponent();
            marketReader.trigger();
        });
        $(document).on('click', 'market-listings-component .card > .tabs > :nth-child(3)', function() {
            hideComponent();
            marketReader.trigger();
        });

        elementCreator.addStyles(`
            .greenOutline {
                outline: 2px solid rgb(83, 189, 115) !important;
            }
        `);

        // on save hover, highlight saved fields
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
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function update() {
        if(!enabled) {
            return;
        }
        if(events.getLast('page')?.type !== 'market') {
            pageInitialised = false;
            return;
        }
        initialisePage();
        $('market-listings-component .search').addClass('saveFilterHover');
        syncListingsView();
    }

    async function initialisePage() {
        if(pageInitialised) {
            return;
        }
        clearFilter();
        try {
            await elementWatcher.childAddedContinuous('market-listings-component .card', () => {
                if(listingsUpdatePromise) {
                    listingsUpdatePromise.resolve();
                    listingsUpdatePromise = null;
                }
            });
            pageInitialised = true;
        } catch(error) {
            console.warn(`Could probably not detect the market listing component, cause : ${error}`);
        }
    }

    async function clearFilter() {
        await applyFilter({
            type: 'None',
            amount: 0
        });
        syncCustomView();
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
        listingsUpdatePromise = new Promise.Expiring(5000);
        setSearch('');
        await listingsUpdatePromise;
        marketReader.trigger();
    }

    function setSearch(value) {
        const searchReference = $('market-listings-component .search > input');
        searchReference.val(value);
        searchReference[0].dispatchEvent(new Event('input'));
    }

    async function saveFilter() {
        let filter = structuredClone(currentFilter);
        if(currentFilter.type === 'None') {
            filter.search = $('market-listings-component .search > input').val();
            if(!filter.search) {
                return;
            }
        }
        if(filter.search) {
            filter.key = `SEARCH-${filter.search}`;
        } else {
            filter.key = `${filter.type}-${filter.amount}`;
        }
        if(!savedFilters.find(a => a.key === filter.key)) {
            localDatabase.saveEntry(STORE_NAME, filter);
            savedFilters.push(filter);
        }
        componentBlueprint.selectedTabIndex = 0;
        syncCustomView();
    }

    async function removeFilter(filter) {
        localDatabase.removeEntry(STORE_NAME, filter.key);
        savedFilters = savedFilters.filter(a => a.key !== filter.key);
        syncCustomView();
    }

    function syncListingsView() {
        const marketData = events.getLast('state-market');
        if(!marketData) {
            return;
        }
        // do nothing on own listings tab
        if(marketData.lastType === 'OWN') {
            resetListingsView(marketData);
            return;
        }
        // search
        if(currentFilter.search) {
            resetListingsView(marketData);
            setSearch(currentFilter.search);
            return;
        }
        // no type
        if(currentFilter.type === 'None') {
            resetListingsView(marketData);
            return;
        }
        // type
        const itemId = TYPE_TO_ITEM[currentFilter.type];
        const conversionsByItem = dropCache.conversionMappings[itemId].reduce((a,b) => (a[b.from] = b, a), {});
        let matchingListings = marketData.last.filter(listing => listing.item in conversionsByItem);
        for(const listing of matchingListings) {
            listing.ratio = listing.price / conversionsByItem[listing.item].amount;
        }
        matchingListings.sort((a,b) => (a.type === 'BUY' ? 1 : -1) * (b.ratio - a.ratio));
        if(currentFilter.amount) {
            matchingListings = matchingListings.slice(0, currentFilter.amount);
        }
        for(const listing of marketData.last) {
            if(matchingListings.includes(listing)) {
                listing.element.show();
                if(!listing.element.find('.ratio').length) {
                    listing.element.find('.amount').after(`<div class='ratio'>(${listing.ratio.toFixed(2)})</div>`);
                }
            } else {
                listing.element.hide();
            }
        }
    }

    function resetListingsView(marketData) {
        for(const element of marketData.last.map(a => a.element)) {
            element.find('.ratio').remove();
            element.show();
        }
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
        componentBlueprint.prepend = screen.width < 750;
        components.addComponent(componentBlueprint);
    }

    const componentBlueprint = {
        componentId : 'marketFilterComponent',
        dependsOn: 'market-page',
        parent : 'market-listings-component > .groups > :last-child',
        prepend: false,
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
                }, {
                    text: 'Arcane Powder',
                    value: 'Arcane Powder',
                    selected: false
                }]
            }, {
                type: 'input',
                id: 'amountInput',
                name: 'Amount',
                value: '',
                inputType: 'number',
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
