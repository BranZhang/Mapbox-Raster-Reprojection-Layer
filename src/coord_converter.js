import proj4 from "proj4";
import * as proj from "ol/proj";
import {register} from 'ol/proj/proj4';

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

register(proj4);

const converter = proj4('WGS84', 'EPSG:27700');

function convertMapBounds(mapBounds) {
    return proj.transformExtent(mapBounds,'EPSG:4326','EPSG:27700', 4);
}

function convertTargetBoundsToPolygon(topLeft, tileLength, division = 1) {
    const southWest = [topLeft[0], topLeft[1] - tileLength];
    const southEast = [topLeft[0] + tileLength, topLeft[1] - tileLength];
    const northEast = [topLeft[0] + tileLength, topLeft[1]];
    const northWest = topLeft;

    const coordinates = [converter.inverse(southWest)];

    coordinates.push(...interpolateLine(southWest, southEast, {division, includeStart: false}));
    coordinates.push(...interpolateLine(southEast, northEast, {division, includeStart: false}));
    coordinates.push(...interpolateLine(northEast, northWest, {division, includeStart: false}));
    coordinates.push(...interpolateLine(northWest, southWest, {division, includeStart: false}));

    return {
        'type': 'Feature',
        'geometry': {
            'type': 'Polygon',
            coordinates: [
                coordinates
            ]
        }
    };
}

function interpolateLine(start, end, {division, includeStart = true}) {
    const result = [];

    for (let i = (includeStart ? 0 : 1); i <= division; i++) {
        result.push(converter.inverse([
            start[0] + (end[0] - start[0]) * (i / division),
            start[1] + (end[1] - start[1]) * (i / division)
        ]));
    }

    return result;
}

export {
    convertMapBounds,
    interpolateLine,
    convertTargetBoundsToPolygon
}