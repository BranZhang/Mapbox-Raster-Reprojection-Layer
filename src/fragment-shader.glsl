precision mediump float;

// our map tile.
uniform sampler2D u_image;

varying vec2 v_uv;

void main() {
    gl_FragColor = texture2D(u_image, v_uv);
}