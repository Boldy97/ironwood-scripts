() => {

    const colorMappings = {
        // https://colorswall.com/palette/3
        primary: '#0275d8',
        success: '#5cb85c',
        info: '#5bc0de',
        warning: '#f0ad4e',
        danger: '#d9534f',
        inverse: '#292b2c',
        // custom
        focus: '#fff021',
        // component styling
        componentLight: '#393532',
        componentRegular: '#28211b',
        componentDark: '#211a12',
        componentHover: '#3c2f26',
        componentSelected: '#1c1916'
    };

    function mapColor(color) {
        return colorMappings[color] || color;
    }

    return mapColor;

}
