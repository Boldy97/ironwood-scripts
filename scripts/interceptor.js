(events) => {

    function initialise() {
        registerInterceptorXhr();
        registerInterceptorUrlChange();
        events.emit('url', window.location.href);
    }

    function registerInterceptorXhr() {
        const XHR = XMLHttpRequest.prototype;
        const open = XHR.open;
        const send = XHR.send;
        const setRequestHeader = XHR.setRequestHeader;

        XHR.open = function() {
            this._requestHeaders = {};
            return open.apply(this, arguments);
        }
        XHR.setRequestHeader = function(header, value) {
            this._requestHeaders[header] = value;
            return setRequestHeader.apply(this, arguments);
        }
        XHR.send = function() {
            let requestBody = undefined;
            try {
                requestBody = JSON.parse(arguments[0]);
            } catch(e) {}
            this.addEventListener('load', function () {
                const status = this.status
                const url = this.responseURL;
                console.debug(`intercepted ${url}`);
                const responseHeaders = this.getAllResponseHeaders();
                if(this.responseType === 'blob') {
                    return;
                }
                const responseBody = extractResponseFromXMLHttpRequest(this);
                events.emit('xhr', {
                    url,
                    status,
                    request: requestBody,
                    response: responseBody
                }, { skipCache:true });
            })

            return send.apply(this, arguments);
        }
    }

    function extractResponseFromXMLHttpRequest(xhr) {
        if(xhr.responseType === 'blob') {
            return null;
        }
        let responseBody;
        if (xhr.responseType === '' || xhr.responseType === 'text') {
            try {
                return JSON.parse(xhr.responseText);
            } catch (err) {
                console.debug("Error reading or processing response.", err);
            }
        }
        return xhr.response;
    }

    function registerInterceptorUrlChange() {
        const pushState = history.pushState;
        history.pushState = function() {
            pushState.apply(history, arguments);
            events.emit('url', arguments[2]);
        };
    }

    initialise();

}
