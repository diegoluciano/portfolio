/* ============================================================
   Particle field — one continuous WebGL point cloud, fixed
   behind the page, that transmorphs formation by formation as
   the content scrolls:

     hero      → drifting emerald fog that materialises into a floor
                 pool of points as the visitor nears the next section
     stats     → data grid / lattice
     pillars   → three columns
     work      → a flowing stream
     finale    → a calm wide constellation

   Raw WebGL, no dependency. Screen-blended over the page so it
   only ever adds faint emerald light and never darkens text.
   Skipped for reduced-motion or when WebGL is unavailable.
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobile = window.matchMedia("(max-width: 767px)").matches;

  var canvas = document.createElement("canvas");
  canvas.id = "fx-field";
  document.body.appendChild(canvas);

  var gl =
    canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false }) ||
    canvas.getContext("experimental-webgl", { alpha: true });
  if (!gl) {
    canvas.remove();
    return;
  }

  var DPR = Math.min(mobile ? 2 : 1.75, window.devicePixelRatio || 1);
  var COUNT = reduce ? 1400 : mobile ? 2800 : 13000;
  // fraction of COUNT still drawn once past the hero (stats / pillars etc.) —
  // the field is meant to read as ambient dust there, not a crowd; kept low
  // on purpose (Diego: overall volume was too heavy past the hero)
  var REST_FRAC = reduce ? 1 : 0.22;

  // ---- shaders --------------------------------------------------------
  var VERT = [
    "precision highp float;",
    "attribute vec3 aFrom;",
    "attribute vec3 aTo;",
    "attribute vec3 aRnd;", // x: phase  y: size  z: brightness
    "uniform mat4 uProj;",
    "uniform float uT;",   // 0..1 within current segment
    "uniform float uM;",   // 0..LAST overall
    "uniform float uTime;",
    "uniform float uSpin;",
    "uniform float uSize;",
    "uniform vec2 uMouse;",     // cursor in field space (z=0 plane)
    "uniform float uMouseOn;",  // 0..1 eased presence
    "uniform float uMouseR;",   // repulsion radius (world units)
    "uniform float uMousePush;",// repulsion strength (world units)
    "uniform float uHero;",     // 1 at the hero formation, 0 elsewhere (gates face-clear / mouse / spin)
    "uniform float uKeep;",     // 0..1 fraction of the field kept (thinned past the hero)
    "uniform float uLineOn;",   // 1 when the field is the horizontal scan line
    "uniform float uLineDrop;", // world units the line has descended from the seam
    "uniform float uFogT;",     // 0 at hero top (all fog, no points) .. 1 by the time stats nears (fully materialised)
    "varying float vBright;",
    "varying float vFade;",
    "float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }",
    "float vnoise(vec3 x){",
    "  vec3 p = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);",
    "  return mix(mix(mix(hash(p+vec3(0,0,0)),hash(p+vec3(1,0,0)),f.x),",
    "                 mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),",
    "             mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),",
    "                 mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);",
    "}",
    "void main(){",
    // thin the field to uKeep of its count with a stable per-particle draw —
    // decorrelated from position, so every formation keeps its full extent,
    // just sparser. Culled points are parked off-clip.
    "  float keepRnd = hash(aRnd * 3.17 + 0.5);",
    "  if (keepRnd > uKeep) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }",
    "  vec3 pos = mix(aFrom, aTo, smoothstep(0.0, 1.0, uT));",
    "  float t = uTime * 0.08 + aRnd.x * 6.2831;",
    "  vec3 n = vec3(",
    "    vnoise(pos * 0.7 + vec3(t, 0.0, 0.0)),",
    "    vnoise(pos * 0.7 + vec3(0.0, t + 19.1, 0.0)),",
    "    vnoise(pos * 0.6 + vec3(0.0, 0.0, t + 43.7))) - 0.5;",
    // hero band + scan line both want to stay flat — damp vertical drift, keep
    // a little sideways shimmer; vertical drift opens up in the other shapes
    "  float calm = max(uHero, uLineOn);",
    "  float yDrift = mix(1.0, 0.28, calm);",
    "  n.x *= mix(1.0, 1.5, uHero); n.y *= yDrift;",
    "  pos += n * (0.045 * (0.35 + 0.65 * aRnd.x) * mix(1.0, 0.55, uLineOn));",
    // scan-line reveal: the field has collapsed onto the #expertise/#work seam
    // (top of frame) and now walks down as the leading edge of the emerald wipe
    "  pos.y -= uLineDrop * uLineOn;",
    "  float spin = min(uSpin, 0.28) * uHero;",
    "  float c = cos(spin), s = sin(spin);",
    "  pos.xz = mat2(c, -s, s, c) * pos.xz;",
    // soft mouse repulsion — hero only
    "  float react = 0.0;",
    "  {",
    "    vec2 away = pos.xy - uMouse;",
    "    float dm = length(away);",
    "    react = (1.0 - smoothstep(0.0, uMouseR, dm)) * uMouseOn * uHero;",
    "    pos.xy += (away / max(dm, 0.0001)) * react * uMousePush;",
    "  }",
    "  vec4 view = vec4(pos.x, pos.y, pos.z - 4.0, 1.0);",
    "  gl_Position = uProj * view;",
    "  float twinkle = 0.58 + 0.42 * sin(uTime * 1.7 + aRnd.x * 34.0);",
    // materialise out of the fog: each hero point has its own random reveal
    // threshold (aRnd.x, already used as a phase elsewhere) so they crystallise
    // in a staggered scatter as uFogT climbs, rather than popping in together —
    // reads as points condensing out of the mist. No-op outside the hero.
    // (there used to also be a fixed ellipse clearing the portrait here —
    // removed 2026-09-04, it read as the same "cutout" Diego kept rejecting;
    // the fog + staggered reveal already keeps the hero from feeling crowded)
    "  float reveal = smoothstep(aRnd.x - 0.12, aRnd.x + 0.12, uFogT);",
    "  vFade = twinkle * mix(1.0, reveal, uHero);",
    "  vBright = 0.4 + 1.0 * aRnd.z + react * 0.5 + uLineOn * 0.6;", // the scan line glows
    "  gl_PointSize = clamp(uSize * (2.6 + 4.4 * aRnd.y) * (1.0 + 0.35 * uLineOn) * " + DPR.toFixed(3) + ", 1.5, 120.0);",
    "}",
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec3 uColor;",
    "uniform float uAlpha;",
    "uniform float uOpacity;",   // global scroll envelope (0 = field has left the scene)
    "varying float vBright;",
    "varying float vFade;",
    "void main(){",
    "  float d = length(gl_PointCoord - 0.5);",
    "  if (d > 0.5) discard;",
    "  float halo = smoothstep(0.5, 0.05, d);",       // soft disc
    "  float core = smoothstep(0.22, 0.0, d);",        // bright centre
    "  vec3 col = uColor * vBright + core * 0.5;",
    "  gl_FragColor = vec4(col, (halo * 0.7 + core * 0.6) * vFade * uAlpha * uOpacity);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("fx shader:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    canvas.remove();
    return;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("fx link:", gl.getProgramInfoLog(prog));
    canvas.remove();
    return;
  }
  gl.useProgram(prog);

  var loc = {
    aFrom: gl.getAttribLocation(prog, "aFrom"),
    aTo: gl.getAttribLocation(prog, "aTo"),
    aRnd: gl.getAttribLocation(prog, "aRnd"),
    uProj: gl.getUniformLocation(prog, "uProj"),
    uT: gl.getUniformLocation(prog, "uT"),
    uM: gl.getUniformLocation(prog, "uM"),
    uTime: gl.getUniformLocation(prog, "uTime"),
    uSpin: gl.getUniformLocation(prog, "uSpin"),
    uSize: gl.getUniformLocation(prog, "uSize"),
    uColor: gl.getUniformLocation(prog, "uColor"),
    uAlpha: gl.getUniformLocation(prog, "uAlpha"),
    uOpacity: gl.getUniformLocation(prog, "uOpacity"),
    uMouse: gl.getUniformLocation(prog, "uMouse"),
    uMouseOn: gl.getUniformLocation(prog, "uMouseOn"),
    uMouseR: gl.getUniformLocation(prog, "uMouseR"),
    uMousePush: gl.getUniformLocation(prog, "uMousePush"),
    uHero: gl.getUniformLocation(prog, "uHero"),
    uKeep: gl.getUniformLocation(prog, "uKeep"),
    uLineOn: gl.getUniformLocation(prog, "uLineOn"),
    uLineDrop: gl.getUniformLocation(prog, "uLineDrop"),
    uFogT: gl.getUniformLocation(prog, "uFogT"),
  };
  gl.uniform3f(loc.uColor, 0.157, 0.949, 0.643); // #28f2a4
  gl.uniform1f(loc.uAlpha, reduce ? 0.4 : 0.85);
  gl.uniform1f(loc.uOpacity, 1);
  gl.uniform1f(loc.uSpin, 0);
  gl.uniform2f(loc.uMouse, 999, 999);
  gl.uniform1f(loc.uMouseOn, 0);
  gl.uniform1f(loc.uHero, 1);
  gl.uniform1f(loc.uKeep, 1);
  gl.uniform1f(loc.uLineOn, 0);
  gl.uniform1f(loc.uLineDrop, 0);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  // ---- geometry buffers -------------------------------------------
  var rnd = new Float32Array(COUNT * 3);
  for (var i = 0; i < COUNT * 3; i++) rnd[i] = Math.random();

  var bFrom = gl.createBuffer();
  var bTo = gl.createBuffer();
  var bRnd = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bRnd);
  gl.bufferData(gl.ARRAY_BUFFER, rnd, gl.STATIC_DRAW);

  var arrFrom = new Float32Array(COUNT * 3);
  var arrTo = new Float32Array(COUNT * 3);
  gl.bindBuffer(gl.ARRAY_BUFFER, bFrom);
  gl.bufferData(gl.ARRAY_BUFFER, arrFrom, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bTo);
  gl.bufferData(gl.ARRAY_BUFFER, arrTo, gl.DYNAMIC_DRAW);

  function bindAttribs() {
    gl.bindBuffer(gl.ARRAY_BUFFER, bFrom);
    gl.enableVertexAttribArray(loc.aFrom);
    gl.vertexAttribPointer(loc.aFrom, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bTo);
    gl.enableVertexAttribArray(loc.aTo);
    gl.vertexAttribPointer(loc.aTo, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bRnd);
    gl.enableVertexAttribArray(loc.aRnd);
    gl.vertexAttribPointer(loc.aRnd, 3, gl.FLOAT, false, 0, 0);
  }
  bindAttribs();

  // ---- fog pass: a full-screen quad behind the points, hero only --------
  // What the field looks like before it has anything to be discrete about:
  // a drifting, domain-warped noise field standing in for the emerald mist
  // already implied by the video's floor glow. It fades out (uFogAlpha) at
  // the same rate uFogT climbs and the points fade in (see VERT), so the
  // page reads as "the mist condenses into the particle field" rather than
  // a hard cut between two unrelated effects.
  var FOG_VERT = [
    "precision highp float;",
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }",
  ].join("\n");

  var FOG_FRAG = [
    "precision highp float;",
    "uniform vec2 uResolution;",
    "uniform float uTime;",
    "uniform float uFogAlpha;", // 0..1 overall visibility
    "uniform vec3 uColor;",
    "float hash(vec2 p){",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",
    "float vnoise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0));",
    "  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0, amp = 0.55;",
    "  for (int k = 0; k < 5; k++){",
    "    v += amp * vnoise(p);",
    "    p = p * 2.03 + vec2(11.0, -7.0);",
    "    amp *= 0.55;",
    "  }",
    "  return v;",
    "}",
    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / uResolution;", // y=0 at the bottom of the frame
    // coarse, large-scale structure (mist reads as a few big soft masses,
    // not many small ones) — the fbm octaves still add fine texture on top
    "  vec2 p = vec2(uv.x * 1.6, uv.y * 1.3);",
    "  vec2 drift = vec2(uTime * 0.03, -uTime * 0.018);",
    "  vec2 warp = vec2(fbm(p * 1.1 + drift), fbm(p * 1.1 - drift + 9.2));",
    "  float n = fbm(p + warp * 0.8 + drift);", // 0..~1 texture, gentler warp
    // wide pool low in frame, shallow convex top edge (mirrors fFloorBand's
    // shape) — present across the FULL width by default; noise only
    // textures its intensity, it never gates the band off entirely, so
    // this reads as one continuous mist instead of a narrow flame-like peak
    "  float cx = (uv.x - 0.5) * 2.0;",
    "  float topEdge = 0.72 - cx * cx * 0.2;",
    "  float band = 1.0 - smoothstep(topEdge - 0.7, topEdge, uv.y);",
    "  float density = band * mix(0.65, 1.0, n);",
    // additive blend (screen-composited on the page) needs a strong signal
    // to read as dense/opaque rather than a faint wash — push both alpha
    // and colour brightness up in the denser regions
    "  float alpha = density * uFogAlpha;",
    "  vec3 col = uColor * (0.8 + 0.55 * density);",
    "  gl_FragColor = vec4(col, alpha);",
    "}",
  ].join("\n");

  var fogProg = null;
  var fogLoc = null;
  var bFogPos = null;
  (function initFog() {
    var fvs = compile(gl.VERTEX_SHADER, FOG_VERT);
    var ffs = compile(gl.FRAGMENT_SHADER, FOG_FRAG);
    if (!fvs || !ffs) return; // fog is a nice-to-have; points still work without it
    var fp = gl.createProgram();
    gl.attachShader(fp, fvs);
    gl.attachShader(fp, ffs);
    gl.linkProgram(fp);
    if (!gl.getProgramParameter(fp, gl.LINK_STATUS)) {
      console.warn("fx fog link:", gl.getProgramInfoLog(fp));
      return;
    }
    fogProg = fp;
    fogLoc = {
      aPos: gl.getAttribLocation(fp, "aPos"),
      uResolution: gl.getUniformLocation(fp, "uResolution"),
      uTime: gl.getUniformLocation(fp, "uTime"),
      uFogAlpha: gl.getUniformLocation(fp, "uFogAlpha"),
      uColor: gl.getUniformLocation(fp, "uColor"),
    };
    // one big triangle covering the whole clip space — no seam down the
    // middle like a two-triangle quad, and one less vertex to submit
    bFogPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bFogPos);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.useProgram(fogProg);
    gl.uniform3f(fogLoc.uColor, 0.157, 0.949, 0.643); // #28f2a4, same as the points
    gl.useProgram(prog);
  })();

  function drawFog(fogAlpha) {
    if (!fogProg || fogAlpha <= 0.002) return;
    gl.useProgram(fogProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, bFogPos);
    gl.enableVertexAttribArray(fogLoc.aPos);
    gl.vertexAttribPointer(fogLoc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(fogLoc.uResolution, canvas.width, canvas.height);
    gl.uniform1f(fogLoc.uTime, uTime);
    gl.uniform1f(fogLoc.uFogAlpha, fogAlpha);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(prog);
    bindAttribs();
  }

  // ---- projection (perspective, fov 45) --------------------------
  var proj = new Float32Array(16);
  function setProj(aspect) {
    var f = 1 / Math.tan((45 * Math.PI) / 180 / 2);
    var near = 0.1,
      far = 100;
    proj[0] = f / aspect;
    proj[5] = f;
    proj[10] = (far + near) / (near - far);
    proj[11] = -1;
    proj[14] = (2 * far * near) / (near - far);
    proj[1] = proj[2] = proj[3] = proj[4] = proj[6] = proj[7] = proj[8] = proj[9] = proj[12] = proj[13] = proj[15] = 0;
    gl.uniformMatrix4fv(loc.uProj, false, proj);
  }

  // visible half-extents at the z=0 plane (camera at z=4, fov 45)
  var viewH = Math.tan((45 * Math.PI) / 180 / 2) * 4;
  var viewW = viewH;

  // ---- formations ----------------------------------------------
  function rn() {
    return Math.random() * 2 - 1;
  }
  function gauss(s) {
    return ((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * s;
  }

  // Hero: the field FILLS the emerald "floor glow" behind the portrait —
  // a wide pool of light low in the frame. Its top edge is a shallow convex
  // arc (highest across the centre, easing down at the wings); particles
  // fill from that edge downward into and past the bottom of frame, densest
  // near the glowing edge and thinning toward the floor. Reads as a
  // continuation of the video's green floor, not a traced line.
  // (2026-09-04: a rough silhouette cutout was tried here so the pool would
  // "avoid" Diego — rejected, read as fake, and drifted out of alignment at
  // narrower viewports since the oval is sized in world units while his
  // on-screen position comes from object-fit crop. Replaced by the fog→
  // particle materialisation below: the field simply isn't discrete points
  // yet while it's near him, so there's nothing to misalign.)
  function fFloorBand(a) {
    for (var p = 0; p < COUNT; p++) {
      // spread across (a touch beyond) the full width, softly centre-weighted
      var u = 0.5 + (Math.random() - Math.random()) * 0.8;
      var x = (u * 2 - 1) * 1.32 * viewW;
      var nx = x / viewW;
      // top edge of the pool — shallow, convex, ~0.12*viewH of drop wing-to-wing
      var topY = -0.42 * viewH - nx * nx * 0.1 * viewH;
      // depth below the edge: biased toward the top (where the glow reads),
      // long soft tail sinking below the frame bottom
      var d = Math.pow(Math.random(), 1.8);
      var y = topY - d * 0.9 * viewH + gauss(0.03 * viewH);
      var z = rn() * 0.5;
      // a few embers just above the edge so the pool doesn't look clipped
      if (p % 26 === 0) y = topY + Math.pow(Math.random(), 3) * 0.2 * viewH;
      a[p * 3] = x;
      a[p * 3 + 1] = y;
      a[p * 3 + 2] = z;
    }
  }
  // Stats: deliberately no lattice, no rectangle — Diego flagged the old
  // grid as reading like a drawn box around the numbers. Just a loose,
  // uniform scatter across the whole frame so it sits behind the figures
  // as ambient dust rather than a shape.
  function fGrid(a) {
    for (var p = 0; p < COUNT; p++) {
      a[p * 3] = rn() * 1.3 * viewW;
      a[p * 3 + 1] = rn() * 1.2 * viewH;
      a[p * 3 + 2] = rn() * 0.5;
    }
  }
  // Pillars: the grid "lets go" — a soft, unstructured cloud. Deliberately
  // just a looser dispersion of the section above, no lattice, no columns.
  function fCloud(a) {
    for (var p = 0; p < COUNT; p++) {
      var ang = Math.random() * Math.PI * 2;
      var r = Math.pow(Math.random(), 0.65); // gently denser toward the middle ring
      a[p * 3] = Math.cos(ang) * r * 1.0 * viewW + gauss(0.12 * viewW);
      a[p * 3 + 1] = Math.sin(ang) * r * 0.9 * viewH + gauss(0.12 * viewH);
      a[p * 3 + 2] = gauss(0.6);
    }
  }
  // Work reveal: the field collapses into a thin, full-width horizontal line
  // sitting exactly on the #expertise / #work seam (top of frame). From there
  // uLineDrop walks it down the screen as the leading edge of the emerald
  // "scanner" wipe on #work — fx.js drives #work's --work-reveal in lockstep.
  // opacityFor keeps it lit through the sweep, then drops it before the galleries.
  function fLine(a) {
    for (var p = 0; p < COUNT; p++) {
      a[p * 3] = rn() * 1.45 * viewW; // full viewport width, edge to edge
      a[p * 3 + 1] = viewH + gauss(0.013 * viewH); // thin band at the top of frame
      a[p * 3 + 2] = rn() * 0.22;
    }
  }
  // The explosion — flung outward past the frame edges. With the opacity
  // envelope the field is gone while the portfolio images are on screen.
  function fScatter(a) {
    for (var p = 0; p < COUNT; p++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 1.7 + Math.random() * 1.6; // 1.7–3.3 view units from centre
      a[p * 3] = Math.cos(ang) * rad * viewW;
      a[p * 3 + 1] = Math.sin(ang) * rad * viewH;
      a[p * 3 + 2] = rn() * 1.4;
    }
  }
  function fConstellation(a) {
    for (var p = 0; p < COUNT; p++) {
      a[p * 3] = rn() * 1.3 * viewW;
      a[p * 3 + 1] = rn() * 1.2 * viewH;
      a[p * 3 + 2] = rn() * 0.9;
    }
  }
  var FORMS = [
    ["floor", fFloorBand], // hero
    ["grid", fGrid], // stats
    ["cloud", fCloud], // pillars
    ["line", fLine], // #expertise/#work seam — the emerald scanner edge
    ["scatter", fScatter], // work galleries — dispersed / gone
    ["stars", fConstellation], // finale
  ];
  var builders = FORMS.map(function (f) {
    return f[1];
  });
  var IDX = {};
  FORMS.forEach(function (f, i) {
    IDX[f[0]] = i;
  });
  var LAST = builders.length - 1;
  var cache = builders.map(function () {
    return null;
  });
  function formation(idx) {
    idx = Math.max(0, Math.min(LAST, idx));
    if (!cache[idx]) {
      cache[idx] = new Float32Array(COUNT * 3);
      builders[idx](cache[idx]);
    }
    return cache[idx];
  }

  var curSeg = -1;
  function setSegment(seg) {
    seg = Math.max(0, Math.min(LAST, seg));
    if (seg === curSeg) return;
    curSeg = seg;
    arrFrom.set(formation(seg));
    arrTo.set(formation(Math.min(LAST, seg + 1)));
    gl.bindBuffer(gl.ARRAY_BUFFER, bFrom);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arrFrom);
    gl.bindBuffer(gl.ARRAY_BUFFER, bTo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arrTo);
  }

  // ---- scroll → morph + opacity envelope ---------------------
  var workEl = document.getElementById("work");
  var moreWorkEl = document.getElementById("more-work");
  var marks = {
    stats: Infinity,
    pillars: Infinity,
    work: Infinity, // #work intro — the emerald moment
    gallery: Infinity, // first work gallery — field must be gone by here
    revive: Infinity, // #more-work — field starts coming back
    finale: Infinity,
  };
  function remeasure() {
    var y = window.scrollY || window.pageYOffset;
    function top(sel) {
      var el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().top + y : Infinity;
    }
    marks.stats = top("[data-stats]");
    marks.pillars = top("[data-pillars]");
    marks.work = top("#work");
    marks.gallery = Math.min(top("[data-hg]"), marks.work + window.innerHeight);
    marks.finale = top("#finale");
    marks.revive = Math.min(top("#more-work"), marks.finale); // page may lack #more-work
  }
  function smooth(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a || 1)));
    return t * t * (3 - 2 * t);
  }
  // scroll → formation index (IDX.floor .. IDX.stars)
  function morphFor(y) {
    var vh = window.innerHeight;
    var w = marks.work;
    if (y < marks.stats - vh) return IDX.floor;
    if (y < marks.pillars - vh)
      return IDX.floor + smooth(marks.stats - vh, marks.stats, y);
    if (y < w - vh * 1.5)
      return IDX.grid + smooth(marks.pillars - vh, marks.pillars, y);
    if (y < w - vh * 0.55)
      return IDX.cloud + smooth(w - vh * 1.35, w - vh * 0.6, y); // cloud → line (formed as the seam nears the top)
    if (y < marks.revive - vh)
      return IDX.line + smooth(w + vh * 0.1, w + vh * 0.5, y); // line → scatter, after the sweep
    return IDX.scatter + smooth(marks.revive - vh * 0.4, marks.finale, y); // scatter → stars
  }
  // Emerald "scanner" reveal for #work: 0 = hidden, 1 = fully green. Runs from
  // work's top ~55% down the viewport to ~5% down (~half a viewport of scroll),
  // so it completes well before the first gallery pins. Reads the live rect so
  // it scrubs cleanly both directions.
  function scanFor() {
    if (!workEl) return 0;
    var vpH = window.innerHeight;
    var t = workEl.getBoundingClientRect().top;
    return Math.max(0, Math.min(1, (0.55 * vpH - t) / (0.5 * vpH)));
  }
  // Same scanner, reused for #more-work — the emerald wipe picks up again
  // where the last gallery's progress bar leaves off.
  function scanForMoreWork() {
    if (!moreWorkEl) return 0;
    var vpH = window.innerHeight;
    var t = moreWorkEl.getBoundingClientRect().top;
    return Math.max(0, Math.min(1, (0.55 * vpH - t) / (0.5 * vpH)));
  }
  // global visibility — lit through the scan-line sweep, then GONE by the time
  // the wipe reaches the base of #work (fade across the last third of the
  // scan). Returns at the finale.
  function opacityFor() {
    var vh = window.innerHeight;
    var out = smooth(0.62, 0.98, scanFor()); // 0→1 as the wipe completes
    var back = smooth(
      marks.revive - vh * 0.35,
      marks.finale - vh * 0.1,
      window.__lenis ? window.__lenis.scroll : window.scrollY || window.pageYOffset
    );
    return Math.max(0, Math.min(1, 1 - out + back * 0.92));
  }

  // ---- resize ---------------------------------------------
  var resizeTO;
  function resize() {
    var w = window.innerWidth,
      h = window.innerHeight;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    setProj(w / h);
    viewH = Math.tan((45 * Math.PI) / 180 / 2) * 4;
    viewW = viewH * (w / h);
    gl.uniform1f(loc.uSize, Math.min(1.35, w / 1280));
    gl.uniform1f(loc.uMouseR, 0.5 * viewH);
    gl.uniform1f(loc.uMousePush, 0.34 * viewH);
    remeasure();
    for (var k = 0; k < builders.length; k++) cache[k] = null;
    curSeg = -1;
    setSegment(Math.floor(morphFor(window.scrollY || window.pageYOffset || 0)));
  }
  window.addEventListener("resize", function () {
    clearTimeout(resizeTO);
    resizeTO = setTimeout(resize, 180);
  });
  window.addEventListener("load", remeasure);
  if (window.ScrollTrigger) window.ScrollTrigger.addEventListener("refresh", remeasure);
  resize();

  // ---- loop ---------------------------------------------
  var running = true;
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    last = performance.now();
  });
  var last = performance.now();
  var mDisp = morphFor(window.scrollY || 0);
  var oDisp = opacityFor();
  var uTime = 0,
    uSpin = 0;

  // ---- mouse repulsion (hero only) --------------------------
  var msTX = 999, msTY = 999, msX = 999, msY = 999, msOnT = 0, msOn = 0, msLast = 0;
  var pointerFine =
    !mobile && window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (pointerFine && !reduce) {
    window.addEventListener(
      "mousemove",
      function (e) {
        var w = window.innerWidth,
          h = window.innerHeight;
        msTX = (e.clientX / w - 0.5) * 2 * viewW;
        msTY = -(e.clientY / h - 0.5) * 2 * viewH;
        msOnT = 1;
        msLast = performance.now();
      },
      { passive: true }
    );
    var leave = function () {
      msOnT = 0;
    };
    document.addEventListener("mouseleave", leave);
    window.addEventListener("blur", leave);
  }

  function render(forceDt) {
    var lenis = window.__lenis;
    var y = lenis ? lenis.scroll : window.scrollY || window.pageYOffset;
    var mTarget = morphFor(y);
    var oTarget = opacityFor();
    var now = performance.now();
    var dt = forceDt != null ? forceDt : Math.min(0.05, (now - last) / 1000);
    last = now;

    if (reduce) {
      mDisp = mTarget;
      oDisp = oTarget;
      uTime += dt;
    } else {
      mDisp += (mTarget - mDisp) * Math.min(1, dt * 6);
      oDisp += (oTarget - oDisp) * Math.min(1, dt * 4);
      uTime += dt;
      uSpin += dt * 0.06;

      // idle for >1.6s counts as "gone" so the field closes back up
      if (msOnT === 1 && now - msLast > 1600) msOnT = 0;
      var k = Math.min(1, dt * 9);
      msX += (msTX - msX) * k;
      msY += (msTY - msY) * k;
      msOn += (msOnT - msOn) * Math.min(1, dt * 5);
      gl.uniform2f(loc.uMouse, msX, msY);
      gl.uniform1f(loc.uMouseOn, msOn);
    }

    var hero = Math.max(0, 1 - Math.abs(mDisp - IDX.floor)); // 1 at the hero band, 0 elsewhere
    var y = window.__lenis ? window.__lenis.scroll : window.scrollY || window.pageYOffset;

    // fog → particles: pure mist for the whole hero — the field only starts
    // materialising once the visitor is leaving the hero for stats, in step
    // with the existing floor→grid shape morph (morphFor blends those over
    // the same [marks.stats - vh, marks.stats] window), and finishes a
    // little into the stats section so it's already settled into today's
    // look by the time the visitor is reading the numbers. Skipped under
    // reduced-motion — fogT pinned at 1 so that path is unchanged.
    var vh = window.innerHeight;
    var fogStart = marks.stats - vh;
    var fogEnd = marks.stats + vh * 0.75;
    var fogT = reduce ? 1 : smooth(fogStart, Math.max(fogStart + 1, fogEnd), y);

    // emerald scanner: drive #work's reveal and walk the particle line down
    // the screen with its leading edge
    var reveal = scanFor();
    if (workEl) {
      workEl.style.setProperty("--work-reveal", reveal.toFixed(4));
      // glow bar on the wipe edge — fades in over the first slice of the scan
      // and out as it lands on the base
      var glow = Math.max(0, Math.min(1, Math.min(reveal * 7, (1 - reveal) * 7)));
      workEl.style.setProperty("--scan-glow", glow.toFixed(4));
    }
    var lineOn = Math.max(0, 1 - Math.abs(mDisp - IDX.line));
    var lineDrop = 0;
    if (workEl && lineOn > 0.001) {
      var wr = workEl.getBoundingClientRect();
      var edgePx = wr.top + reveal * wr.height; // screen Y of the wipe edge
      lineDrop = (2 * viewH * edgePx) / window.innerHeight; // → world units below the seam
    }
    gl.uniform1f(loc.uLineOn, lineOn);
    gl.uniform1f(loc.uLineDrop, lineDrop);

    // black text / topbar blend while the emerald covers the copy; release it
    // once #work has scrolled away into the galleries
    var offWork = smooth(
      marks.gallery - window.innerHeight * 0.15,
      marks.gallery + window.innerHeight * 0.35,
      y
    );
    if (reveal * (1 - offWork) > 0.35) document.body.classList.add("work-solid");
    else document.body.classList.remove("work-solid");

    // same emerald scanner again at #more-work, picking up where the last
    // gallery's progress bar leaves off. #more-work is now a full pinned
    // gallery (title → cards → CTA), so — same as #work/offWork — the
    // release has to be anchored to the NEXT section (#finale), not to
    // #more-work's own start: anchoring off marks.revive (its top) was
    // firing the release ~0.3-0.9vh into a pin that runs for several
    // viewport-heights, flipping the text back to light while the card
    // slider (and the CTA button after it) were still solid green.
    var reveal2 = scanForMoreWork();
    if (moreWorkEl) {
      moreWorkEl.style.setProperty("--more-work-reveal", reveal2.toFixed(4));
      var glow2 = Math.max(0, Math.min(1, Math.min(reveal2 * 7, (1 - reveal2) * 7)));
      moreWorkEl.style.setProperty("--more-work-glow", glow2.toFixed(4));
    }
    var offMoreWork = smooth(
      marks.finale - window.innerHeight * 0.5,
      marks.finale + window.innerHeight * 0.1,
      y
    );
    if (reveal2 * (1 - offMoreWork) > 0.35) document.body.classList.add("more-work-solid");
    else document.body.classList.remove("more-work-solid");
    // hard guarantee: the canvas is not even composited once the line has swept
    // past, through the galleries, until the finale
    canvas.style.visibility =
      !reduce && mDisp > IDX.line + 0.5 && mDisp < IDX.stars - 0.6
        ? "hidden"
        : "visible";
    setSegment(Math.floor(mDisp));
    gl.useProgram(prog);
    bindAttribs();
    gl.uniform1f(loc.uT, mDisp - curSeg);
    gl.uniform1f(loc.uM, mDisp);
    gl.uniform1f(loc.uHero, hero);
    // full field in the hero, thinned to REST_FRAC once the grid/cloud take
    // over so it doesn't fight the body copy (same extent, fewer points)
    gl.uniform1f(loc.uKeep, REST_FRAC + (1 - REST_FRAC) * hero);
    gl.uniform1f(loc.uOpacity, oDisp);
    gl.uniform1f(loc.uTime, uTime);
    gl.uniform1f(loc.uSpin, uSpin);
    gl.uniform1f(loc.uFogT, fogT);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // fog first (it's the backdrop the points condense out of), then points.
    // Driven by fogT alone, not the hero gate — hero collapses to 0 as soon
    // as mDisp reaches IDX.grid (right at marks.stats), which would cut the
    // fog off before fogT (deliberately stretched past marks.stats) finishes
    // fading it — the whole point is letting it linger into the next section.
    drawFog((1 - fogT) * oDisp);
    gl.drawArrays(gl.POINTS, 0, COUNT);
  }

  if (reduce) {
    // static field; only re-render when the scroll position changes it
    var raf0 = 0;
    var onScroll = function () {
      if (raf0) return;
      raf0 = requestAnimationFrame(function () {
        raf0 = 0;
        render(0);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    render(0);
  } else {
    (function loop() {
      requestAnimationFrame(loop);
      if (running) render();
    })();
  }

  // debug handle — harmless; lets tooling step the field when rAF is throttled
  window.__fx = {
    step: function (n) {
      for (var k = 0; k < (n || 1); k++) render(1 / 60);
    },
    marks: marks,
    seg: function () {
      return curSeg;
    },
    mDisp: function () {
      return mDisp;
    },
    count: COUNT,
  };
})();
