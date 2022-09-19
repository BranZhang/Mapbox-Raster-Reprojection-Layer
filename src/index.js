import './base.css';

import CustomSource from "./custom_source.js";
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import center from '@turf/center';
import {convertMapBounds, convertTargetBoundsToPolygon} from './coord_converter.js';

mapboxgl.accessToken = 'pk.eyJ1IjoiYnJhbnpoYW5nIiwiYSI6ImNqM3FycmVldjAxZTUzM2xqMmllNnBjMHkifQ.Wv3ekbtia0BuUHGWVUGoFg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [0, 55],
    zoom: 3,
    hash: true
});

// map.showTileBoundaries = true;

let serviceIdentification;

fetch('https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS')
    .then(function (response) {
        return response.text();
    })
    .then(function (text) {
        const parser = new WMTSCapabilities();
        serviceIdentification = parser.read(text);

        console.log('result', serviceIdentification);

        if (map.loaded()) {
            createDebugLayer();
        } else {
            map.once('load', () => {
                createDebugLayer();
            });
        }
    });

function createDebugLayer() {
    map.addSource('triangle', {
        'type': 'geojson',
        'data': {
            'type': 'FeatureCollection',
            'features': []
        }
    });

    map.addLayer({
        'id': 'triangle',
        'type': 'line',
        'source': 'triangle',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#f00',
            'line-width': 0.5
        }
    });

    map.addSource('triangle-center', {
        'type': 'geojson',
        'data': {
            'type': 'FeatureCollection',
            'features': []
        }
    });

    map.addLayer({
        'id': 'triangle-center',
        'type': 'symbol',
        'source': 'triangle-center',
        'layout': {
            'text-field': ['concat', 'x:', ['get', 'x'], '\n', 'y:', ['get', 'y'], '\n', 'z:', ['get', 'z']],
            'text-allow-overlap': true,
            'text-rotation-alignment': 'map',
            'text-size': 20
        },
        'paint': {
            'text-color': '#f00'
        }
    });

    const customSource = new CustomSource({
        wmtsUrl: 'https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS',
        map,
        debug: true
    });

    map.addSource('custom-source', customSource);

    map.addLayer({
        id: 'custom-source',
        type: 'raster',
        source: 'custom-source',
        paint: {
            'raster-opacity': 0.5
        }
    });

    // map.on('moveend', update);
    // update();
}

function update() {
    // const targetTilesBounds = targetTiles(map.getBounds().toArray(), 1 / map.transform.pixelsPerMeter);
    const targetTilesBounds = targetTiles(
        map.getBounds().toArray(),
        1 / map.transform.projection.pixelsPerMeter(0, map.transform.worldSize));
    map.getSource('triangle').setData(targetTilesBounds);

    const targetTilesCenter = {
        'type': 'FeatureCollection',
        features: targetTilesBounds.features.map(f => center(f, {properties: f.properties}))
    };
    map.getSource('triangle-center').setData(targetTilesCenter);
}

function targetTiles(bounds, metersPerPixel) {
    const tileMatrices = serviceIdentification.Contents.TileMatrixSet[0].TileMatrix;

    let targetZoomLevel = 0;

    while (targetZoomLevel < tileMatrices.length) {
        if (tileMatrices[targetZoomLevel].ScaleDenominator * 0.00028 <= metersPerPixel) {
            break;
        }
        targetZoomLevel++;
    }
    console.log('targetZoomLevel', targetZoomLevel);
    const currentMatrix = tileMatrices[targetZoomLevel];

    const layerBounds = serviceIdentification.Contents.Layer[0].WGS84BoundingBox;
    bounds[0][0] = Math.max(bounds[0][0], layerBounds[0]); // minLng
    bounds[0][1] = Math.max(bounds[0][1], layerBounds[1]); // minLat

    bounds[1][0] = Math.min(bounds[1][0], layerBounds[2]); // maxLng
    bounds[1][1] = Math.min(bounds[1][1], layerBounds[3]); // maxLat

    if ((bounds[0][0] >= bounds[1][0]) || (bounds[0][1] >= bounds[1][1])) {
        console.log("超出屏幕外");
        return {
            'type': 'FeatureCollection',
            features: []
        };
    }

    const targetBounds = convertMapBounds(bounds);

    const tileLengthInMeters = currentMatrix.ScaleDenominator * 0.00028 * 256;
    targetBounds[0][0] -= tileLengthInMeters;
    targetBounds[1][1] += tileLengthInMeters;

    const containedTiles = [];

    for (let i = 0; i < currentMatrix.MatrixWidth; i++) {
        for (let j = 0; j < currentMatrix.MatrixHeight; j++) {
            const tileTopLeft = [
                currentMatrix.TopLeftCorner[0] + tileLengthInMeters * i,
                currentMatrix.TopLeftCorner[1] - tileLengthInMeters * j
            ];

            const tileTopRight = [tileTopLeft[0] + tileLengthInMeters, tileTopLeft[1]];
            const tileBottomLeft = [tileTopLeft[0], tileTopLeft[1] - tileLengthInMeters];
            const tileBottomRight = [tileTopLeft[0] + tileLengthInMeters, tileTopLeft[1] - tileLengthInMeters];

            if (bboxContains(targetBounds, tileTopLeft) || bboxContains(targetBounds, tileTopRight) || bboxContains(targetBounds, tileBottomLeft) || bboxContains(targetBounds, tileBottomRight)) {
                containedTiles.push({
                    x: i,
                    y: j,
                    z: targetZoomLevel,
                    topLeft: tileTopLeft
                })
            }
        }
    }

    return {
        'type': 'FeatureCollection',
        features: containedTiles.map(t => {
            const feature = convertTargetBoundsToPolygon(t.topLeft, tileLengthInMeters);
            feature.properties = {
                x: t.x,
                y: t.y,
                z: t.z,
            }
            return feature;
        })
    };
}

function bboxContains(bbox, point) {
    return (point[0] >= bbox[0][0] && point[0] < bbox[1][0]) && (point[1] >= bbox[0][1] && point[1] < bbox[1][1]);
}



