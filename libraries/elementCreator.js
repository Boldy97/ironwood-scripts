(colorMapper) => {

    const exports = {
        addStyles,
        getButton,
        getTag
    };

    function initialise() {
        addStyles(styles);
    }

    function addStyles(css) {
        const head = document.getElementsByTagName('head')[0]
        if(!head) {
            console.error('Could not add styles, missing head');
            return;
        }
        const style = document.createElement('style');
        style.innerHTML = css;
        head.appendChild(style);
    }

    function getButton(text, onClick) {
        const element = $(`<button class='myButton'>${text}</button>`)
            .css('background-color', colorMapper('componentRegular'))
            .css('display', 'inline-block')
            .css('padding', '0 5px')
            .css('margin', '0 5px');
        if(onClick) {
            element.click(onClick);
        }
        return element;
    }

    function getTag(text, image, clazz) {
        const element = $(`<div class='custom-element-creator-tag'>${text}</div>`)
            .addClass(clazz);
        if(image) {
            const imageElement = $(`<img src='${image}'/>`);
            element.prepend(imageElement);
        }
        return element;
    }

    const styles = `
        .custom-element-creator-tag {
            border-radius: 4px;
            padding: 0 2px;
            border: 1px solid #263849;
            font-size: 14px;
            color: #aaa;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
            margin: 2px;
        }

        .custom-element-creator-tag > img {
            width: 15px;
            height: 15px;
            filter: brightness(0.9);
            image-rendering: auto;
        }
    `;

    initialise();

    return exports;

}
