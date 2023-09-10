(elementWatcher, events, dataExtractor, colorMapper) => {

    //TODO
    // allow choosing where the page is added in a category
    // now it just gets added to the top

    const exports = {
        registerPage
    }

    const registeredPages = [];

    // pageblueprint
    const pbp = {
        'category': '',
        'pageName': '',
        'pageImage': '',
        'columns': '',
        'onVisit': () => { console.log('visit') }
    }

    function initialise() {
        events.register('url', handlePage);
        addStyles();
    }

    async function handlePage(page) {
        const onCustomPage = registeredPages.some(p => 
            page.endsWith(pagePathFromPageName(p.pageName))
        );
        if(!onCustomPage) {
            $('custom-page').remove();
            $(`nav-component > div.nav > div.scroll > button`)
                .removeClass('customActiveLink');
            //await headerPageNameChangeBugFix(page);
        }
    }

    // hacky shit, idk why angular stops updating page header title ???
    async function headerPageNameChangeBugFix(page) {
        await elementWatcher.exists('nav-component > div.nav');
        //console.log($('header-component div.wrapper > div.image > img').attr('src'));
        if(page.includes('/skill/')) {
            const regexp = /\d+/g;
            const matches = page.match(regexp);
            const skills = Object.values(dataExtractor.skills);
            const thisSkillName = skills.find(s => s.id === matches[0]).name
            $('header-component div.wrapper > div.title').text(thisSkillName);
        } else {
            let pageName = page.split('/').pop();
            pageName = pageName.charAt(0).toUpperCase() + pageName.slice(1);
            $('header-component div.wrapper > div.title').text(pageName);
        }
    }

    async function registerPage(pageBlueprint, pageHandler) {
        if(!pageBlueprint.pageName) {
            console.error('Custom Page needs a name.');
            return;
        }
        const exists = registeredPages.find(p => p.pageName === pageBlueprint.pageName);
        if(exists) {
            console.error('Page already registered.', pageBlueprint);
            return;
        }
        pageBlueprint.pageHandler = pageHandler;
        registeredPages.push(pageBlueprint);
        console.log('Registered pages', registeredPages)
        await setupNavigation(pageBlueprint);
    }

    async function setupNavigation(pageBlueprint) {
        await elementWatcher.exists('div.nav > div.scroll');
        // MENU HEADER / CATEGORY
        const category = pageBlueprint.category?.toUpperCase() || 'MISC'; // if none was given, will add to MISC
        let menuHeader = $(`nav-component > div.nav > div.scroll > div.header:contains('${category}'), div.customMenuHeader:contains('${category}')`);
        if(!menuHeader.length) {
            menuHeader = createMenuHeader(category);
            $('nav-component > div.nav > div.scroll')
                .prepend(menuHeader);
        }
        // MENU BUTTON / PAGE LINK
        //const menuButtonExists = $(`nav-component > div.nav > div.scroll > button > div.name:contains('${pageBlueprint.pageName}'), div.customMenuButtonText:contains('${pageBlueprint.pageName}')`);
        //console.log(menuButtonExists);
        const menuButton = createMenuButton(
            pageBlueprint.pageName,
            pageBlueprint.pageImage,
            pageBlueprint
        )
        if(pageBlueprint.after) {
            $(pageBlueprint.after)
                .parent().after(menuButton);
        } else {
            menuHeader.after(menuButton);
        }
    }

    function pagePathFromPageName(pageName) {
        return pageName.toLowerCase().replaceAll(' ', '-')
    }

    async function visitPage(pageBlueprint) {
        if(!!$('custom-page').length) {
            $('custom-page').remove();
        } else {
            await visitSettingsPageAndDeleteEverything();
        }
        createPage(pageBlueprint.columns ?? 1);
        updatePageHeader(pageBlueprint.pageImage, pageBlueprint.pageName);
        updateActivePageInNav(pageBlueprint.pageName);
        window.history.pushState({}, '', pagePathFromPageName(pageBlueprint.pageName));
        await pageBlueprint.pageHandler();
        pageBlueprint.onVisit();
    }

    function updatePageHeader(image, text) {
        console.log('setting header to', text);
        $('header-component div.wrapper > div.image > img').attr('src', `${image ?? 'https://ironwoodrpg.com/assets/misc/settings.png'}`);
        $('header-component div.wrapper > div.title').text(text);
    }

    function updateActivePageInNav(pageName) {
        //Set other pages as inactive
        $(`nav-component > div.nav > div.scroll > button`)
            .removeClass('active-link')
            .removeClass('customActiveLink');
        //Set this page as active
        $(`nav-component > div.nav > div.scroll > button > div.customMenuButtonText:contains('${pageName}')`)
            .parent()
            .addClass('customActiveLink');
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

    async function visitSettingsPageAndDeleteEverything() {
        // Go to settings page
        $(`nav-component > div.nav > div.scroll > button > div.name:contains('Settings')`).trigger('click');
        // Wait for load
        await elementWatcher.exists('settings-page');
        // Delete settings-page
        $('settings-page').remove();
    }

    function createMenuHeader(text) {
        const menuHeader =
            $('<div/>')
                .addClass('customMenuHeader')
                .append(
                    $('<div/>')
                        .addClass('customMenuHeaderText')
                        .text(text)
                );
        return menuHeader;
    }

    function createMenuButton(text, image, blueprint) {
        const menuButton =
            $('<button/>')
                .attr('type', 'button')
                .addClass('customMenuButton')
                .click(() => visitPage(blueprint))
                .append(
                    $('<img/>')
                        .addClass('customMenuButtonImage')
                        .attr('src', `${image ?? 'https://ironwoodrpg.com/assets/misc/settings.png'}`)
                )
                .append(
                    $('<div/>')
                        .addClass('customMenuButtonText')
                        //.text(text.charAt(0).toUpperCase() + text.slice(1)) // uppercase first letter
                        .text(text)
                );
        return menuButton;
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
            height: 28px !important;
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
            height: 28px !important;
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
            image-rendering: pixelated;
            height: 20px !important;
            width: 20px !important;
        }
        .customMenuButtonText {
            margin-left: var(--margin);
            flex: 1;
        }
        .customGroups {
            display: flex;
            gap: var(--gap);
        }
        .customGroup {
            flex: 1;
        }
        .customActiveLink {
            background-color: var(--darker-color);
        }
    `;

    initialise();

    return exports
}
