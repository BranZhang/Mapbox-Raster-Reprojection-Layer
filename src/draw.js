import * as twgl from 'twgl.js';
import vs from './vertex-shader.glsl';
import fs from './fragment-shader.glsl';

import SphericalMercator from "@mapbox/sphericalmercator";

import redTexture from './textures/red.png';
import greenTexture from './textures/green.png';
import yellowTexture from './textures/yellow.png';
import blueTexture from './textures/blue.png';

const merc = new SphericalMercator();
const tileSize = 256;

function draw(canvas, features, bounds) {
    const gl = canvas.getContext("webgl", {willReadFrequently: true});
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    const mercBounds = [
        merc.forward(bounds[0]),
        merc.forward(bounds[1])
    ]
    // 创建着色器
    const programInfo = twgl.createProgramInfo(gl, [vs, fs]);
    gl.useProgram(programInfo.program);

    return new Promise((resolve, reject) => {
        twgl.createTextures(gl, {
            // red: {src: 'https://tiles.arcgis.com/tiles/qHLhLQrcvEnxjtPr/arcgis/rest/services/OS_Open_Raster/MapServer/WMTS/tile/1.0.0/OS_Open_Raster/default/default028mm/8/28/36.png'},
            blue: {src: blueTexture},
            green: {src: greenTexture},
            yellow: {src: yellowTexture},
        }, (err, textures, sources) => {
            const ts = [textures.blue, textures.green, textures.yellow];

            // 遍历 features，依次绘制
            for (let i = 0; i < features.length; i++) {
                const feature = features[i];
                // 传入全局变量
                const uniforms = {
                    u_tilesize: tileSize,
                    u_image: ts[(feature.properties.x + feature.properties.y) % 3]
                };
                twgl.setUniforms(programInfo, uniforms);

                const coordinates = feature.geometry.coordinates[0].map(c => _lngLatToTileRelativeCoordinate(mercBounds, c));
                console.log(coordinates);

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

function _lngLatToTileRelativeCoordinate(bounds, lngLat) {
    const mercPos = merc.forward(lngLat);
    const x = (mercPos[0] - bounds[0][0]) / (bounds[1][0] - bounds[0][0]) * tileSize;
    const y = tileSize - (mercPos[1] - bounds[0][1]) / (bounds[1][1] - bounds[0][1]) * tileSize;

    return [x, y];
}


// const context = canvas.getContext('2d', {willReadFrequently: true});
//
// context.fillStyle = '#ffffff';
// context.strokeRect(0, 0, tileSize, tileSize);
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

export {draw};
