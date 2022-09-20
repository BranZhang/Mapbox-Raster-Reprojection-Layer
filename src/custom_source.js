import WMTSCapabilities from "ol/format/WMTSCapabilities";
import SphericalMercator from "@mapbox/sphericalmercator";
import {convertMapBounds, convertTargetBoundsToPolygon} from "./coord_converter";
import center from "@turf/center";

import {draw} from "./draw.js";

const merc = new SphericalMercator();

export default class CustomSource {
    constructor({wmtsUrl, map, debug}) {
        this.type = 'custom';
        this.tileSize = 256;
        // this._wmtsUrl = wmtsUrl;
        this._map = map;

        this.debug = !!debug;

        this.serviceIdentification = this._getWMTSServiceConfig(wmtsUrl);
    }

    async loadTile({z, x, y}) {
        await this.serviceIdentification;

        let mercatorTileBbox = merc.bbox(x, y, z);
        mercatorTileBbox = [[mercatorTileBbox[0], mercatorTileBbox[1]], [mercatorTileBbox[2], mercatorTileBbox[3]]];

        const mapCenter = this._map.getCenter();
        const {minX, minY} = merc.xyz(
            [mapCenter.lng, mapCenter.lat, mapCenter.lng, mapCenter.lat],
            z
        );

        let targetTilesBounds;

        if (this.debug && (minX !== x || minY !== y)) {
            // in debug mode, only display screen center tile.
            targetTilesBounds = {
                'type': 'FeatureCollection',
                features: []
            };
        } else {
            targetTilesBounds = this._targetTiles(
                mercatorTileBbox,
                1 / this._map.transform.projection.pixelsPerMeter(
                    0,
                    512 * Math.pow(2, z)
                ));

            console.log(targetTilesBounds);
            this._map.getSource('triangle').setData(targetTilesBounds);

            const targetTilesCenter = {
                'type': 'FeatureCollection',
                features: targetTilesBounds.features.map(f => center(f, {properties: f.properties}))
            };
            this._map.getSource('triangle-center').setData(targetTilesCenter);
        }

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = this.tileSize;

        if (targetTilesBounds.features.length > 0) {
            // draw(canvas.getContext("webgl"), targetTilesBounds.features);
            await draw(canvas, targetTilesBounds.features, mercatorTileBbox);

            console.log("收到绘制结果");
        }

        return canvas;
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

        const {ScaleDenominator, MatrixWidth, MatrixHeight, TopLeftCorner} = tileMatrices[targetZoomLevel];

        const layerBounds = this.serviceIdentification.Contents.Layer[0].WGS84BoundingBox;
        bounds[0][0] = Math.max(bounds[0][0], layerBounds[0]); // minLng
        bounds[0][1] = Math.max(bounds[0][1], layerBounds[1]); // minLat

        bounds[1][0] = Math.min(bounds[1][0], layerBounds[2]); // maxLng
        bounds[1][1] = Math.min(bounds[1][1], layerBounds[3]); // maxLat

        if ((bounds[0][0] >= bounds[1][0]) || (bounds[0][1] >= bounds[1][1])) {
            return {
                'type': 'FeatureCollection',
                features: []
            };
        }

        const targetBounds = convertMapBounds(bounds);

        const tileLengthInMeters = ScaleDenominator * 0.00028 * 256;

        const containedTiles = [];

        const startI = Math.max(0, Math.floor((targetBounds[0][0] - TopLeftCorner[0]) / tileLengthInMeters));
        const endI = Math.min(MatrixWidth, Math.ceil((targetBounds[1][0] - TopLeftCorner[0]) / tileLengthInMeters));

        const startJ = Math.max(0, Math.floor((TopLeftCorner[1] - targetBounds[1][1]) / tileLengthInMeters));
        const endJ = Math.min(MatrixHeight, Math.floor((TopLeftCorner[1] - targetBounds[0][1]) / tileLengthInMeters));

        for (let i = startI; i <= endI; i++) {
            for (let j = startJ; j <= endJ; j++) {
                const tileTopLeft = [
                    TopLeftCorner[0] + tileLengthInMeters * i,
                    TopLeftCorner[1] - tileLengthInMeters * j
                ];

                const tileTopRight = [tileTopLeft[0] + tileLengthInMeters, tileTopLeft[1]];
                const tileBottomLeft = [tileTopLeft[0], tileTopLeft[1] - tileLengthInMeters];
                const tileBottomRight = [tileTopLeft[0] + tileLengthInMeters, tileTopLeft[1] - tileLengthInMeters];

                if (this._bboxContains(targetBounds, tileTopLeft) || this._bboxContains(targetBounds, tileTopRight) || this._bboxContains(targetBounds, tileBottomLeft) || this._bboxContains(targetBounds, tileBottomRight)) {
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
                const feature = convertTargetBoundsToPolygon(t.topLeft, tileLengthInMeters, 1);
                feature.properties = {
                    x: t.x,
                    y: t.y,
                    z: t.z,
                }
                return feature;
            })
        };
    }

    async _getWMTSServiceConfig(wmtsUrl) {
        const res = await fetch(wmtsUrl);
        const result = await res.text();

        const parser = new WMTSCapabilities();
        this.serviceIdentification = parser.read(result);
    }

    _bboxContains(bbox, point) {
        return (point[0] >= bbox[0][0] && point[0] < bbox[1][0]) && (point[1] >= bbox[0][1] && point[1] < bbox[1][1]);
    }

}