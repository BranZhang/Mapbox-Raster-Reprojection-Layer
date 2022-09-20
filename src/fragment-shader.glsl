// fragment shaders don't have a default precision so we need
// to pick one. mediump is a good default
precision mediump float;

// our texture
uniform sampler2D u_image;

varying vec2 v_uv;

void main() {
    gl_FragColor = texture2D(u_image, v_uv);
}