function convertMapBounds(mapBounds, division = 1, forwardFunc) {
    let coordinates = _boundsToPolygonCoordinates(mapBounds, division);

    coordinates = coordinates.map(forwardFunc);

    return [
        Math.min(...coordinates.map(c => c[0])),
        Math.min(...coordinates.map(c => c[1])),
        Math.max(...coordinates.map(c => c[0])),
        Math.max(...coordinates.map(c => c[1])),
    ];
}

function convertTargetBoundsToPolygon(bounds, division = 1, inverseFunc) {
    const coordinates = _boundsToPolygonCoordinates(bounds, division);

    return {
        'type': 'Feature',
        'geometry': {
            'type': 'Polygon',
            coordinates: [
                coordinates.map(inverseFunc)
            ]
        }
    };
}

function _boundsToPolygonCoordinates(bounds, division) {
    const southWest = [bounds[0], bounds[1]];
    const southEast = [bounds[2], bounds[1]];
    const northEast = [bounds[2], bounds[3]];
    const northWest = [bounds[0], bounds[3]];

    const coordinates = [southWest];

    coordinates.push(..._interpolateLine(southWest, southEast, division));
    coordinates.push(..._interpolateLine(southEast, northEast, division));
    coordinates.push(..._interpolateLine(northEast, northWest, division));
    coordinates.push(..._interpolateLine(northWest, southWest, division));

    return coordinates;
}

function _interpolateLine(start, end, division) {
    const result = [];

    for (let i = 1; i <= division; i++) {
        result.push([
            start[0] + (end[0] - start[0]) * (i / division),
            start[1] + (end[1] - start[1]) * (i / division)
        ]);
    }

    return result;
}

export {
    convertMapBounds,
    convertTargetBoundsToPolygon
}