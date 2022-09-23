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
    ]
]);
const converter = proj4('WGS84', 'EPSG:27700');

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

const wmtsUrl = 'https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS';
map.showTileBoundaries = params.showTileBoundaries;
let customSource;

map.on('load', () => {
    fetch(wmtsUrl)
        .then(function (response) {
            return response.text();
        })
        .then(function (text) {
            customSource = new CustomSource(map, {
                wmtsText: text,
                tileSize: 512,
                division: 4,
                converter: {
                    forward: converter.forward,
                    inverse: converter.inverse
                }
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
        customSource.update();
    });
}
