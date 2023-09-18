() => {

    const exports = {
        addStyles
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

    return exports;

}
