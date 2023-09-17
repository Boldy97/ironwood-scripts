(elementWatcher, events, colorMapper, util, skillCache) => {

    const registerPageHandler = events.register.bind(null, 'page');
    const getLastPage = events.getLast.bind(null, 'page');

    const exports = {
        register,
        requestRender,
        show,
        hide
    }

    const pages = [];

    function initialise() {
        registerPageHandler(handlePage);
        addStyles();
    }

    function handlePage(page) {
        // handle navigating away
        if(!pages.some(p => p.path === page.type)) {
            $('custom-page').remove();
            $('nav-component > div.nav > div.scroll > button')
                .removeClass('customActiveLink');
            $('header-component div.wrapper > div.image > img')
                .css('image-rendering', '');
            headerPageNameChangeBugFix(page);
        }
    }

    async function register(page) {
        if(pages.some(p => p.name === page.name)) {
            console.error(`Custom page already registered : ${page.name}`);
            return;
        }
        page.path = page.name.toLowerCase().replaceAll(' ', '-');
        page.class = `customMenuButton_${page.path}`;
        page.image = page.image || 'https://ironwoodrpg.com/assets/misc/settings.png';
        page.category = page.category?.toUpperCase() || 'MISC';
        page.columns = page.columns || 1;
        pages.push(page);
        console.debug('Registered pages', pages);
        await setupNavigation(page);
    }

    function show(name) {
        const page = pages.find(p => p.name === name)
        if(!page) {
            console.error(`Could not find page : ${name}`);
            return;
        }
        $(`.${page.class}`).show();
    }

    function hide(name) {
        const page = pages.find(p => p.name === name)
        if(!page) {
            console.error(`Could not find page : ${name}`);
            return;
        }
        $(`.${page.class}`).hide();
    }

    function requestRender(name) {
        const page = pages.find(p => p.name === name)
        if(!page) {
            console.error(`Could not find page : ${name}`);
            return;
        }
        if(getLastPage()?.type === page.path) {
            render(page);
        }
    }

    function render(page) {
        $('.customComponent').remove();
        page.render();
    }

    async function setupNavigation(page) {
        await elementWatcher.exists('div.nav > div.scroll');
        // MENU HEADER / CATEGORY
        let menuHeader = $(`nav-component > div.nav > div.scroll > div.header:contains('${page.category}'), div.customMenuHeader:contains('${page.category}')`);
        if(!menuHeader.length) {
            menuHeader = createMenuHeader(page.category);
        }
        // MENU BUTTON / PAGE LINK
        const menuButton = createMenuButton(page)
        // POSITIONING
        if(page.after) {
            $(`nav-component button:contains('${page.after}')`).after(menuButton);
        } else {
            menuHeader.after(menuButton);
        }
    }

    function createMenuHeader(text) {
        const menuHeader =
            $('<div/>')
                .addClass('header customMenuHeader')
                .append(
                    $('<div/>')
                        .addClass('customMenuHeaderText')
                        .text(text)
                );
        $('nav-component > div.nav > div.scroll')
            .prepend(menuHeader);
        return menuHeader;
    }

    function createMenuButton(page) {
        const menuButton =
            $('<button/>')
                .attr('type', 'button')
                .addClass(`customMenuButton ${page.class}`)
                .css('display', 'none')
                .click(() => visitPage(page))
                .append(
                    $('<img/>')
                        .addClass('customMenuButtonImage')
                        .attr('src', page.image)
                        .css('image-rendering', page.imagePixelated ? 'pixelated' : 'auto')
                )
                .append(
                    $('<div/>')
                        .addClass('customMenuButtonText')
                        .text(page.name)
                );
        return menuButton;
    }

    async function visitPage(page) {
        if($('custom-page').length) {
            $('custom-page').remove();
        } else {
            await setupEmptyPage();
        }
        createPage(page.columns);
        updatePageHeader(page);
        updateActivePageInNav(page.name);
        history.pushState({}, '', page.path);
        page.render();
    }

    async function setupEmptyPage() {
        util.goToPage('settings');
        await elementWatcher.exists('settings-page');
        $('settings-page').remove();
    }

    function createPage(columnCount) {
        const custompage = $('<custom-page/>');
        const columns = $('<div/>')
            .addClass('customGroups');
        for(let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
            columns.append(
                $('<div/>')
                    .addClass('customGroup')
                    .addClass(`column${columnIndex}`)
            )
        };
        custompage.append(columns);
        $('div.padding > div.wrapper > router-outlet').after(custompage);
    }

    function updatePageHeader(page) {
        $('header-component div.wrapper > div.image > img')
            .attr('src', page.image)
            .css('image-rendering', page.imagePixelated ? 'pixelated' : 'auto');
        $('header-component div.wrapper > div.title').text(page.name);
    }

    function updateActivePageInNav(name) {
        //Set other pages as inactive
        $(`nav-component > div.nav > div.scroll > button`)
            .removeClass('active-link')
            .removeClass('customActiveLink');
        //Set this page as active
        $(`nav-component > div.nav > div.scroll > button > div.customMenuButtonText:contains('${name}')`)
            .parent()
            .addClass('customActiveLink');
    }

    // hacky shit, idk why angular stops updating page header title ???
    async function headerPageNameChangeBugFix(page) {
        await elementWatcher.exists('nav-component > div.nav');
        let headerName = null;
        if(page.type === 'action') {
            await skillCache.ready;
            headerName = skillCache.byId[page.skill].name;
        } else if(page.type === 'automation') {
            headerName = 'House';
        } else if(page.type === 'structure') {
            headerName = 'House';
        } else {
            headerName = page.type;
            headerName = headerName.charAt(0).toUpperCase() + headerName.slice(1);
        }
        $('header-component div.wrapper > div.title').text(headerName);
    }

    function addStyles() {
        const head = document.getElementsByTagName('head')[0]
        if(!head) { return; }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = styles;
        head.appendChild(style);
    }

    const styles = `
        :root {
            --background-color: ${colorMapper('componentRegular')};
            --border-color: ${colorMapper('componentLight')};
            --darker-color: ${colorMapper('componentDark')};
        }
        .customMenuHeader {
            height: 56px;
            display: flex;
            align-items: center;
            padding: 0 24px;
            color: #aaa;
            font-size: .875rem;
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
            border-bottom: 1px solid var(--border-color);
            background-color: var(--background-color);
        }
        .customMenuHeaderText {
            flex: 1;
        }
        .customMenuButton {
            border: none;
            background: transparent;
            font-family: inherit;
            font-size: inherit;
            line-height: 1.5;
            font-weight: inherit;
            color: inherit;
            resize: none;
            text-transform: inherit;
            letter-spacing: inherit;
            cursor: pointer;
            height: 56px;
            display: flex;
            align-items: center;
            padding: 0 24px;
            border-bottom: 1px solid var(--border-color);
            width: 100%;
            text-align: left;
            position: relative;
            background-color: var(--background-color);
        }
        .customMenuButtonImage {
            max-width: 100%;
            max-height: 100%;
            height: 32px;
            width: 32px;
        }
        .customMenuButtonText {
            margin-left: var(--margin);
            flex: 1;
        }
        .customGroups {
            display: flex;
            gap: var(--gap);
            flex-wrap: wrap;
        }
        .customGroup {
            flex: 1;
            min-width: 360px;
        }
        .customActiveLink {
            background-color: var(--darker-color);
        }
    `;

    initialise();

    return exports
}
