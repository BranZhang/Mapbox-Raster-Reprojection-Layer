import './base.css';

import CustomSource from "./custom_source.js";

mapboxgl.accessToken = 'pk.eyJ1IjoiYnJhbnpoYW5nIiwiYSI6ImNqM3FycmVldjAxZTUzM2xqMmllNnBjMHkifQ.Wv3ekbtia0BuUHGWVUGoFg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [0, 55],
    zoom: 3,
    hash: true
});

map.showTileBoundaries = true;

map.once('load', () => {
    createDebugLayer();
});

function createDebugLayer() {
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
            'raster-opacity': 1
        }
    });

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
            'line-width': 0.5,
            'line-opacity': 1
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
            'text-color': '#f00',
            'text-opacity': 1
        }
    });
}
