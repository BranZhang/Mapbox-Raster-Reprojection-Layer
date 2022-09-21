import * as twgl from 'twgl.js';
import vs from './vertex-shader.glsl';
import fs from './fragment-shader.glsl';

import {interpolateLine, convertTargetBoundsToPolygon} from "./coord_converter.js";

import greenTexture from './textures/green.png';
import yellowTexture from './textures/yellow.png';
import blueTexture from './textures/blue.png';


export default class DrawTile {
    constructor({tileSize, merc, division}) {
        this.tileSize = tileSize;
        this.colorfulF = false;
        this._merc = merc;
        this._division = division;
    }

    draw(canvas, tilesBounds, bounds) {
        const gl = canvas.getContext("webgl", {willReadFrequently: true});
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        const mercBounds = [
            this._merc.forward(bounds[0]),
            this._merc.forward(bounds[1])
        ]
        // 创建着色器
        const programInfo = twgl.createProgramInfo(gl, [vs, fs]);
        gl.useProgram(programInfo.program);

        const tileTextures = {};

        if (this.colorfulF) {
            tileTextures['blue'] = {src: blueTexture};
            tileTextures['green'] = {src: greenTexture};
            tileTextures['yellow'] = {src: yellowTexture};
        } else {
            for (let i = 0; i < tilesBounds.length; i++) {
                tileTextures[`tile/${tilesBounds[i].x}/${tilesBounds[i].y}/${tilesBounds[i].z}`] = {
                    src: `https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS/tile/1.0.0/OS_Open_Raster/default/default028mm/${tilesBounds[i].z}/${tilesBounds[i].y}/${tilesBounds[i].x}.png`
                };
            }
        }

        return new Promise((resolve, reject) => {
            twgl.createTextures(gl, tileTextures, (err, textures, sources) => {
                const ts = [textures.blue, textures.green, textures.yellow];

                // 遍历 tilesBounds，依次绘制
                for (let i = 0; i < tilesBounds.length; i++) {
                    const tileBounds = tilesBounds[i];

                    const {x, y, z, topLeft, tileLengthInMeters} = tileBounds;

                    // 传入全局变量
                    const uniforms = {
                        u_tilesize: this.tileSize
                    };

                    if (this.colorfulF) {
                        uniforms['u_image'] = ts[(x + y) % 3];
                    } else {
                        uniforms['u_image'] = textures[`tile/${x}/${y}/${z}`];
                    }

                    twgl.setUniforms(programInfo, uniforms);

                    const feature = convertTargetBoundsToPolygon(topLeft, tileLengthInMeters, 1);
                    const coordinates = feature.geometry.coordinates[0].map(c => this._lngLatToTileRelativeCoordinate(mercBounds, c));

                    // 传入缓冲数据
                    const arrays = {
                        a_position: {
                            numComponents: 2,
                            data: [
                                ...coordinates[3],
                                ...coordinates[2],
                                ...coordinates[0],
                                ...coordinates[2],
                                ...coordinates[0],
                                ...coordinates[1]
                            ],
                        },
                        a_uv: {
                            numComponents: 2,
                            data: [
                                0.0, 0.0,
                                1.0, 0.0,
                                0.0, 1.0,
                                1.0, 0.0,
                                0.0, 1.0,
                                1.0, 1.0
                            ],
                        }
                    };
                    const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
                    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);

                    twgl.drawBufferInfo(gl, bufferInfo, gl.TRIANGLES);
                }

                console.log("绘制结束");
                resolve();
            });
        });
    }

    _buildPositionAndUV(topLeft, tileLength) {
        const northWest = topLeft;
        const northEast = [topLeft[0] + tileLength, topLeft[1]];
        const southWest = [topLeft[0], topLeft[1] - tileLength];

        const xs = interpolateLine(northWest, northEast, {
            division: this._division
        });
    }

    _lngLatToTileRelativeCoordinate(bounds, lngLat) {
        const mercPos = this._merc.forward(lngLat);
        const x = (mercPos[0] - bounds[0][0]) / (bounds[1][0] - bounds[0][0]) * this.tileSize;
        const y = this.tileSize - (mercPos[1] - bounds[0][1]) / (bounds[1][1] - bounds[0][1]) * this.tileSize;

        return [x, y];
    }
}


// const context = canvas.getContext('2d', {willReadFrequently: true});
//
// context.fillStyle = '#ffffff';
// context.strokeRect(0, 0, this.tileSize, this.tileSize);
//
// context.strokeStyle = '#ff0000';
// context.lineWidth = 1;
//
// features.forEach(feature => {
//     context.beginPath();
//     const begin = _lngLatToTileRelativeCoordinate(bounds, feature.geometry.coordinates[0][0]);
//     context.moveTo(begin[0], begin[1]);
//     for (let i = 1; i < feature.geometry.coordinates[0].length; i++) {
//         const position = _lngLatToTileRelativeCoordinate(bounds, feature.geometry.coordinates[0][i]);
//         context.lineTo(position[0], position[1]);
//     }
//     context.stroke();
// });

