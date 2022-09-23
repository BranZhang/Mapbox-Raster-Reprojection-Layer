import WMTSCapabilities from "ol/format/WMTSCapabilities";
import SphericalMercator from "@mapbox/sphericalmercator";
import {convertMapBounds, convertTargetBoundsToPolygon} from "./coord_converter.js";
import center from "@turf/center";

import DrawTile from "./draw_tile.js";

let updateTileInfoFunc;

export default class CustomSource {
    constructor(map, {wmtsUrl, tileSize = 256, division = 4}) {
        this.type = 'custom';

        this.serviceIdentification = this._getWMTSServiceConfig(wmtsUrl);
        this.tileSize = tileSize;
        this._map = map;
        this._division = division;

        this.targetTilesMap = window.targetTilesMap = new Map();
        this._merc = new SphericalMercator();
        this._drawTile = new DrawTile({
            merc: this._merc,
            tileSize: this.tileSize,
            division: this._division
        });

        this._canvasList = new Array(2);
        for (let i = 0; i < this._canvasList.length; i++) {
            this._canvasList[i] = {
                canvas: null,
                usable: true
            };
        }
        this._applyList = [];
    }

    async hasTile({z, x, y}) {
        await this.serviceIdentification;

        const mapboxTileBbox = this._merc.bbox(x, y, z);

        return !(
            (mapboxTileBbox[0] >= this.sourceBounds[2]) ||
            (mapboxTileBbox[2] <= this.sourceBounds[0]) ||
            (mapboxTileBbox[1] <= this.sourceBounds[1]) ||
            (mapboxTileBbox[3] >= this.sourceBounds[3])
        );
    }

    async loadTile({z, x, y}) {
        await this.serviceIdentification;

        let targetTilesBounds;
        let mapboxTileBbox = this._merc.bbox(x, y, z);
        mapboxTileBbox = [[mapboxTileBbox[0], mapboxTileBbox[1]], [mapboxTileBbox[2], mapboxTileBbox[3]]];

        const tileKey = this._getKey(x, y, z);

        if (this.targetTilesMap.has(tileKey)) {
            targetTilesBounds = this.targetTilesMap.get(tileKey).data;
        } else {
            // 如果 tileSize 等于 256， 则这里实际请求的 z 值比默认的地图瓦片的 z 值大 1
            targetTilesBounds = this._targetTiles(
                mapboxTileBbox,
                1 / this._map.transform.projection.pixelsPerMeter(
                    0,
                    this._map.transform.tileSize * Math.pow(2, this.tileSize === 512 ? z : z - 1)
                ));

            this.targetTilesMap.set(tileKey, {
                data: targetTilesBounds,
                mapboxX: x,
                mapboxY: y,
                mapboxZ: z
            });
        }

        const canvasObj = await this.applyCanvas();

        const gl = canvasObj.canvas.getContext("webgl", {willReadFrequently: true});
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (targetTilesBounds.length > 0) {
            await this._drawTile.draw(gl, targetTilesBounds, mapboxTileBbox);
        }

        this.returnCanvas(canvasObj);
        return canvasObj.canvas;
    }

    async unloadTile({z, x, y}) {
        this.targetTilesMap.delete(this._getKey(x, y, z));
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
            roundZoom: true
        });

        tileIDs.map(tileID => {
            const key = this._getKey(tileID.canonical.x, tileID.canonical.y, tileID.canonical.z);
            if (this.targetTilesMap.has(key)) {
                const tiles = this.targetTilesMap.get(key);
                tilePolygons.features.push(...tiles.data.map(tile => {
                    const {topLeft, tileLengthInMeters} = tile;
                    const feature = convertTargetBoundsToPolygon(topLeft, tileLengthInMeters, this._division);
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
     * @param metersPerPixel
     * @returns
     * @private
     */
    _targetTiles(bounds, metersPerPixel) {
        const tileMatrices = this.serviceIdentification.Contents.TileMatrixSet[0].TileMatrix;

        let targetZoomLevel = 0;

        while (targetZoomLevel < tileMatrices.length) {
            if (tileMatrices[targetZoomLevel].ScaleDenominator * 0.00028 <= metersPerPixel) {
                break;
            }
            targetZoomLevel++;
        }

        // 假设 TileWidth 等于 TileHeight
        const {ScaleDenominator, MatrixWidth, MatrixHeight, TopLeftCorner, TileWidth} = tileMatrices[targetZoomLevel];

        const clipBounds = [[0, 0], [0, 0]];

        clipBounds[0][0] = Math.max(bounds[0][0], this.sourceBounds[0]); // minLng
        clipBounds[0][1] = Math.max(bounds[0][1], this.sourceBounds[1]); // minLat

        clipBounds[1][0] = Math.min(bounds[1][0], this.sourceBounds[2]); // maxLng
        clipBounds[1][1] = Math.min(bounds[1][1], this.sourceBounds[3]); // maxLat

        if ((clipBounds[0][0] >= clipBounds[1][0]) || (clipBounds[0][1] >= clipBounds[1][1])) {
            return [];
        }

        const targetBounds = convertMapBounds(clipBounds);

        // ？？0.00028
        const tileLengthInMeters = ScaleDenominator * 0.00028 * TileWidth;

        const containedTiles = [];

        const startI = Math.max(0, Math.floor((targetBounds[0][0] - TopLeftCorner[0]) / tileLengthInMeters));
        const endI = Math.min(MatrixWidth - 1, Math.ceil((targetBounds[1][0] - TopLeftCorner[0]) / tileLengthInMeters));

        const startJ = Math.max(0, Math.floor((TopLeftCorner[1] - targetBounds[1][1]) / tileLengthInMeters));
        const endJ = Math.min(MatrixHeight - 1, Math.floor((TopLeftCorner[1] - targetBounds[0][1]) / tileLengthInMeters));

        for (let i = startI; i <= endI; i++) {
            for (let j = startJ; j <= endJ; j++) {
                const tileTopLeft = [
                    TopLeftCorner[0] + tileLengthInMeters * i,
                    TopLeftCorner[1] - tileLengthInMeters * j
                ];

                const tileTopRight = [tileTopLeft[0] + tileLengthInMeters, tileTopLeft[1]];
                const tileBottomLeft = [tileTopLeft[0], tileTopLeft[1] - tileLengthInMeters];
                const tileBottomRight = [tileTopLeft[0] + tileLengthInMeters, tileTopLeft[1] - tileLengthInMeters];

                if (this._bboxContains(targetBounds, tileTopLeft) ||
                    this._bboxContains(targetBounds, tileTopRight) ||
                    this._bboxContains(targetBounds, tileBottomLeft) ||
                    this._bboxContains(targetBounds, tileBottomRight)
                ) {
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

    async _getWMTSServiceConfig(wmtsUrl) {
        const res = await fetch(wmtsUrl);
        const result = await res.text();

        const parser = new WMTSCapabilities();
        this.serviceIdentification = parser.read(result);

        this.sourceBounds = this.serviceIdentification.Contents.Layer[0].WGS84BoundingBox;

        const {ResourceURL, Style, TileMatrixSetLink} = this.serviceIdentification.Contents.Layer[0];
        this._drawTile.tileUrl = ResourceURL[0].template
            .replace(/{Style}/g, Style[0].Identifier)
            .replace(/{TileMatrixSet}/g, TileMatrixSetLink[0].TileMatrixSet);
    }

    _bboxContains(bbox, point) {
        return (point[0] >= bbox[0][0] && point[0] < bbox[1][0]) && (point[1] >= bbox[0][1] && point[1] < bbox[1][1]);
    }

    _getKey(x, y, z) {
        return `${x}/${y}/${z}`;
    }
}