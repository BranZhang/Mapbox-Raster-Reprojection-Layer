import * as twgl from 'twgl.js';
import vs from './vertex-shader.glsl';
import fs from './fragment-shader.glsl';

import {convertTargetBoundsToPolygon} from "./coord_converter.js";

import greenTexture from './textures/green.png';
import yellowTexture from './textures/yellow.png';

twgl.setDefaults({
    textureColor: [0, 0, 0, 0],  // make initial color transparent black
});

export default class DrawTile {
    constructor({tileSize, merc, tileUrl, division, converter, sourceBounds}) {
        this.tileSize = tileSize;
        this.colorfulF = false;
        this._merc = merc;
        this._division = division;
        this.tileUrl = tileUrl;
        this._converter = converter;
        this._sourceBounds = sourceBounds;
    }

    draw(gl, tilesBounds, mapboxBounds) {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        const mercBounds = [
            this._merc.forward([mapboxBounds[0], mapboxBounds[1]]),
            this._merc.forward([mapboxBounds[2], mapboxBounds[3]])
        ];
        // 创建着色器
        const programInfo = twgl.createProgramInfo(gl, [vs, fs]);
        gl.useProgram(programInfo.program);

        const tileTextures = {};

        for (let i = 0; i < tilesBounds.length; i++) {
            const {x, y, z} = tilesBounds[i];
            if (this.colorfulF) {
                tileTextures[`tile/${x}/${y}/${z}`] = {
                    src: ((x + y) % 2 === 0) ? greenTexture : yellowTexture
                };
            } else {
                tileTextures[`tile/${x}/${y}/${z}`] = {
                    src: this.tileUrl
                        .replace(/{TileMatrix}/g, z)
                        .replace(/{TileRow}/g, y)
                        .replace(/{TileCol}/g, x)
                };
            }
        }

        return new Promise((resolve, reject) => {
            twgl.createTextures(gl, tileTextures, (err, textures) => {
                // draw each tilesBounds
                for (let i = 0; i < tilesBounds.length; i++) {
                    const tileBounds = tilesBounds[i];

                    const {x, y, z, topLeft, tileLengthInMeters, width} = tileBounds;

                    const uniforms = {
                        u_tilesize: this.tileSize,
                        u_image: textures[`tile/${x}/${y}/${z}`]
                    };

                    twgl.setUniforms(programInfo, uniforms);

                    const {position, uv} = this._buildPositionAndUV(topLeft, tileLengthInMeters, mercBounds);

                    // a simple way to avoid edge artifacts,
                    // copy edge pixels out to a 1px border should be much better.
                    for (let i = 0; i < uv.length; i++) {
                        uv[i] = uv[i] * ((width - 2) / width) + (1 / width);
                    }

                    const arrays = {
                        a_position: {
                            numComponents: 2,
                            data: position,
                        },
                        a_uv: {
                            numComponents: 2,
                            data: uv,
                        }
                    };
                    const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
                    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);

                    twgl.drawBufferInfo(gl, bufferInfo, gl.TRIANGLES);
                }

                resolve();
            });
        });
    }

    remove() {

    }

    _buildPositionAndUV(topLeft, tileLength, mercBounds) {
        const realTopLeft = [
            Math.max(topLeft[0], this._sourceBounds[0]),
            Math.min(topLeft[1], this._sourceBounds[3])
        ];
        const realBottomRight = [
            Math.min(topLeft[0] + tileLength, this._sourceBounds[2]),
            Math.max(topLeft[1] - tileLength, this._sourceBounds[1])
        ];

        const uRange = [(realTopLeft[0] - topLeft[0]) / tileLength, (realBottomRight[0] - topLeft[0]) / tileLength];
        const vRange = [1- (realTopLeft[1] - (topLeft[1] - tileLength)) / tileLength, 1 - (realBottomRight[1] - (topLeft[1] - tileLength)) / tileLength];

        const position = [];
        const uv = [];

        for (let i = 0; i < this._division; i++) {
            for (let j = 0; j < this._division; j++) {
                const feature = convertTargetBoundsToPolygon([
                    // topLeft[0] + singleLength * i,
                    // topLeft[1] - singleLength * j - singleLength,
                    // topLeft[0] + singleLength * i + singleLength,
                    // topLeft[1] - singleLength * j,
                    this._numbersDivide(realTopLeft[0], realBottomRight[0], i),
                    this._numbersDivide(realTopLeft[1], realBottomRight[1], j+1),
                    this._numbersDivide(realTopLeft[0], realBottomRight[0], i+1),
                    this._numbersDivide(realTopLeft[1], realBottomRight[1], j),
                ], 1, this._converter.inverse);

                const coordinates = feature.geometry.coordinates[0].map(c => this._lngLatToTileRelativeCoordinate(mercBounds, c));

                position.push(...[
                    ...coordinates[3],
                    ...coordinates[2],
                    ...coordinates[0],
                    ...coordinates[2],
                    ...coordinates[0],
                    ...coordinates[1]
                ]);
                uv.push(...[
                    // i / this._division, j / this._division,
                    // (i + 1) / this._division, j / this._division,
                    // i / this._division, (j + 1) / this._division,
                    // (i + 1) / this._division, j / this._division,
                    // i / this._division, (j + 1) / this._division,
                    // (i + 1) / this._division, (j + 1) / this._division
                    this._numbersDivide(uRange[0], uRange[1], i), this._numbersDivide(vRange[0], vRange[1], j),
                    this._numbersDivide(uRange[0], uRange[1], i+1), this._numbersDivide(vRange[0], vRange[1], j),
                    this._numbersDivide(uRange[0], uRange[1], i), this._numbersDivide(vRange[0], vRange[1], j+1),
                    this._numbersDivide(uRange[0], uRange[1], i+1), this._numbersDivide(vRange[0], vRange[1], j),
                    this._numbersDivide(uRange[0], uRange[1], i), this._numbersDivide(vRange[0], vRange[1], j+1),
                    this._numbersDivide(uRange[0], uRange[1], i+1), this._numbersDivide(vRange[0], vRange[1], j+1),
                ])
            }
        }

        return {position, uv};
    }

    /**
     * convert lngLat to a position relative to bounds top left.
     * @param bounds
     * @param lngLat
     * @returns {number[]} position x, y, unit equal to bounds.
     * @private
     */
    _lngLatToTileRelativeCoordinate(bounds, lngLat) {
        const mercPos = this._merc.forward(lngLat);
        const x = (mercPos[0] - bounds[0][0]) / (bounds[1][0] - bounds[0][0]) * this.tileSize;
        const y = this.tileSize - (mercPos[1] - bounds[0][1]) / (bounds[1][1] - bounds[0][1]) * this.tileSize;

        return [x, y];
    }

    _numbersDivide(start, end, step) {
        return start + (end - start) / this._division * step;
    }
}
