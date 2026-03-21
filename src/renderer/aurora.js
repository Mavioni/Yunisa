(() => {
    const canvas = document.getElementById('aurora-bg');
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vs = `
        attribute vec2 a_pos;
        varying vec2 vUv;
        void main() {
            vUv = a_pos * 0.5 + 0.5;
            gl_Position = vec4(a_pos, 0.0, 1.0);
        }
    `;

    const fs = `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uRes;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash(i), hash(i + vec2(1,0)), u.x),
                mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
                u.y
            );
        }

        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 6; i++) {
                v += a * noise(p);
                p = p * 2.0 + vec2(1.7, 9.2);
                a *= 0.5;
            }
            return v;
        }

        float curtain(vec2 p, float t, float xOff, float speed, float freq) {
            float wave = sin(p.y * freq + t * speed) * 0.08
                       + sin(p.y * freq * 1.7 + t * speed * 0.7 + 2.0) * 0.05
                       + sin(p.y * freq * 0.6 + t * speed * 1.3 + 5.0) * 0.12;
            float center = xOff + wave;
            float d = abs(p.x - center);
            float glow = exp(-d * d * 80.0);
            float halo = exp(-d * d * 12.0);
            return glow * 0.7 + halo * 0.3;
        }

        float caustics(vec2 uv, float t, float scale) {
            vec2 p = uv * scale;
            float w1 = sin(p.x * 3.0 + sin(p.y * 1.5 + t * 0.4) * 0.8 + t * 0.3);
            float w2 = sin(p.y * 2.8 + sin(p.x * 1.3 - t * 0.35) * 0.7 + t * 0.25);
            float w3 = sin((p.x + p.y) * 2.0 + sin((p.x - p.y) * 1.1 + t * 0.3) * 0.6 + t * 0.2);
            float w4 = sin(p.x * 4.5 - p.y * 1.5 + t * 0.45);
            float w5 = sin(p.y * 4.0 + p.x * 1.8 - t * 0.38);
            float c = abs(w1 + w2 + w3) * 0.2 + abs(w4 + w5) * 0.15;
            return pow(c, 2.2);
        }

        void main() {
            vec2 uv = vUv;
            float asp = uRes.x / uRes.y;
            vec2 p = vec2(uv.x * asp, uv.y);
            float t = uTime;

            vec2 warp = vec2(
                sin(p.y * 2.0 + t * 0.18) * 0.005 + sin(p.y * 4.5 + t * 0.28) * 0.003,
                cos(p.x * 1.8 + t * 0.15) * 0.004 + cos(p.x * 3.8 + t * 0.22) * 0.002
            );
            vec2 wp = p + warp;

            vec3 abyssColor = vec3(0.008, 0.015, 0.04);
            vec3 deepColor  = vec3(0.015, 0.035, 0.08);
            vec3 midColor   = vec3(0.02, 0.06, 0.12);

            float depth = uv.y;
            vec3 water = mix(abyssColor, deepColor, smoothstep(0.0, 0.4, depth));
            water = mix(water, midColor, smoothstep(0.4, 0.85, depth));

            vec3 auroraGreen   = vec3(0.05, 0.65, 0.40);
            vec3 auroraTeal    = vec3(0.05, 0.50, 0.70);
            vec3 auroraCyan    = vec3(0.10, 0.70, 0.80);
            vec3 auroraPurple  = vec3(0.35, 0.15, 0.65);
            vec3 auroraMagenta = vec3(0.55, 0.10, 0.50);
            vec3 auroraBlue    = vec3(0.08, 0.30, 0.70);
            vec3 auroraWhite   = vec3(0.60, 0.85, 0.75);

            float c1 = curtain(wp, t, asp * 0.22, 0.12, 2.5);
            float c2 = curtain(wp, t, asp * 0.40, 0.15, 3.0);
            float c3 = curtain(wp, t, asp * 0.55, 0.10, 2.2);
            float c4 = curtain(wp, t, asp * 0.72, 0.13, 2.8);
            float c5 = curtain(wp, t, asp * 0.88, 0.11, 3.2);

            float breath1 = 0.6 + 0.4 * sin(t * 0.07 + 0.0);
            float breath2 = 0.5 + 0.5 * sin(t * 0.09 + 1.5);
            float breath3 = 0.55 + 0.45 * sin(t * 0.06 + 3.0);
            float breath4 = 0.5 + 0.5 * sin(t * 0.08 + 4.5);
            float breath5 = 0.45 + 0.55 * sin(t * 0.10 + 6.0);

            float colorShift = sin(t * 0.05) * 0.5 + 0.5;
            vec3 a1 = mix(auroraGreen, auroraCyan, colorShift * 0.4) * c1 * breath1;
            vec3 a2 = mix(auroraTeal, auroraGreen, sin(t * 0.06 + 1.0) * 0.5 + 0.5) * c2 * breath2;
            vec3 a3 = mix(auroraCyan, auroraWhite, sin(t * 0.04 + 2.0) * 0.3 + 0.3) * c3 * breath3;
            vec3 a4 = mix(auroraPurple, auroraBlue, sin(t * 0.07 + 3.0) * 0.5 + 0.5) * c4 * breath4;
            vec3 a5 = mix(auroraMagenta, auroraPurple, sin(t * 0.05 + 4.0) * 0.5 + 0.5) * c5 * breath5;

            float auroraDepth = smoothstep(0.0, 0.65, depth);
            auroraDepth *= 0.7 + 0.3 * smoothstep(0.5, 0.95, depth);

            vec3 aurora = (a1 + a2 + a3 + a4 + a5) * auroraDepth * 0.55;

            float overlap = (c1 * breath1 + c2 * breath2 + c3 * breath3) * auroraDepth;
            aurora += auroraWhite * pow(overlap, 3.0) * 0.08;

            water += aurora;

            float caust1 = caustics(wp + vec2(t * 0.02, 0.0), t * 0.6, 3.5);
            float caust2 = caustics(wp + vec2(0.0, t * 0.015), t * 0.8, 6.0);
            float caustBlend = caust1 * 0.7 + caust2 * 0.3;

            float caustStr = smoothstep(0.0, 0.5, depth) * 0.3 + 0.1;
            vec3 caustTint = mix(vec3(0.08, 0.30, 0.35), vec3(0.06, 0.20, 0.15), sin(wp.x * 2.0 + t * 0.1) * 0.5 + 0.5);
            water += caustTint * caustBlend * caustStr;
            water += vec3(0.10, 0.10, 0.08) * pow(caustBlend, 2.5) * caustStr;

            float shaft1 = exp(-pow(uv.x - 0.15, 2.0) * 60.0);
            float shaft2 = exp(-pow(uv.x - 0.35, 2.0) * 45.0);
            float shaft3 = exp(-pow(uv.x - 0.55, 2.0) * 55.0);
            float shaft4 = exp(-pow(uv.x - 0.73, 2.0) * 50.0);
            float shaft5 = exp(-pow(uv.x - 0.90, 2.0) * 70.0);

            float shaftDepth = smoothstep(0.0, 0.95, uv.y);
            float shaftBottom = 0.25 + 0.75 * uv.y;
            shaftDepth *= shaftBottom;
            float shaftNoise = fbm(vec2(uv.x * 3.0, uv.y * 2.0 - t * 0.04)) * 0.2 + 0.8;

            vec3 shaftColor = vec3(0.0);
            shaftColor += mix(auroraGreen, auroraCyan, colorShift * 0.4) * shaft1 * breath1;
            shaftColor += mix(auroraTeal, auroraGreen, 0.5) * shaft2 * breath2;
            shaftColor += auroraCyan * shaft3 * breath3;
            shaftColor += mix(auroraPurple, auroraBlue, 0.5) * shaft4 * breath4;
            shaftColor += auroraMagenta * shaft5 * breath5 * 0.7;

            water += shaftColor * shaftDepth * shaftNoise * 0.45;

            float surfGlow = smoothstep(0.75, 1.0, uv.y);
            vec3 surfColor = (a1 + a2 + a3 + a4 + a5) * 0.3 + vec3(0.03, 0.06, 0.08);
            water += surfColor * surfGlow * surfGlow * 0.4;

            float fog = smoothstep(0.25, 0.0, uv.y) * 0.08;
            water = mix(water, vec3(0.01, 0.02, 0.05), fog);

            float luma = dot(water, vec3(0.299, 0.587, 0.114));
            water = mix(vec3(luma), water, 1.35);

            vec2 vc = uv - 0.5;
            float vig = 1.0 - dot(vc, vc) * 0.2;
            water *= vig;

            water = clamp(water, 0.0, 1.0);
            gl_FragColor = vec4(water, 1.0);
        }
    `;

    function compileShader(src, type) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[aurora]', gl.getShaderInfoLog(s));
        }
        return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(vs, gl.VERTEX_SHADER));
    gl.attachShader(prog, compileShader(fs, gl.FRAGMENT_SHADER));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uRes = gl.getUniformLocation(prog, 'uRes');

    function resize() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    const start = performance.now();
    function frame() {
        requestAnimationFrame(frame);
        gl.uniform1f(uTime, (performance.now() - start) / 1000.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    frame();
})();
