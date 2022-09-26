import './base.css';
import proj4 from "proj4";

import * as dat from 'dat.gui';

import CustomSource from "./custom_source.js";

proj4.defs([
    [
        'EPSG:4326',
        '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees'
    ],
    [
        'EPSG:27700',
        '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
        '+x_0=400000 +y_0=-100000 +ellps=airy ' +
        '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 ' +
        '+units=m +no_defs'
    ],
    [
        'EPSG:28992',
        '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 ' +
        '+x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,1.9342,-1.6677,9.1019,4.0725 ' +
        '+units=m +no_defs +type=crs'
    ],
    [
        'EPSG:25833',
        '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
    ],
    [
        'EPSG:3857',
        '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs'
    ]
]);

const params = {
    overlay: 'British National Grid',
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
    createDatGUI();
    loadOverlay(params.overlay);
});

function loadOverlay(overlayName) {
    switch (overlayName) {
        case 'British National Grid':
            createLayer(
                'https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS',
                proj4('WGS84', 'EPSG:27700'),
                {
                    layer: 'OS_Open_Raster',
                    tileSize: 512,
                    division: 4,
                }
            )
            break;
        case 'Historische_tijdreis_1870':
            createLayer(
                'https://tiles.arcgis.com/tiles/nSZVuSZjHpEZZbRo/arcgis/rest/services/Historische_tijdreis_1870/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
                proj4('WGS84', 'EPSG:28992'),
                {
                    layer: 'Historische_tijdreis_1870',
                    tileSize: 256,
                    division: 4,
                }
            )
            break;
        case 'Mecklenburg-Vorpommern':
            createLayer(
                'https://www.orka-mv.de/geodienste/orkamv/wmts/1.0.0/WMTSCapabilities.xml',
                proj4('WGS84', 'EPSG:25833'),
                {
                    layer: 'orkamv',
                    tileSize: 512,
                    division: 4,
                }
            )
            break;
        case 'Mecklenburg-Vorpommern (EPSG:3857)':
            createLayer(
                'https://www.orka-mv.de/geodienste/orkamv/wmts/1.0.0/WMTSCapabilities.xml',
                proj4('WGS84', 'EPSG:3857'),
                {
                    layer: 'orkamv',
                    matrixSet: 'GLOBAL_WEBMERCATOR',
                    tileSize: 512,
                    division: 4,
                }
            )
            break;
    }
}

function createLayer(url, converter, otherOptions) {
    fetch(url)
        .then(function (response) {
            return response.text();
        })
        .then(function (text) {
            customSource = new CustomSource(map, {
                wmtsText: text,
                converter,
                ...otherOptions
            });

            if (map.getLayer('custom-source-layer')) map.removeLayer('custom-source-layer');
            if (map.getSource('custom-source')) map.removeSource('custom-source');

            map.addSource('custom-source', customSource);
            map.addLayer({
                id: 'custom-source-layer',
                type: 'raster',
                source: 'custom-source',
                paint: {
                    'raster-opacity': 1
                }
            });

            map.fitBounds(customSource.bounds, {
                padding: 20
            });
        });
}

function createDatGUI() {
    const gui = new dat.GUI({
        width: 500
    });
    gui.add(params, 'overlay', [
        'British National Grid',
        'Historische_tijdreis_1870',
        'Mecklenburg-Vorpommern',
        'Mecklenburg-Vorpommern (EPSG:3857)'
    ]).onChange(() => {
        loadOverlay(params.overlay);
    });
    gui.add(params, 'opacity', 0, 1).onChange(() => {
        map.setPaintProperty('custom-source-layer', 'raster-opacity', params.opacity);
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
        customSource.update();
    });
}
