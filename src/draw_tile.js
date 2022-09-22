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
    constructor({tileSize, merc, division}) {
        this.tileSize = tileSize;
        this.colorfulF = false;
        this._merc = merc;
        this._division = division;
        this.tileUrl = "";
    }

    draw(gl, tilesBounds, mapboxBounds) {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        const mercBounds = [
            this._merc.forward(mapboxBounds[0]),
            this._merc.forward(mapboxBounds[1])
        ];
        // 创建着色器
        const programInfo = twgl.createProgramInfo(gl, [vs, fs]);
        gl.useProgram(programInfo.program);

        const tileTextures = {};

        for (let i = 0; i < tilesBounds.length; i++) {
            if (this.colorfulF) {
                tileTextures[`tile/${tilesBounds[i].x}/${tilesBounds[i].y}/${tilesBounds[i].z}`] = {
                    src: ((tilesBounds[i].x + tilesBounds[i].y) % 2 === 0) ? greenTexture : yellowTexture
                };
            } else {
                tileTextures[`tile/${tilesBounds[i].x}/${tilesBounds[i].y}/${tilesBounds[i].z}`] = {
                    src: this.tileUrl
                        .replace(/{TileMatrix}/g, tilesBounds[i].z)
                        .replace(/{TileRow}/g, tilesBounds[i].y)
                        .replace(/{TileCol}/g, tilesBounds[i].x)
                };
            }
        }

        return new Promise((resolve, reject) => {
            twgl.createTextures(gl, tileTextures, (err, textures, sources) => {
                // 遍历 tilesBounds，依次绘制
                for (let i = 0; i < tilesBounds.length; i++) {
                    const tileBounds = tilesBounds[i];

                    const {x, y, z, topLeft, tileLengthInMeters} = tileBounds;

                    // 传入全局变量
                    const uniforms = {
                        u_tilesize: this.tileSize,
                        u_image: textures[`tile/${x}/${y}/${z}`]
                    };

                    twgl.setUniforms(programInfo, uniforms);

                    const {position, uv} = this._buildPositionAndUV(topLeft, tileLengthInMeters, mercBounds);

                    // 传入缓冲数据
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

    _buildPositionAndUV(topLeft, tileLength, mercBounds) {
        const singleLenghth = tileLength / this._division;

        const position = [];
        const uv = [];

        for (let i = 0; i < this._division; i++) {
            for (let j = 0; j < this._division; j++) {
                const feature = convertTargetBoundsToPolygon([
                    topLeft[0] + singleLenghth * i,
                    topLeft[1] - singleLenghth * j,
                ], singleLenghth, 1);

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
                    i / this._division, j / this._division,
                    (i + 1) / this._division, j / this._division,
                    i / this._division, (j + 1) / this._division,
                    (i + 1) / this._division, j / this._division,
                    i / this._division, (j + 1) / this._division,
                    (i + 1) / this._division, (j + 1) / this._division
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
}
