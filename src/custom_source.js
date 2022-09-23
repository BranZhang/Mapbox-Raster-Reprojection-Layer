import WMTSCapabilities from "ol/format/WMTSCapabilities";
import SphericalMercator from "@mapbox/sphericalmercator";
import {convertMapBounds, convertTargetBoundsToPolygon} from "./coord_converter.js";
import center from "@turf/center";

import DrawTile from "./draw_tile.js";

const MAPBOX_MIN_ZOOM = 0;
const MAPBOX_MAX_ZOOM = 22;
let updateTileInfoFunc;

export default class CustomSource {
    constructor(map, {wmtsText, tileSize = 256, division = 4, maxCanvas = 2, converter}) {
        this.type = 'custom';

        this.MapboxToTargetZoomList = [];
        this._converter = converter;
        this.tileSize = tileSize;
        this._map = map;
        this._division = division;
        this.minzoom = MAPBOX_MIN_ZOOM;
        this.maxzoom = MAPBOX_MAX_ZOOM;

        this.targetTilesMap = window.targetTilesMap = new Map();
        this._merc = new SphericalMercator();
        this._drawTile = new DrawTile({
            merc: this._merc,
            tileSize: this.tileSize,
            division: this._division,
            converter: this._converter
        });

        this._getWMTSServiceConfig(wmtsText);

        this._canvasList = new Array(maxCanvas);
        for (let i = 0; i < this._canvasList.length; i++) {
            this._canvasList[i] = {
                canvas: null,
                usable: true
            };
        }
        this._applyList = [];


    }

    async loadTile({z, x, y}) {
        let targetTilesBounds;
        let mapboxTileBbox = this._merc.bbox(x, y, z);

        const tileKey = this._getKey(x, y, z);

        if (this.targetTilesMap.has(tileKey)) {
            targetTilesBounds = this.targetTilesMap.get(tileKey).data;
            this.targetTilesMap.get(tileKey).state = 'waiting';
        } else {
            targetTilesBounds = this._targetTiles(mapboxTileBbox, z);

            this.targetTilesMap.set(tileKey, {
                data: targetTilesBounds,
                state: 'waiting',
                mapboxX: x,
                mapboxY: y,
                mapboxZ: z
            });
        }

        const canvasObj = await this.applyCanvas();

        if (this.targetTilesMap.get(tileKey).state === 'unload') {
            this.returnCanvas(canvasObj);
            return canvasObj.canvas;
        }

        const gl = canvasObj.canvas.getContext("webgl", {willReadFrequently: true});
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (targetTilesBounds.length > 0) {
            await this._drawTile.draw(gl, targetTilesBounds, mapboxTileBbox);
        }

        this.targetTilesMap.get(tileKey).state = 'loaded';
        this.returnCanvas(canvasObj);
        return canvasObj.canvas;
    }

    async unloadTile({z, x, y}) {
        this.targetTilesMap.get(this._getKey(x, y, z)).state = 'unload';
        // this.targetTilesMap.delete(this._getKey(x, y, z));
    }

    async applyCanvas() {
        for (let i = 0; i < this._canvasList.length; i++) {
            if (this._canvasList[i].usable) {
                if (!this._canvasList[i].canvas) {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = this.tileSize;

                    this._canvasList[i].canvas = canvas;
                }

                this._canvasList[i].usable = false;
                return this._canvasList[i];
            }
        }

        return new Promise((resolve, reject) => {
            this._applyList.push(resolve);
        });
    }

    returnCanvas(canvasObj) {
        canvasObj.usable = true;
        const apply = this._applyList.shift();

        if (apply) {
            apply(this.applyCanvas());
        }
    }

    /**
     * display arcgis wmts tiles boundaries and tile ids.
     */
    showTileInfoLayer() {
        this._map.addSource('custom-source-debug-tile-bounds', {
            'type': 'geojson',
            'data': {
                'type': 'FeatureCollection',
                'features': []
            }
        });

        this._map.addLayer({
            'id': 'custom-source-debug-tile-bounds',
            'type': 'line',
            'source': 'custom-source-debug-tile-bounds',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-color': '#000000',
                'line-width': 1,
                'line-opacity': 1
            }
        });

        this._map.addSource('custom-source-debug-tile-center', {
            'type': 'geojson',
            'data': {
                'type': 'FeatureCollection',
                'features': []
            }
        });

        this._map.addLayer({
            'id': 'custom-source-debug-tile-center',
            'type': 'symbol',
            'source': 'custom-source-debug-tile-center',
            'layout': {
                'text-field': ['concat', 'x:', ['get', 'x'], '\n', 'y:', ['get', 'y'], '\n', 'z:', ['get', 'z']],
                'text-allow-overlap': true,
                'text-rotation-alignment': 'map',
                'text-size': 20
            },
            'paint': {
                'text-color': '#009200',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
                'text-opacity': 1
            }
        });

        updateTileInfoFunc = this._updateTileInfo.bind(this);
        this._map.on('move', updateTileInfoFunc);
        this._updateTileInfo();
    }

    _updateTileInfo() {
        const tilePolygons = {
            'type': 'FeatureCollection',
            features: []
        };

        const tileIDs = this._map.transform.coveringTiles({
            tileSize: this.tileSize,
            roundZoom: true,
            minzoom: this.minzoom,
            maxzoom: this.maxzoom,
        });

        tileIDs.map(tileID => {
            const key = this._getKey(tileID.canonical.x, tileID.canonical.y, tileID.canonical.z);
            if (this.targetTilesMap.has(key)) {
                const tiles = this.targetTilesMap.get(key);
                tilePolygons.features.push(...tiles.data.map(tile => {
                    const {topLeft, tileLengthInMeters} = tile;
                    const feature = convertTargetBoundsToPolygon(topLeft, tileLengthInMeters, this._division, this._converter.inverse);
                    feature.properties = {x: tile.x, y: tile.y, z: tile.z};
                    return feature;
                }));
            }
        });


        this._map.getSource('custom-source-debug-tile-bounds').setData(tilePolygons);

        const tileCenter = {
            'type': 'FeatureCollection',
            features: tilePolygons.features.map(f => center(f, {properties: f.properties}))
        };
        this._map.getSource('custom-source-debug-tile-center').setData(tileCenter);
    }

    /**
     * remove arcgis wmts tiles boundaries and tile ids.
     */
    removeTileInfoLayer() {
        this._map.off('move', updateTileInfoFunc);
        updateTileInfoFunc = null;

        if (this._map.getLayer('custom-source-debug-tile-center')) {
            this._map.removeLayer('custom-source-debug-tile-center');
        }

        if (this._map.getLayer('custom-source-debug-tile-bounds')) {
            this._map.removeLayer('custom-source-debug-tile-bounds');
        }

        if (this._map.getSource('custom-source-debug-tile-center')) {
            this._map.removeSource('custom-source-debug-tile-center');
        }

        if (this._map.getSource('custom-source-debug-tile-bounds')) {
            this._map.removeSource('custom-source-debug-tile-bounds');
        }
    }

    set colorfulF(val) {
        this._drawTile.colorfulF = !!val;
    }

    /**
     * 计算在指定的 metersPerPixel 下，覆盖 bounds 的 wmts 服务的瓦片信息。
     * @param bounds
     * @param mapboxZoom
     * @returns
     * @private
     */
    _targetTiles(bounds, mapboxZoom) {
        const tileMatrices = this.serviceIdentification.Contents.TileMatrixSet[0].TileMatrix;

        let targetZoomLevel = this.MapboxToTargetZoomList[mapboxZoom];

        // 假设 TileWidth 等于 TileHeight
        const {ScaleDenominator, MatrixWidth, MatrixHeight, TopLeftCorner, TileWidth} = tileMatrices[targetZoomLevel];

        const clipBounds = convertMapBounds(bounds, this._division, this._converter.forward);

        clipBounds[0] = Math.max(clipBounds[0], this.sourceBounds[0]); // minLng
        clipBounds[1] = Math.max(clipBounds[1], this.sourceBounds[1]); // minLat

        clipBounds[2] = Math.min(clipBounds[2], this.sourceBounds[2]); // maxLng
        clipBounds[3] = Math.min(clipBounds[3], this.sourceBounds[3]); // maxLat

        if ((clipBounds[0] >= clipBounds[2]) || (clipBounds[1] >= clipBounds[3])) {
            return [];
        }

        // ？？0.00028
        const tileLengthInMeters = ScaleDenominator * 0.00028 * TileWidth;

        const containedTiles = [];

        const startI = Math.max(0, Math.floor((clipBounds[0] - TopLeftCorner[0]) / tileLengthInMeters));
        const endI = Math.min(MatrixWidth - 1, Math.ceil((clipBounds[2] - TopLeftCorner[0]) / tileLengthInMeters));

        const startJ = Math.max(0, Math.floor((TopLeftCorner[1] - clipBounds[3]) / tileLengthInMeters));
        const endJ = Math.min(MatrixHeight - 1, Math.floor((TopLeftCorner[1] - clipBounds[1]) / tileLengthInMeters));

        clipBounds[0] -= tileLengthInMeters;
        clipBounds[3] += tileLengthInMeters;

        for (let i = startI; i <= endI; i++) {
            for (let j = startJ; j <= endJ; j++) {
                const tileTopLeft = [
                    TopLeftCorner[0] + tileLengthInMeters * i,
                    TopLeftCorner[1] - tileLengthInMeters * j
                ];

                if (this._bboxContains(clipBounds, tileTopLeft)) {
                    containedTiles.push({
                        x: i,
                        y: j,
                        z: targetZoomLevel,
                        tileLengthInMeters,
                        topLeft: tileTopLeft,
                        width: TileWidth
                    })
                }
            }
        }

        return containedTiles;
    }

    _getWMTSServiceConfig(wmtsText) {
        const parser = new WMTSCapabilities();
        this.serviceIdentification = parser.read(wmtsText);

        // target wmts wgs84 bounds.
        this.bounds = this.serviceIdentification.Contents.Layer[0].WGS84BoundingBox;
        this.sourceBounds = convertMapBounds(this.bounds, this._division, this._converter.forward);

        // target wmts url template.
        const {ResourceURL, Style, TileMatrixSetLink} = this.serviceIdentification.Contents.Layer[0];
        this._drawTile.tileUrl = ResourceURL[0].template
            .replace(/{Style}/g, Style[0].Identifier)
            .replace(/{TileMatrixSet}/g, TileMatrixSetLink[0].TileMatrixSet);

        // minZoom, maxZoom
        const {minZoom, maxZoom} = this._mapboxZoomToTargetZoom();
        this.minzoom = minZoom;
        this.maxzoom = maxZoom;
    }

    _mapboxZoomToTargetZoom() {
        for (let mapboxZoom = MAPBOX_MIN_ZOOM; mapboxZoom <= MAPBOX_MAX_ZOOM; mapboxZoom++) {
            // 如果 tileSize 等于 256， 则这里实际请求的 z 值比默认的地图瓦片的 z 值大 1
            const metersPerPixel = 1 / this._map.transform.projection.pixelsPerMeter(
                0,
                this._map.transform.tileSize * Math.pow(2, this.tileSize === 512 ? mapboxZoom : mapboxZoom - 1)
            );

            const tileMatrices = this.serviceIdentification.Contents.TileMatrixSet[0].TileMatrix;

            let targetZoomLevel = this.MapboxToTargetZoomList.length > 0 ? this.MapboxToTargetZoomList[this.MapboxToTargetZoomList.length-1] : 0;

            while (targetZoomLevel < tileMatrices.length) {
                if (tileMatrices[targetZoomLevel].ScaleDenominator * 0.00028 <= metersPerPixel) {
                    break;
                }
                targetZoomLevel++;
            }

            if (targetZoomLevel >= tileMatrices.length) targetZoomLevel = tileMatrices.length - 1;

            this.MapboxToTargetZoomList.push(parseInt(tileMatrices[targetZoomLevel].Identifier));
        }

        let minZoom, maxZoom;

        for (let i = MAPBOX_MIN_ZOOM; i < MAPBOX_MAX_ZOOM; i++) {
            if (this.MapboxToTargetZoomList[i] !== this.MapboxToTargetZoomList[i+1]) {
                minZoom = i;
                break;
            }
        }

        for (let j = MAPBOX_MAX_ZOOM; j > MAPBOX_MIN_ZOOM; j--) {
            if (this.MapboxToTargetZoomList[j] !== this.MapboxToTargetZoomList[j-1]) {
                maxZoom = j;
                break;
            }
        }

        return {minZoom, maxZoom};
    }

    _bboxContains(bbox, point) {
        return (point[0] >= bbox[0] && point[0] < bbox[2]) && (point[1] >= bbox[1] && point[1] < bbox[3]);
    }

    _getKey(x, y, z) {
        return `${x}/${y}/${z}`;
    }
}