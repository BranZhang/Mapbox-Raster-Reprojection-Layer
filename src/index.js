import './base.css';
import * as dat from 'dat.gui';

import CustomSource from "./custom_source.js";

const params = {
    opacity: 1,
    showTileBoundaries: true,
    tileInfo: false,
    colorfulF: false
};

mapboxgl.accessToken = 'pk.eyJ1IjoiYnJhbnpoYW5nIiwiYSI6ImNqM3FycmVldjAxZTUzM2xqMmllNnBjMHkifQ.Wv3ekbtia0BuUHGWVUGoFg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [0, 55],
    zoom: 3,
    hash: true
});

map.showTileBoundaries = params.showTileBoundaries;
let customSource;

map.on('load', () => {
    customSource = new CustomSource(map, {
        wmtsUrl: 'https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS',
        tileSize: 512,
        division: 4
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

function createDatGUI() {
    const gui = new dat.GUI({
        width: 400
    });
    gui.add(params, 'opacity', 0, 1).onChange(() => {
        map.setPaintProperty('custom-source', 'raster-opacity', params.opacity);
    });
    gui.add(params, 'showTileBoundaries').name('Mapbox-TileBoundaries').onChange(() => {
        map.showTileBoundaries = params.showTileBoundaries;
    });
    gui.add(params, 'tileInfo').name('ArcGIS-TileBoundaries').onChange(() => {
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
