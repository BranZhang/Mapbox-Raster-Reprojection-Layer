attribute vec2 a_position;
attribute vec2 a_uv;

uniform float u_tilesize;

varying vec2 v_uv;

// all shaders have a main function
void main() {
    // gl_Position is a special variable a vertex shader
    // is responsible for setting
    gl_Position = vec4(vec2(1, -1) * (a_position / u_tilesize * 2.0 - 1.0), 0, 1);
    v_uv = a_uv;
}