(configuration, localDatabase, events, components, elementWatcher, Promise, itemCache, dropCache, marketReader, elementCreator, toast) => {
    const STORE_NAME = 'market-filters';
    const TYPE_TO_ITEM = {
        'Food': itemCache.byName['Health'].id,
        'Charcoal': itemCache.byName['Charcoal'].id,
        'Compost': itemCache.byName['Compost'].id,
        'Arcane Powder': itemCache.byName['Arcane Powder'].id,
        'Pet Snacks': itemCache.byName['Pet Snacks'].id,
        'Metal Parts': itemCache.byName['Metal Parts'].id,
        'Sigil Pieces': itemCache.byName['Sigil Pieces'].id,
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
    const SAVED_FILTER_MAX_SEARCH_LENGTH = 25;

    async function initialise() {
        configuration.registerCheckbox({
            category: 'Market',
            key: 'market-filter',
            name: 'Filters',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('page', update);
        events.register('reader-market', update);

        savedFilters = await localDatabase.getAllEntries(STORE_NAME);
        syncCustomView();

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
        showComponent();
    }

    async function applyFilter(filter) {
        Object.assign(currentFilter, {search:null}, filter);
        currentFilter.key = `${currentFilter.listingType}-${currentFilter.type}`;
        if(!currentFilter.type ||currentFilter.type === 'None') {
            syncListingsView();
            return;
        }
        const search = Object.values(dropCache.conversionMappings[TYPE_TO_ITEM[currentFilter.type]])
            .map(conversion => conversion.from)
            .map(id => itemCache.byId[id].name)
            .map(name => `^${name}$`)
            .join('|');
        setSearch(search);
        marketReader.trigger();
    }

    async function clearSearch() {
        if(!$('market-listings-component .search > input').val()) {
            return;
        }
        listingsUpdatePromise = new Promise.Expiring(5000, 'marketFilter - clearSearch');
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
            if(filter.search.length > SAVED_FILTER_MAX_SEARCH_LENGTH){
                toast.create({
                    text: 'Could not save filter, search text is too long (' + filter.search.length + '/'+ SAVED_FILTER_MAX_SEARCH_LENGTH + ')',
                    image: 'https://img.icons8.com/?size=100&id=63688&format=png&color=000000'
                });
                return;
            }
        } else {
            filter.search = undefined;
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
        toast.create({
            text: 'Saved filter',
            image: 'https://img.icons8.com/?size=100&id=sz8cPVwzLrMP&format=png&color=000000'
        });        
        componentBlueprint.selectedTabIndex = 0;
        syncCustomView();
        showComponent();
    }

    async function removeFilter(filter) {
        localDatabase.removeEntry(STORE_NAME, filter.key);
        savedFilters = savedFilters.filter(a => a.key !== filter.key);
        syncCustomView();
        showComponent();
    }

    function syncListingsView() {
        const marketData = events.getLast('reader-market');
        if(!marketData) {
            return;
        }
        // do nothing on own listings tab
        if(marketData.type === 'OWN') {
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

        let matchingListings = marketData.listings.filter(listing => listing.item in conversionsByItem);
        for(const listing of matchingListings) {
            listing.ratio = listing.price / conversionsByItem[listing.item].amount;
        }
        matchingListings.sort((a,b) => (a.type === 'BUY' ? 1 : -1) * (b.ratio - a.ratio));
        if(currentFilter.amount) {
            matchingListings = matchingListings.slice(0, currentFilter.amount);
        }
        for(const listing of marketData.listings) {
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
        for(const element of marketData.listings.map(a => a.element)) {
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
                        showComponent();
                    }
                },{
                    text: 'Remove',
                    color: 'danger',
                    action: removeFilter.bind(null,savedFilter)
                }]
            });
        }
    }

    function hideComponent() {
        components.removeComponent(componentBlueprint);
    }

    function showComponent() {
        if(!enabled) {
            return;
        }
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
                }].concat(Object.keys(TYPE_TO_ITEM).map(a => ({
                    text: a,
                    value: a,
                    selected: false
                })))
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
