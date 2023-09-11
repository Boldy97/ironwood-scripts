(pages, components, elementWatcher) => {

    function initialise() {
        pages.registerPage(pageBlueprint, handlePage);
    }

    async function handlePage() {
        await update();
    }

    function clear() {
        components.removeComponent(componentBlueprint);
    }

    async function update() {
        clear();

        const foundComponent = components.search(componentBlueprint, 'headerHeader');
        foundComponent.title = "Headers header (no action)";

        await elementWatcher.exists(componentBlueprint.dependsOn);
        components.addComponent(componentBlueprint);

        await elementWatcher.exists("#myChart");

        new Chart($("#myChart"), {
            type: 'line',
            data: {
                labels: ["Teets", "Nibbo", "Brent", "Panks", "Eenie", "Miny", "Mo?"],
                datasets: [{
                    label: 'Some line graph :)',
                    data: [65, 59, 80, 81, 56, 55, 40],
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            // options: {
            //     scales: {
            //         y: {
            //             beginAtZero: true
            //         }
            //     }
            // }
        });
    }

    const pageBlueprint = {
        "category": "Custom header",
        "pageName": "Custom page demo",
        "pageImage": "https://cdn-icons-png.flaticon.com/128/5110/5110617.png",
        "columns": "2",
        "onVisit": () => { }
    }

    const componentBlueprint = {
        "componentId": "demoComponent",
        "dependsOn": "custom-page",
        "parent": ".column0",
        "selectedTabIndex": 0,
        "tabs": [
            {
                "title": "Tab 1",
                "rows": [
                    {
                        "id": "headerHeader",
                        "type": "header",
                        "title": ""
                    },
                    {
                        "type": "chart",
                        "chartId" : "myChart"
                    },
                    {
                        "type": "header",
                        "title": "Forging",
                        "textRight": "Lv. 69 <span style='color: #aaa'>/ 420</span>"
                    },
                    {
                        "type": "progress",
                        "progressText": "301,313 / 309,469 XP",
                        "progressPercent": "97"
                    },
                    {
                        "type": "progress",
                        "progressText": "301,313 / 309,469 XP",
                        "progressPercent": "97",
                        "color": "success"
                    },
                    {
                        "type": "header",
                        "title": "Centered header",
                        "centered": true
                    },
                    {
                        "type": "header",
                        "title": "Header with image(no action)",
                        "image": "/assets/misc/merchant.png"
                    },
                    {
                        "type": "header",
                        "title": "Centered header with image(no action)",
                        "image": "/assets/misc/merchant.png",
                        "centered": true
                    },
                    {
                        "type": "header",
                        "title": "Header with action button",
                        "name": "Default button",
                        "action": () => { console.log("Header Action!"); }
                    },
                    {
                        "type": "header",
                        "title": "Header with action button and image",
                        "name": "Default button",
                        "image": "/assets/misc/merchant.png",
                        "action": () => { console.log("Header Action!"); }
                    },
                    {
                        "type": "header",
                        "name": "only image and button",
                        "image": "/assets/misc/merchant.png",
                        "action": () => { console.log("Header Action!"); }
                    },
                    {
                        "type": "header",
                        "name": "only button",
                        "action": () => { console.log("Header Action!"); }
                    },
                    {
                        "type": "header",
                        "title": "Header with action and colored action button!",
                        "name": "Button!",
                        "action": () => { console.log("Header Action!"); },
                        "color": "#FFC0CB"
                    },
                    {
                        "type": "header",
                        "title": "Items header"

                    },
                    {
                        "type": "item",
                        "image": "https://cdn-icons-png.flaticon.com/512/228/228556.png",
                        "extra": "extra info",
                        "name": "Item Name",
                        "value": "69420"
                    },
                    {
                        "type": "item",
                        "extra": "Only extra info",
                        "value": "69420"
                    },
                    {
                        "type": "item",
                        "name": "No image or extra",
                        "value": "69420"
                    },
                    {
                        "type": "header",
                        "title": "Buttons header"
                    },
                    {
                        "type": "buttons",
                        "buttons": [
                            {
                                "text": "One Green button",
                                "color": "#00FF00",
                                "action": () => { console.log("One button action!") }
                            }
                        ]
                    },
                    {
                        "type": "buttons",
                        "buttons": [
                            {
                                "text": "One &#129301 DISABLED Green button",
                                "disabled": true,
                                "color": "#00FF00",
                                "action": () => { console.log("This shouldnd work") }
                            }
                        ]
                    },
                    {
                        "type": "buttons",
                        "buttons": [
                            {
                                "text": "Two Red Buttons",
                                "color": "#FF0000",
                                "action": () => { console.log("Two button action!") }
                            },
                            {
                                "text": "Not a Red Button",
                                "color": "#0000FF",
                                "action": () => { console.log("BLUE button action!") }
                            },
                        ]
                    },
                    {
                        "type": "buttons",
                        "buttons": [
                            {
                                "text": "BIG BOOTON",
                                "color": "inverse",
                                "size": 3,
                                "action": () => { console.log("Two button action!") }
                            },
                            {
                                "text": "smol cute btn",
                                "color": "info",
                                "action": () => { console.log("BLUE button action!") }
                            },
                        ]
                    },
                    {
                        "type": "buttons",
                        "buttons": [
                            {
                                "text": "Three",
                                "color": "#000000",
                                "action": () => { console.log("First button action!") }
                            },
                            {
                                "text": "Butt",
                                "color": "#000000",
                                "action": () => { console.log("Second button action!") }
                            },
                            {
                                "text": "ons",
                                "color": "#000000",
                                "action": () => { console.log("Third button action!") }
                            },
                        ]
                    },
                    {
                        "type": "buttons",
                        "buttons": [
                            {
                                "text": "1",
                                "color": "success",
                                "action": () => { console.log("1") }
                            },
                            {
                                "text": "2",
                                "color": "primary",
                                "action": () => { console.log("2") }
                            },
                            {
                                "text": "3",
                                "color": "warning",
                                "action": () => { console.log("3") }
                            },
                            {
                                "text": "4",
                                "color": "danger",
                                "action": () => { console.log("4") }
                            }
                        ]
                    },
                    {
                        "type": "header",
                        "title": "dropdowns header"
                    },
                    {
                        "type": "dropdown",
                        "action": (selectedValue) => { console.log({ selectedValue }) },
                        "class": "saveFilterHover",
                        "delay": 500,
                        "options": [
                            {
                                "text": "Select with delay",
                                "value": "Delayed!",
                                "selected": true
                            },
                            {
                                "text": "Option 1",
                                "value": "Option 1",
                                "selected": false
                            },
                            {
                                "text": "Option 2",
                                "value": "Option 2",
                                "selected": false
                            }
                        ]
                    },
                    {
                        "type": "dropdown",
                        "action": (selectedValue) => { console.log({ selectedValue }) },
                        "class": "saveFilterHover",
                        "options": [
                            {
                                "text": "Select without delay",
                                "value": "Instant!",
                                "selected": true
                            },
                            {
                                "text": "Option 1",
                                "value": "Option 1",
                                "selected": false
                            },
                            {
                                "text": "Option 2",
                                "value": "Option 2",
                                "selected": false
                            }
                        ]
                    },
                    {
                        "type": "header",
                        "title": "Inputs header"
                    },
                    {
                        "type": "input",
                        "name": "Input area with delay",
                        "action": (inputtedText) => { console.log(inputtedText) },
                        "delay": 500,
                    },
                    {
                        "type": "input",
                        "name": "Input area without delay",
                        "action": (inputtedText) => { console.log(inputtedText) }
                    },
                    {
                        "type": "input",
                        "name": "Input area with delay but only numbers",
                        "data": "number",
                        "action": (inputtedText) => { console.log(inputtedText) },
                        "delay": 500,
                    },
                    {
                        "type": "input",
                        "name": "Input area with delay",
                        "text": "Layout 1/2 ",
                        "layout": "1/2",
                        "action": (inputtedText) => { console.log(inputtedText) },
                        "delay": 500,
                    },
                    {
                        "type": "input",
                        "name": "Input area with delay",
                        "text": "Layout 1/1 for some text",
                        "layout": "1/1",
                        "action": (inputtedText) => { console.log(inputtedText) },
                        "delay": 500,
                    },
                    {
                        "type": "input",
                        "name": "Input area with delay",
                        "text": "Layout 2/1 for looong text, lots of space",
                        "layout": "2/1",
                        "action": (inputtedText) => { console.log(inputtedText) },
                        "delay": 500,
                    },
                    {
                        "type": "header",
                        "title": "checkboxes header"
                    },
                    {
                        "type": "checkbox",
                        "text": "This checkbox value is TRUE",
                        "checked": true,
                        "action": () => { console.log("Tried to disable!") }
                    },
                    {
                        "type": "checkbox",
                        "text": "This checkbox value is FALSE",
                        "checked": false,
                        "action": () => { console.log("Tried to enable!") }
                    },
                ]
            },
            {
                "title": "Tab2",
                "rows": [
                    {
                        "type": "header",
                        "title": "Nothing to see here, just a demo for the tabs"
                    },
                    {
                        "type": "header",
                        "title": "Segment Test (array in array)"
                    },
                    {
                        "type": "segment",
                        "rows": [
                            {
                                "type": "header",
                                "title": "Segment header",
                                "name": "Default button",
                                "action": () => { console.log("Header Action!"); }
                            },
                            {
                                "type": "item",
                                "image": "https://cdn-icons-png.flaticon.com/512/228/228556.png",
                                "extra": "extra info",
                                "name": "Item Name",
                                "value": "69420"
                            },
                            {
                                "type": "item",
                                "image": "https://cdn-icons-png.flaticon.com/512/228/228556.png",
                                "extra": "extra info",
                                "name": "Item Name",
                                "value": "69420"
                            },
                            {
                                "type": "item",
                                "image": "https://cdn-icons-png.flaticon.com/512/228/228556.png",
                                "extra": "extra info",
                                "name": "Item Name",
                                "value": "69420"
                            }
                        ]
                    }
                ]
            },
            {
                "title": "Secret Tab",
                "hidden": true,
                "rows": []
            }
        ]
    };

    initialise();
}