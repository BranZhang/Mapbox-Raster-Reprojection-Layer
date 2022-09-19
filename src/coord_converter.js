import proj4 from "proj4";

proj4.defs([
    [
        'EPSG:4326',
        '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees'],
    [
        'EPSG:27700',
        '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
        '+x_0=400000 +y_0=-100000 +ellps=airy ' +
        '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 ' +
        '+units=m +no_defs'
    ]
]);

const converter = proj4('WGS84', 'EPSG:27700');

// console.log(converter.inverse([-649750.0, -150250.0]));
// console.log(converter.inverse([1350250.0, 1449750.0]));

function convertMapBounds(mapBounds) {
    const southWest = converter.forward(mapBounds[0]);
    const southEast = converter.forward([mapBounds[1][0], mapBounds[0][1]]);
    const northEast = converter.forward(mapBounds[1]);
    const northWest = converter.forward([mapBounds[0][0], mapBounds[1][1]]);

    const southCenter = converter.forward([(mapBounds[0][0] + mapBounds[1][0]) / 2, mapBounds[0][1]]);
    const northCenter = converter.forward([(mapBounds[0][0] + mapBounds[1][0]) / 2, mapBounds[1][1]]);

    return [[
        Math.min(northWest[0], southWest[0]),
        Math.min(southWest[1], southEast[1], southCenter[1])
    ], [
        Math.max(southEast[0], northEast[0]),
        Math.max(northEast[1], northWest[1], northCenter[1])
    ]];
}

function convertTargetBoundsToPolygon(topLeft, tileLength, divide = 4) {
    const southWest = [topLeft[0], topLeft[1] - tileLength];
    const southEast = [topLeft[0] + tileLength, topLeft[1] - tileLength];
    const northEast = [topLeft[0] + tileLength, topLeft[1]];
    const northWest = topLeft;

    const coordinates = [southWest];

    coordinates.push(...interpolateLine(southWest, southEast, divide));
    coordinates.push(...interpolateLine(southEast, northEast, divide));
    coordinates.push(...interpolateLine(northEast, northWest, divide));
    coordinates.push(...interpolateLine(northWest, southWest, divide));

    return {
        'type': 'Feature',
        'geometry': {
            'type': 'Polygon',
            coordinates: [
                coordinates.map(converter.inverse)
            ]
        }
    };
}

function interpolateLine(start, end, divide) {
    const result = [];

    for (let i = 1; i <= divide; i++) {
        result.push([
            start[0] + (end[0] - start[0]) * (i / divide),
            start[1] + (end[1] - start[1]) * (i / divide)
        ])
    }

    return result;
}

export {
    convertMapBounds,
    convertTargetBoundsToPolygon
}