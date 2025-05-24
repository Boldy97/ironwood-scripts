() => {

    const exports = {
        encrypt,
        decrypt
    };

    function initialise() {
        $('<script>', {
            src: 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
            type: 'text/javascript'
        }).appendTo('head');
    }

    function encrypt(text, key) {
        return CryptoJS.AES.encrypt(text, key).toString();
    }

    function decrypt(ciphertext, key) {
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, key);
            const originalText = bytes.toString(CryptoJS.enc.Utf8);
            return originalText || null; // null if fail
        } catch {
            return null;
        }
    }

    initialise();

    return exports;
}
