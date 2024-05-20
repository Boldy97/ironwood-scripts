(colorMapper) => {

    const exports = {
        addStyles,
        getButton,
        getTag
    };

    function addStyles(css) {
        const head = document.getElementsByTagName('head')[0]
        if(!head) {
            console.error('Could not add styles, missing head');
            return;
        }
        const style = document.createElement('style');
        style.type = 'text/css';
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
        const element = $(`<div>${text}</div>`)
            .css('border-radius', '4px')
            .css('padding', '2px 6px')
            .css('border', '1px solid #263849')
            .css('font-size', '14px')
            .css('color', '#aaa')
            .css('display', 'flex')
            .css('align-items', 'center')
            .addClass(clazz);
        if(image) {
            const imageElement = $(`<img src='${image}'/>`)
                .css('width', '16px')
                .css('height', '16px')
                .css('image-rendering', 'auto');
            element.prepend(imageElement);
        }
        return element;
    }

    return exports;

}
