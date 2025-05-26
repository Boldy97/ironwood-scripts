(elementWatcher, colorMapper, elementCreator, localDatabase, Promise, util, hotkey) => {

    const exports = {
        addComponent,
        removeComponent,
        removeAllComponents,
        search
    };

    const initialised = new Promise.Expiring(2000, 'components');
    const STORE_NAME = 'component-tabs';
    const rowTypeMappings = {
        item: createRow_Item,
        input: createRow_Input,
        itemWithInput: createRow_ItemWithInput,
        break: createRow_Break,
        buttons: createRow_Button,
        dropdown: createRow_Select,
        header: createRow_Header,
        checkbox: createRow_Checkbox,
        segment: createRow_Segment,
        progress: createRow_Progress,
        chart: createRow_Chart,
        list: createRow_List,
        chat: createCompositeRow_Chat
    };
    let selectedTabs = null;

    async function initialise() {
        elementCreator.addStyles(styles);
        selectedTabs = await localDatabase.getAllEntries(STORE_NAME);
        initialised.resolve(exports);
    }

    function removeComponent(blueprint) {
        $(`#${blueprint.componentId}`).remove();
    }

    function removeAllComponents() {
        $('.custom-component').remove();
    }

    async function addComponent(blueprint) {
        if (blueprint?.meta?.focused) {
            return; // delay until no longer having focus
        }
        if ($(blueprint.dependsOn).length) {
            actualAddComponent(blueprint);
            return;
        }
        await elementWatcher.exists(blueprint.dependsOn);
        actualAddComponent(blueprint);
    }

    function actualAddComponent(blueprint) {
        const component =
            $('<div/>')
                .addClass('customComponent')
                .attr('id', blueprint.componentId)
                .append('<div class="componentStateMessage" style="display: none"></div>');
        if (blueprint.onClick) {
            component
                .click(blueprint.onClick)
                .css('cursor', 'pointer');
        }

        // TABS
        const selectedTabMatch = selectedTabs.find(a => a.key === blueprint.componentId);
        if (selectedTabMatch) {
            blueprint.selectedTabIndex = selectedTabMatch.value;
            selectedTabs = selectedTabs.filter(a => a.key !== blueprint.componentId);
        }
        const theTabs = createTab(blueprint);
        component.append(theTabs);

        // PAGE
        const selectedTabBlueprint = blueprint.tabs[blueprint.selectedTabIndex] || blueprint.tabs[0];
        selectedTabBlueprint.rows.forEach((rowBlueprint, index) => {
            component.append(createRow(rowBlueprint, blueprint));
        });

        const existing = $(`#${blueprint.componentId}`);
        if (existing.length) {
            existing.replaceWith(component);
        } else if (blueprint.prepend) {
            $(blueprint.parent).prepend(component);
        } else {
            $(blueprint.parent).append(component);
        }

        if (blueprint.after) {
            blueprint.after();
        }
    }

    function createTab(blueprint) {
        if (!blueprint.selectedTabIndex) {
            blueprint.selectedTabIndex = 0;
        }
        if (blueprint.tabs.filter(t => !t.hidden).length === 1) {
            return;
        }
        const tabContainer = $('<div/>').addClass('tabs');
        blueprint.tabs.forEach((element, index) => {
            if (element.hidden) {
                return;
            }
            const tab = $('<button/>')
                .attr('type', 'button')
                .addClass('tabButton')
                .text(element.title)
                .click(changeTab.bind(null, blueprint, index));
            if (blueprint.selectedTabIndex !== index) {
                tab.addClass('tabButtonInactive')
            }
            if (index !== 0) {
                tab.addClass('lineLeft')
            }
            tabContainer.append(tab);
        });
        return tabContainer;
    }

    function createRow(rowBlueprint, rootBlueprint) {
        if (!rowTypeMappings[rowBlueprint.type]) {
            console.warn(`Skipping unknown row type in blueprint: ${rowBlueprint.type}`, rowBlueprint);
            return;
        }
        if (rowBlueprint.hidden) {
            return;
        }
        return rowTypeMappings[rowBlueprint.type](rowBlueprint, rootBlueprint);
    }

    function createRow_Item(itemBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        if (itemBlueprint.image) {
            parentRow.append(createImage(itemBlueprint));
        }
        if (itemBlueprint?.name) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemName name')
                        .text(itemBlueprint.name)
                );
        }
        parentRow // always added because it spreads pushes name left and value right !
            .append(
                $('<div/>')
                    .addClass('myItemValue')
                    .text(itemBlueprint?.extra || '')
            );
        if (itemBlueprint?.value) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemWorth')
                        .text(itemBlueprint.value)
                )
        }
        return parentRow;
    }

    function createRow_Input(inputBlueprint, rootBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        if (inputBlueprint.text) {
            const text = $('<div/>')
                .addClass('myItemInputText')
                .addClass(inputBlueprint.class || '')
                .text(inputBlueprint.text)
                .css('flex', `${inputBlueprint.layout?.split('/')[0] || 1}`);
            if (inputBlueprint.light) {
                text
                    .css('padding', '0')
                    .css('height', 'inherit')
                    .css('color', '#aaa');
            }
            parentRow.append(text);
        }
        const input = $('<input/>')
            .attr('id', inputBlueprint.id)
            .addClass('myItemInput')
            .addClass(inputBlueprint.class || '')
            .attr('type', inputBlueprint.inputType || 'text')
            .attr('placeholder', inputBlueprint.name)
            .attr('value', inputBlueprint.value || '')
            .css('flex', `${inputBlueprint.layout?.split('/')[1] || 1}`)
            .keyup(e => inputBlueprint.value = e.target.value)
            .on('focusin', onInputFocusIn.bind(null, rootBlueprint, inputBlueprint))
            .on('focusout', onInputFocusOut.bind(null, rootBlueprint, inputBlueprint));
        if (inputBlueprint.light) {
            input
                .css('padding', '0')
                .css('height', 'inherit')
                .css('color', '#aaa');
        }
        parentRow.append(input)
        return parentRow;
    }

    function createRow_ItemWithInput(itemWithInputBlueprint, rootBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');

        if (itemWithInputBlueprint.image) {
            parentRow.append(createImage(itemWithInputBlueprint));
        }

        if (itemWithInputBlueprint?.name) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemName name')
                        .text(itemWithInputBlueprint.name)
                );
        }

        parentRow
            .append(
                $('<input/>')
                    .attr('id', itemWithInputBlueprint.id)
                    .addClass('myItemInput')
                    .addClass(itemWithInputBlueprint.class || '')
                    .attr('type', itemWithInputBlueprint.inputType || 'text')
                    .attr('placeholder', itemWithInputBlueprint.placeholder)
                    .attr('value', itemWithInputBlueprint.inputValue || '')
                    .css('flex', `${itemWithInputBlueprint.layout?.split('/')[1] || 1}`)
                    .css('max-width', '80px')
                    .css('height', 'inherit')
                    .keyup(inputDelay(function (e) {
                        itemWithInputBlueprint.inputValue = e.target.value;
                        if (itemWithInputBlueprint.action) {
                            itemWithInputBlueprint.action(itemWithInputBlueprint.inputValue);
                        }
                    }, itemWithInputBlueprint.delay || 0))
                    .on('focusin', onInputFocusIn.bind(null, rootBlueprint, itemWithInputBlueprint))
                    .on('focusout', onInputFocusOut.bind(null, rootBlueprint, itemWithInputBlueprint))
            )

        parentRow
            .append(
                $('<div/>')
                    .addClass('myItemValue')
                    .text(itemWithInputBlueprint?.extra || '')
            );

        if (itemWithInputBlueprint?.value) {
            parentRow
                .append(
                    $('<div/>')
                        .addClass('myItemWorth')
                        .text(itemWithInputBlueprint.value)
                )
        }
        return parentRow;
    }

    function onInputFocusIn(rootBlueprint, inputBlueprint) {
        if (!rootBlueprint.meta) {
            rootBlueprint.meta = {};
        }
        rootBlueprint.meta.focused = true;
        $(`#${rootBlueprint.componentId}`)
            .find('.componentStateMessage')
            .text('Focused - interrupted updates')
            .show();
        hotkey.attach("Escape", () => {
            $(`#${inputBlueprint.id}`)?.blur();
            $(`#${inputBlueprint.id}_input`)?.blur();
        }, true);
    }

    function onInputFocusOut(rootBlueprint, inputBlueprint) {
        if (!rootBlueprint.meta) {
            rootBlueprint.meta = {};
        }
        rootBlueprint.meta.focused = false;
        $(`#${rootBlueprint.componentId}`)
            .find('.componentStateMessage')
            .hide();
        hotkey.detach("Escape");
        if (inputBlueprint.action) {
            inputBlueprint.action(inputBlueprint.value);
        }
    }

    function createRow_Break(breakBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        parentRow.append('<br/>');
        return parentRow;
    }

    function createRow_Button(buttonBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        for (const button of buttonBlueprint.buttons) {
            parentRow
                .append(
                    $(`<button class='myButton'>${button.text}</button>`)
                        .css('background-color', button.disabled ? '#ffffff0a' : colorMapper(button.color || 'primary'))
                        .css('flex', `${button.size || 1} 1 0`)
                        .prop('disabled', !!button.disabled)
                        .addClass(button.class || '')
                        .click(button.action)
                );
        }
        return parentRow;
    }

    function createRow_Select(selectBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        const select = $('<select/>')
            .addClass('myItemSelect')
            .addClass(selectBlueprint.class || '')
            .change(inputDelay(function (e) {
                for (const option of selectBlueprint.options) {
                    option.selected = this.value === option.value;
                }
                if (selectBlueprint.action) {
                    selectBlueprint.action(this.value);
                }
            }, selectBlueprint.delay || 0));
        for (const option of selectBlueprint.options) {
            select.append(`<option value='${option.value}' ${option.selected ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}>${option.text}</option>`);
        }
        parentRow.append(select);
        return parentRow;
    }

    function createRow_Header(headerBlueprint) {
        const parentRow =
            $('<div/>')
                .addClass('myHeader lineTop')
        if (headerBlueprint.image) {
            parentRow.append(createImage(headerBlueprint));
        }
        parentRow.append(
            $('<div/>')
                .addClass('myName')
                .text(headerBlueprint.title)
        )
        if (headerBlueprint.action) {
            parentRow
                .append(
                    $('<button/>')
                        .addClass('myHeaderAction')
                        .text(headerBlueprint.name)
                        .attr('type', 'button')
                        .css('background-color', colorMapper(headerBlueprint.color || 'success'))
                        .click(headerBlueprint.action)
                )
        } else if (headerBlueprint.textRight) {
            parentRow.append(
                $('<div/>')
                    .addClass('level')
                    .text(headerBlueprint.title)
                    .css('margin-left', 'auto')
                    .html(headerBlueprint.textRight)
            )
        }
        if (headerBlueprint.centered) {
            parentRow.css('justify-content', 'center');
        }
        return parentRow;
    }

    function createRow_Checkbox(checkboxBlueprint) {
        const checked_false = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 24 24' stroke-width='1.5' stroke='currentColor' fill='none' stroke-linecap='round' stroke-linejoin='round' class='customCheckBoxDisabled ng-star-inserted'><path stroke='none' d='M0 0h24v24H0z' fill='none'></path><rect x='4' y='4' width='16' height='16' rx='2'></rect></svg>`;
        const checked_true = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 24 24' stroke-width='1.5' stroke='currentColor' fill='none' stroke-linecap='round' stroke-linejoin='round' class='customCheckBoxEnabled ng-star-inserted'><path stroke='none' d='M0 0h24v24H0z' fill='none'></path><rect x='4' y='4' width='16' height='16' rx='2'></rect><path d='M9 12l2 2l4 -4'></path></svg>`;

        const buttonInnerHTML = checkboxBlueprint.checked ? checked_true : checked_false;

        const parentRow = $('<div/>').addClass('customRow')
            .append(
                $('<div/>')
                    .addClass('customCheckBoxText')
                    .text(checkboxBlueprint?.text || '')
            )
            .append(
                $('<div/>')
                    .addClass('customCheckboxCheckbox')
                    .append(
                        $(`<button>${buttonInnerHTML}</button>`)
                            .html(buttonInnerHTML)
                            .click(() => {
                                checkboxBlueprint.checked = !checkboxBlueprint.checked;
                                if (checkboxBlueprint.action) {
                                    checkboxBlueprint.action(checkboxBlueprint.checked);
                                }
                            })
                    )

            );

        return parentRow;
    }

    function createRow_Segment(segmentBlueprint, rootBlueprint) {
        if (segmentBlueprint.hidden) {
            return;
        }
        return segmentBlueprint.rows.flatMap(a => createRow(a, rootBlueprint));
    }

    function createRow_Progress(progressBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        const up = progressBlueprint.numerator;
        const down = progressBlueprint.denominator;
        parentRow.append(
            $('<div/>')
                .addClass('myBar')
                .append(
                    $('<div/>')
                        .css('height', '100%')
                        .css('width', progressBlueprint.progressPercent + '%')
                        .css('background-color', colorMapper(progressBlueprint.color || 'rgb(122, 118, 118)'))
                )
        );
        parentRow.append(
            $('<div/>')
                .addClass('myPercent')
                .text(progressBlueprint.progressPercent + '%')
        )
        parentRow.append(
            $('<div/>')
                .css('margin-left', 'auto')
                .text(progressBlueprint.progressText)
        )
        return parentRow;
    }

    function createRow_Chart(chartBlueprint) {
        const parentRow = $('<div/>')
            .addClass('lineTop')
            .append(
                $('<canvas/>')
                    .attr('id', chartBlueprint.chartId)
            );
        return parentRow;
    }

    function createRow_List(listBlueprint) {
        const parentRow = $('<div/>').addClass('customRow');
        parentRow // always added because it spreads pushes name left and value right !
            .append(
                $('<ul/>')
                    .addClass('myListDescription')
                    .append(...listBlueprint.entries.map(entry =>
                        $('<li/>')
                            .addClass('myListLine')
                            .text(entry)
                    ))
            );
        return parentRow;
    }

    //fuuuuuuuuk, overly "complex", but works, needs refactoring
    function createCompositeRow_Chat(chatblueprint, rootBlueprint) {
        const colorMap = {
            'C:red': '#b35c5c',
            'C:gre': '#5c8f5c',
            'C:blu': '#5c7ca6',
            'C:cya': '#5ca6a6',
            'C:whi': '#aaa9a9',
            'C:bla': '#444',
            'C:pur': '#7c5c8f',
            'C:yel': '#b3a35c',
            'C:ora': '#b37c5c'
        };

        const modifiers = {
            'C': {
                update: (value, state) => {
                    const colorKey = `C:${value.toLowerCase()}`;
                    if (colorMap[colorKey]) {
                        state.backgroundColor = colorMap[colorKey];
                    }
                },
                apply: (elem, state) => {
                    if (state.backgroundColor) {
                        elem.css('background-color', state.backgroundColor);
                    }
                }
            },
            'B': {
                update: (_, state) => {
                    state.bold = true;
                },
                apply: (elem, state) => {
                    if (state.bold) {
                        elem.css('font-weight', 'bold');
                    }
                }
            },
            'I': {
                update: (_, state) => {
                    state.italic = true;
                },
                apply: (elem, state) => {
                    if (state.italic) {
                        elem.css('font-style', 'italic');
                    }
                }
            }
        };

        const wrapper = $('<div/>');
        const ChatMessagesRow = $('<div/>').addClass('chatMessageRow').attr('id', chatblueprint.id);

        chatblueprint.messages.forEach(message => {
            const msgElem = $('<p/>').addClass('myChatMessage');

            const content = message.content || {};
            const type = content.type || 'chat_raw';

            const { cleanedText, currentStyle } = parseModifiersAndCleanText(content.message, modifiers);

            switch (type) {
                case 'chat_system': {

                    for (const key in modifiers) {
                        modifiers[key].apply?.(msgElem, currentStyle);
                    }

                    cleanedText.split('\n').forEach((line, i, arr) => {
                        msgElem.append(document.createTextNode(line));
                        if (i < arr.length - 1) {
                            msgElem.append(document.createElement('br'));
                        }
                    });

                    break;
                }
                case 'chat_message': {
                    appendTimestamp(msgElem, message.time);
                    appendSender(msgElem, content.sender);

                    for (const key in modifiers) {
                        if (key === 'C') {
                            modifiers[key].apply?.(msgElem, currentStyle);
                        }
                    }

                    const textWrapper = $('<span/>').append(document.createTextNode(cleanedText));
                    for (const key in modifiers) {
                        if (key !== 'C') {
                            modifiers[key].apply?.(textWrapper, currentStyle);
                        }
                    }

                    msgElem.append(textWrapper);

                    break;
                }
                case "chat_roleplay": {
                    appendTimestamp(msgElem, message.time);

                    for (const key in modifiers) {
                        if (key === 'C') {
                            modifiers[key].apply?.(msgElem, currentStyle);
                        }
                    }

                    const wrapper = $('<span/>');
                    wrapper
                        .append($('<span/>')
                            .css('font-weight', 'bold')
                            .css('font-style', 'italic')
                            .text(content.sender + ' ' + cleanedText));
                    msgElem.append(wrapper);
                    break;
                }
                case "chat_raw": {
                    appendTimestamp(msgElem, message.time);
                    appendSender(msgElem, content.sender);
                    msgElem.append($('<span/>').text(content.message));
                    break;
                }
                case "chat_trade": {

                    // todo different layouts for buy or sell
                    // if buying, go to orders tab after navigating to market

                    appendTimestamp(msgElem, message.time);
                    msgElem.append($('<span/>')
                        .text(content.sender + ' ' + "is looking to sell:"));
                    msgElem.addClass('chatTradeMessage');

                    const container = $('<div/>').addClass('chatTradeMessageContainer')
                    container.append(
                        $('<img/>')
                            .addClass('chatTradeMessageImage')
                            .attr('src', `https://ironwoodrpg.com/assets/items/rock-silver.png`)
                    )
                    const infoContainer = $('<div/>').addClass('chatTradeMessageInformation');
                    container.append(
                        infoContainer
                            .append($('<span/>').text(`Name: ${content.message || 'Skibidi'}`))
                            .append($('<span/>').text(`Price: ${content.price || '420'}`))
                            .append($('<span/>').text(`Quantity: ${content.quantity || '69'}`))
                            .append(
                                $('<a/>')
                                    .text(`Click here to view`)
                                    .click(async () => {
                                        util.goToPage('market');
                                        await elementWatcher.exists('market-listings-component .search > input');
                                        const searchReference = $('market-listings-component .search > input');
                                        searchReference.val(content.message);
                                        searchReference[0].dispatchEvent(new Event('input'));
                                    })
                            )
                    )

                    msgElem.append(container);

                    break;
                }
            }

            ChatMessagesRow.append(msgElem);
        });


        const chatInputRow = $('<div/>').addClass('chatInputRow');

        const input = $('<input/>')
            .attr({
                id: `${chatblueprint.id}_input`,
                type: chatblueprint.inputType || 'text',
                placeholder: chatblueprint.inputPlaceholder,
                value: chatblueprint.inputValue || '',
                autocomplete: 'off'
            })
            .addClass('myItemInput chatMessageInput')
            .addClass(chatblueprint.class || '')
            .css('flex', `${chatblueprint.inputLayout?.split('/')[1] || 1}`)
            .on('focusin', () => onInputFocusIn(rootBlueprint, chatblueprint))
            .on('focusout', () => onInputFocusOut(rootBlueprint, chatblueprint))
            .on('keyup', e => {
                chatblueprint.inputValue = $(`#${chatblueprint.id}_input`).val();
                if (e.key === 'Enter' || e.keyCode === 13) {
                    chatblueprint.submit(chatblueprint.inputValue);
                    clearOnSubmit();
                }
            });

        const sendButton = $('<button/>')
            .addClass('myItemInputSendMessageButton')
            .addClass(chatblueprint.class || '')
            .text('Send')
            .css('flex', `${chatblueprint.inputLayout?.split('/')[0] || 1}`)
            .on('click', () => {
                chatblueprint.submit(chatblueprint.inputValue);
                clearOnSubmit();
            });

        function clearOnSubmit() {
            $(`#${chatblueprint.id}_input`).val('').trigger('keyup').trigger('focusout');
        }

        function appendTimestamp(container, timestamp) {
            if (!timestamp) return;
            container.append(
                $('<span/>')
                    .addClass('myChatMessageTime')
                    .text(`[${util.unixToHMS(timestamp)}] `)
            );
        }

        function appendSender(container, sender) {
            if (!sender) return;
            container.append(
                $('<span/>')
                    .addClass('myChatMessageSender')
                    .text(`${sender}: `)
            );
        }
        function parseModifiersAndCleanText(msgText, modifiers) {
            const modifierRegex = /@([A-Z])(?::([^@]+))?@/gi;
            const currentStyle = {};

            const cleanedText = msgText.replace(modifierRegex, (_, key, val) => {
                const upperKey = key.toUpperCase();
                const mod = modifiers[upperKey];
                if (mod) {
                    mod.update(val, currentStyle);
                }
                return '';
            }).trim();

            return { cleanedText, currentStyle };
        }

        chatInputRow.append(input, sendButton);
        wrapper.append(ChatMessagesRow, chatInputRow);
        return wrapper;
    }

    function createImage(blueprint) {
        return $('<div/>')
            .addClass('myItemImage image')
            .append(
                $('<img/>')
                    .attr('src', `${blueprint.image}`)
                    .css('filter', `${blueprint.imageFilter}`)
                    .css('image-rendering', blueprint.imagePixelated ? 'pixelated' : 'auto')
            )
    }

    function changeTab(blueprint, index) {
        blueprint.selectedTabIndex = index;
        localDatabase.saveEntry(STORE_NAME, {
            key: blueprint.componentId,
            value: index
        });
        selectedTabs = selectedTabs.filter(a => a.key !== blueprint.componentId);
        addComponent(blueprint);
    }

    function inputDelay(callback, ms) {
        var timer = 0;
        return function () {
            var context = this, args = arguments;
            window.clearTimeout(timer);
            timer = window.setTimeout(function () {
                callback.apply(context, args);
            }, ms || 0);
        };
    }

    function search(blueprint, query) {
        if (!blueprint.idMappings) {
            generateIdMappings(blueprint);
        }
        if (!blueprint.idMappings[query]) {
            throw `Could not find id ${query} in blueprint ${blueprint.componentId}`;
        }
        return blueprint.idMappings[query];
    }

    function generateIdMappings(blueprint) {
        blueprint.idMappings = {};
        for (const tab of blueprint.tabs) {
            addIdMapping(blueprint, tab);
            for (const row of tab.rows) {
                addIdMapping(blueprint, row);
            }
        }
    }

    function addIdMapping(blueprint, element) {
        if (element.id) {
            if (blueprint.idMappings[element.id]) {
                throw `Detected duplicate id ${element.id} in blueprint ${blueprint.componentId}`;
            }
            blueprint.idMappings[element.id] = element;
        }
        let subelements = null;
        if (element.type === 'segment') {
            subelements = element.rows;
        }
        if (element.type === 'buttons') {
            subelements = element.buttons;
        }
        if (subelements) {
            for (const subelement of subelements) {
                addIdMapping(blueprint, subelement);
            }
        }
    }

    const styles = `
        :root {
            --background-color: ${colorMapper('componentRegular')};
            --border-color: ${colorMapper('componentLight')};
            --darker-color: ${colorMapper('componentDark')};
        }
        .customComponent {
            position: relative;
            margin-top: var(--gap);
            background-color: var(--background-color);
            box-shadow: 0 6px 12px -6px #0006;
            border-radius: 4px;
            width: 100%;
        }
        .myHeader {
            display: flex;
            align-items: center;
            padding: 12px var(--gap);
            gap: var(--gap);
        }
        .myName {
            font-weight: 600;
            letter-spacing: .25px;
        }
        .myHeaderAction{
            margin: 0px 0px 0px auto;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 0px 5px;
        }
        .customRow {
            display: flex;
            justify-content: center;
            align-items: center;
            border-top: 1px solid var(--border-color);
            /*padding: 5px 12px 5px 6px;*/
            min-height: 0px;
            min-width: 0px;
            gap: var(--margin);
            padding: calc(var(--gap) / 2) var(--gap);
        }
        .myItemImage {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 24px;
            width: 24px;
            min-height: 0px;
            min-width: 0px;
        }
        .myItemImage > img {
            max-width: 100%;
            max-height: 100%;
            width: 100%;
            height: 100%;
        }
        .myItemValue {
            display: flex;
            align-items: center;
            flex: 1;
            color: #aaa;
        }
        .myItemInputText {
            height: 40px;
            width: 100%;
            display: flex;
            align-items: center;
            padding: 12px var(--gap);
        }
        .myItemInput {
            height: 40px;
            width: 100%;
            background-color: #ffffff0a;
            padding: 0 12px;
            text-align: center;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        }
        .myItemSelect {
            height: 40px;
            width: 100%;
            background-color: #ffffff0a;
            padding: 0 12px;
            text-align: center;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        }
        .myItemSelect > option {
            background-color: var(--darker-color);
        }
        .myButton {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            height: 40px;
            font-weight: 600;
            letter-spacing: .25px;
        }
        .myButton[disabled] {
            pointer-events: none;
        }
        .sort {
           padding: 12px var(--gap);
           border-top: 1px solid var(--border-color);
           display: flex;
           align-items: center;
           justify-content: space-between;
        }
        .sortButtonContainer {
            display: flex;
            align-items: center;
            border-radius: 4px;
            box-shadow: 0 1px 2px #0003;
            border: 1px solid var(--border-color);
            overflow: hidden;
        }
        .sortButton {
           display: flex;
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
           padding: 4px var(--gap);
           flex: 1;
           text-align: center;
           justify-content: center;
           background-color: var(--darker-color);
        }
        .tabs {
           display: flex;
           align-items: center;
           overflow: hidden;
           border-radius: inherit;
        }
        .tabButton {
            border: none;
            border-radius: 0px !important;
            background: transparent;
            font-family: inherit;
            font-size: inherit;
            line-height: 1.5;
            color: inherit;
            resize: none;
            text-transform: inherit;
            cursor: pointer;
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 48px;
            font-weight: 600;
            letter-spacing: .25px;
            padding: 0 var(--gap);
            border-radius: 4px 0 0;
        }
        .tabButtonInactive{
            background-color: var(--darker-color);
        }
        .lineRight {
            border-right: 1px solid var(--border-color);
        }
        .lineLeft {
            border-left: 1px solid var(--border-color);
        }
        .lineTop {
            border-top: 1px solid var(--border-color);
        }
        .customCheckBoxText {
            flex: 1;
            color: #aaa
        }
        .customCheckboxCheckbox {
            display: flex;
            justify-content: flex-end;
            min-width: 32px;
            margin-left: var(--margin);
        }
        .customCheckBoxEnabled {
            color: #53bd73
        }
        .customCheckBoxDisabled {
            color: #aaa
        }
        .myBar {
            height: 12px;
            flex: 1;
            background-color: #ffffff0a;
            overflow: hidden;
            max-width: 50%;
            border-radius: 999px;
        }
        .myPercent {
            margin-left: var(--margin);
            margin-right: var(--margin);
            color: #aaa;
        }
        .myListDescription {
            list-style: disc;
            width: 100%;
        }
        .myListLine {
            margin-left: 20px;
        }
        .componentStateMessage {
            position: absolute;
            top: .5em;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            font-family: Jost,Helvetica Neue,Arial,sans-serif;
            flex-direction: column;
            white-space: nowrap;
            background-color: black;
            padding: .4rem;
            border: 1px solid #3e3e3e;
            border-radius: .4em;
            gap: .4em;
        }
        .myItemInputSendMessageButton {
            display: flex;
            background-color: #53bd73;
            justify-content: center;
            height: 40px;
            width: 100%;
            text-align: center;
            align-items: center;
            border-radius: 4px;
        }
        .chatMessageRow {
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            align-items: flex-start;
            height: 500px;
            overflow-y: auto;
            gap: 5px;
            padding: 5px 5px;
            border-top: 1px solid var(--border-color);
            
            scrollbar-color: var(--border-color) var(--darker-color);
        }
        .chatInputRow {
            display: flex;
            justify-content: center;
            align-items: center;
            border-top: 1px solid var(--border-color);
            min-height: 0px;
            min-width: 0px;
            gap: 10px;
            padding: 5px 5px;
        }
        .chatMessageRow::-webkit-scrollbar {
            width: 8px;
        }
        .chatMessageRow::-webkit-scrollbar-thumb {
            border-radius: 4px;
        }
        .myChatMessageTime {

        }
        .myChatMessageSender {
            font-weight: 600;
            letter-spacing: .25px;
        }
        .chatMessageInput {
            text-align: unset !important;
        }
        .myChatMessage {
            width: 100%;
            border-radius: 4px;
            padding: 2px 4px;
        }
        .chatTradeMessage {
            background-color: #7c5c8f;
        }
        .chatTradeMessageContainer {
            display: flex;
            flex-direction: row;
            gap: 8px;
        }
        .chatTradeMessageImage {
            width: 96px;
            height: 96px;
            image-rendering: pixelated;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        }
        .chatTradeMessageInformation {
            display: flex;
            flex-direction: column;
            a {
                text-decoration: underline;
            }
        }
    `;

    initialise();

    return initialised;

}
