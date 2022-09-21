import './base.css';
import * as dat from 'dat.gui';

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
let customSource;

map.on('load', () => {
    customSource = new CustomSource(map, {
        wmtsUrl: 'https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS',
        tileSize: 512
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

    createDatGUI();
});

const params = {
    tileInfo: false,
    colorfulF: false,
    opacity: 1
}

function createDatGUI() {
    const gui = new dat.GUI();
    gui.add(params, 'opacity', 0, 1).onChange(() => {
        map.setPaintProperty('custom-source', 'raster-opacity', params.opacity);
    });
    gui.add(params, 'tileInfo').onChange(() => {
        if (params.tileInfo) {
            customSource.showTileInfoLayer();
        } else {
            customSource.removeTileInfoLayer();
        }
    });
    gui.add(params, 'colorfulF').onChange(() => {
        customSource.colorfulF = params.colorfulF;
    });
}
