/* Portrait phones / small tablets: use the portrait-cropped hero clips.
   One definition, shared by the loader and the scroll-scrub engine. */
var PORTRAIT_CLIPS_MQ = "(max-width: 860px) and (max-aspect-ratio: 4/5)";

/* ============================================================
   Loader — the loading IS the title. Each of the three words
   "inks in" left→right and its fill position is that word's
   real load progress (m1 scripts+CSS · m2 fonts · m3 hero video
   ready), and each completed word pops in one logo letter (D H L).
   Once all three are full: DESIGN ENGINEER, the tag row, then the
   video (blur → sharp) and the particle field fade up, and the
   LET'S TALK CTA / scroll cue follow.
   Gated on <html class="js"> so no-JS shows everything plainly.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var title = document.querySelector("[data-title]");
  if (!title || !root.classList.contains("js")) return;

  var words = Array.prototype.slice.call(title.querySelectorAll(".ttl-word"));
  var logoLetters = Array.prototype.slice.call(
    document.querySelectorAll(".topbar__logo-mark .lm-l")
  );
  var kicker = document.querySelector(".scroll-scrub__kicker");
  var tags = document.querySelector(".scroll-scrub__tags");
  var cta = document.querySelector(".topbar__cta");
  var cue = document.querySelector(".scroll-scrub__scrollcue");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof gsap === "undefined") {
    root.classList.remove("js"); // drop the hidden state — show everything
    document.body.classList.remove("pl-loading");
    return;
  }

  document.body.classList.add("pl-lock", "pl-loading");

  /* ---- Hard scroll lock ------------------------------------------------
     overflow:hidden alone isn't enough: Lenis scrolls via JS, and touch /
     keyboard still move the page. Block every input path until the film is
     fully in, and always start from the top so a reload mid-page can't skip
     the intro. unlockScroll() is the single exit. */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (!location.hash) window.scrollTo(0, 0);
  function stopEvent(e) {
    e.preventDefault();
  }
  var LOCK_KEYS = [" ", "Spacebar", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
  function stopKey(e) {
    if (LOCK_KEYS.indexOf(e.key) > -1) e.preventDefault();
  }
  window.addEventListener("wheel", stopEvent, { passive: false });
  window.addEventListener("touchmove", stopEvent, { passive: false });
  window.addEventListener("keydown", stopKey);
  function unlockScroll() {
    window.removeEventListener("wheel", stopEvent, { passive: false });
    window.removeEventListener("touchmove", stopEvent, { passive: false });
    window.removeEventListener("keydown", stopKey);
    document.body.classList.remove("pl-lock");
    if (window.__lenis) window.__lenis.start();
  }

  /* ---- Real download progress for the hero clips -----------------------
     The loader owns the two hero downloads (scrub film + "alive" loop) so
     it can show TRUE byte progress and hold the page until both are in. The
     scroll-scrub engine and the loop player pick the finished blobs up from
     window.__heroPreload, so nothing is downloaded twice. --ld (0→1) on
     <html> is the live fraction, for anything that wants to react to it. */
  var preload = (window.__heroPreload = {});
  var heroRoot0 = document.querySelector("[data-scroll-scrub-root]");
  var aliveEl0 = document.querySelector("[data-hero-alive]");
  // Portrait phones/tablets get a centred, portrait-cropped, lighter encode of
  // each clip (same framing as the full 16:9 file at that aspect, ~1/3 the
  // bytes). Landscape phones keep the full clips — a portrait crop would zoom.
  var usePortraitClips = window.matchMedia(PORTRAIT_CLIPS_MQ).matches;
  var filmUrl =
    heroRoot0 &&
    ((usePortraitClips && heroRoot0.getAttribute("data-clip-mobile")) ||
      heroRoot0.getAttribute("data-clip"));
  var loopUrl =
    aliveEl0 &&
    ((usePortraitClips && aliveEl0.getAttribute("data-src-mobile")) ||
      aliveEl0.getAttribute("data-src"));
  window.__heroSources = { film: filmUrl, loop: loopUrl };
  var clipUrls = [filmUrl, loopUrl].filter(Boolean);
  var bytes = {};
  var progressHook = null;

  // Loading manifest (index.html): live %, what's been fetched, and a
  // "what's coming" note that only appears if the wait is actually long.
  var manifest = document.querySelector("[data-ld-manifest]");
  var pctEl = manifest && manifest.querySelector("[data-ld-pct]");
  var noteEl = manifest && manifest.querySelector("[data-ld-note]");
  function markItem(key) {
    var el = manifest && manifest.querySelector('[data-ld-item="' + key + '"]');
    if (el) el.classList.add("is-on");
  }
  var HARD_CAP_MS = 45000; // never trap someone forever on a dead connection

  function fraction() {
    var got = 0;
    var total = 0;
    clipUrls.forEach(function (u) {
      if (bytes[u]) {
        got += bytes[u].got;
        total += bytes[u].total;
      }
    });
    return total > 0 ? Math.min(1, got / total) : 0;
  }
  function totalBytes() {
    var t = 0;
    clipUrls.forEach(function (u) {
      if (bytes[u]) t += bytes[u].total;
    });
    return t;
  }
  function report() {
    var f = fraction();
    root.style.setProperty("--ld", f.toFixed(4));
    if (pctEl) pctEl.textContent = Math.round(f * 100) + "%";
    if (progressHook) progressHook(f);
  }
  function fetchClip(url) {
    bytes[url] = { got: 0, total: 0 };
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("clip " + res.status);
        bytes[url].total = parseInt(res.headers.get("Content-Length"), 10) || 0;
        if (!res.body || !res.body.getReader) return res.blob();
        var reader = res.body.getReader();
        var chunks = [];
        var type = res.headers.get("Content-Type") || "video/mp4";
        return (function pump() {
          return reader.read().then(function (r) {
            if (r.done) return new Blob(chunks, { type: type });
            chunks.push(r.value);
            bytes[url].got += r.value.length;
            report();
            return pump();
          });
        })();
      })
      .then(function (blob) {
        bytes[url].got = bytes[url].total = blob.size;
        report();
        return blob;
      });
  }
  clipUrls.forEach(function (u) {
    preload[u] = fetchClip(u);
    preload[u].catch(function () {}); // surfaced via m3 below
  });
  if (filmUrl) preload[filmUrl].then(function () { markItem("film"); }, function () {});
  if (loopUrl) preload[loopUrl].then(function () { markItem("loop"); }, function () {});

  var allLoaded = false;
  setTimeout(function () {
    if (allLoaded || !noteEl) return;
    var mb = totalBytes() / 1e6;
    noteEl.textContent =
      "Preparing an interactive film" + (mb ? " \u00b7 " + mb.toFixed(1) + " MB" : "");
    noteEl.classList.add("is-shown");
  }, 2200);

  var m1 = new Promise(function (r) {
    setTimeout(r, 450); // scripts/CSS in — plus a minimum on-screen beat
  });
  var m2 =
    document.fonts && document.fonts.ready
      ? document.fonts.ready
      : Promise.resolve();
  m2.then(function () {
    markItem("fonts");
  });
  // m3 = both clips fully downloaded AND the engine's <video> decodable.
  // Capped, so a dead connection degrades to the poster instead of a trap.
  var m3 = Promise.race([
    Promise.all(
      clipUrls.map(function (u) {
        return preload[u];
      })
    )
      .then(function () {
        return new Promise(function (r) {
          var t0 = Date.now();
          var iv = setInterval(function () {
            var v = document.querySelector("[data-scroll-scrub-layer] video");
            if ((v && v.readyState >= 3) || Date.now() - t0 > 8000) {
              clearInterval(iv);
              r();
            }
          }, 120);
        });
      })
      .catch(function () {}),
    new Promise(function (r) {
      setTimeout(r, HARD_CAP_MS);
    }),
  ]);

  // Each word "inks in" left→right; its fill IS that word's real load
  // progress. Indeterminate creep while its milestone is pending, then it
  // completes to 100% when the milestone resolves — and the matching logo
  // letter (D → H → L) pops in as the word lands.
  function inkWord(i, milestone) {
    words[i].classList.add("is-inking");
    var creep = null;
    if (i === words.length - 1) {
      // the last word IS the film's download: its fill follows real bytes
      progressHook = function (f) {
        gsap.to(words[i], {
          "--p": 6 + 90 * f + "%",
          duration: 0.45,
          ease: "power1.out",
          overwrite: true,
        });
      };
      progressHook(fraction());
    } else {
      creep = gsap.to(words[i], {
        "--p": "84%",
        duration: 2.6,
        ease: "power1.out",
      });
    }
    return milestone.then(function () {
      if (creep) creep.kill();
      if (i === words.length - 1) {
        progressHook = null;
        gsap.killTweensOf(words[i]);
      }
      return new Promise(function (res) {
        // finish the fill at a steady, unhurried pace — no snap at the end
        gsap.to(words[i], {
          "--p": "100%",
          duration: 0.7,
          ease: "power1.out",
          onComplete: function () {
            words[i].classList.remove("is-inking");
            res();
          },
        });
        if (logoLetters[i]) {
          gsap.fromTo(
            logoLetters[i],
            { autoAlpha: 0, y: -6 },
            { autoAlpha: 1, y: 0, duration: 0.4, ease: "back.out(1.8)", delay: 0.05 }
          );
        }
      });
    });
  }

  /* ---- Hero entrance: a designed glitch ---------------------------------
     Runs once, the moment the loader lets the film exist. The film locks on
     through horizontal slice displacement + an RGB split (SVG #hero-glitch
     in index.html) that settles to a clean frame. Everything is set in one task (stage dark → filter on →
     loading class off) so there is never a flash of the un-glitched frame,
     and the filter is dropped afterwards so it costs nothing. Returns the
     timeline (handy for scrubbing it in devtools: __heroEntrance()). */
  function heroEntrance() {
    var media = document.querySelector(".scroll-scrub__media");
    var noise = document.getElementById("hg-noise");
    var disp = document.getElementById("hg-disp");
    var offR = document.getElementById("hg-r");
    var offB = document.getElementById("hg-b");
    if (!media || !noise || !disp || !offR || !offB) {
      document.body.classList.remove("pl-loading");
      return null;
    }

    var k = window.matchMedia("(max-width: 860px)").matches ? 0.6 : 1; // gentler on phones
    var st = { scale: 0, split: 0 };
    function apply() {
      disp.setAttribute("scale", st.scale.toFixed(1));
      offR.setAttribute("dx", st.split.toFixed(1));
      offB.setAttribute("dx", (-st.split).toFixed(1));
    }

    gsap.set(media, { opacity: 0 });
    media.style.filter = "url(#hero-glitch)";
    document.body.classList.remove("pl-loading");

    // [time, opacity, slice displacement, RGB split, noise seed]
    var beats = [
      [0.0, 0.0, 0, 0, 11],
      [0.06, 0.85, 80, 20, 47],
      [0.14, 0.4, 36, 10, 203],
      [0.22, 1.0, 110, 26, 86],
      [0.32, 0.65, 28, 9, 311],
      [0.4, 1.0, 64, 16, 150],
      [0.52, 0.85, 24, 11, 29],
      [0.6, 1.0, 12, 6, 400],
    ];
    var tl = gsap.timeline({
      onComplete: function () {
        media.style.filter = "";
        gsap.set(media, { clearProps: "opacity" });
      },
    });
    beats.forEach(function (b) {
      tl.add(function () {
        noise.setAttribute("seed", b[4]);
        st.scale = b[2] * k;
        st.split = b[3] * k;
        apply();
        gsap.set(media, { opacity: b[1] });
      }, b[0]);
    });
    // settle: the slices and the colour split relax to nothing
    tl.to(st, { scale: 0, split: 0, duration: 0.6, ease: "power3.out", onUpdate: apply }, 0.64);
    tl.set(media, { opacity: 1 }, 0.64);
    return tl;
  }
  window.__heroEntrance = heroEntrance;

  var chain = Promise.resolve();
  [m1, m2, m3].forEach(function (m, i) {
    chain = chain.then(function () {
      return inkWord(i, m);
    });
  });

  chain.then(function () {
    allLoaded = true;
    if (pctEl) pctEl.textContent = "100%";
    if (manifest) manifest.classList.add("is-done");
    // Hold the reveal elements hidden with inline values (over the `.js`
    // rules). Nothing gets clearProps'd until the very end — clearing inline
    // while a `.js` opacity:0 rule is still live is what made things
    // appear → vanish → reappear.
    var reveal = [kicker, cta, cue].filter(Boolean); // the tag row is no longer part of the opening
    gsap.set(reveal, { autoAlpha: 0, y: 14 });

    var tl = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: function () {
        root.classList.remove("js"); // drop all `.js` hiding rules at once
        gsap.set(reveal.concat(logoLetters), { clearProps: "all" });
        gsap.set(words, { clearProps: "--p" });
        words.forEach(function (w) {
          w.classList.remove("is-inking");
        });
        unlockScroll();
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      },
    });

    tl.to({}, { duration: 0.2 }); // settle on the full name (D H L already in)
    if (kicker) tl.to(kicker, { autoAlpha: 1, y: 0, duration: 0.6 }, ">");
    // video (blur → sharp) + particle field ease in via their CSS transitions
    tl.add(heroEntrance, ">-0.15");
    if (cta) tl.to(cta, { autoAlpha: 1, y: 0, duration: 0.7 }, "<");
    if (cue) tl.to(cue, { autoAlpha: 1, y: 0, duration: 0.8 }, "<0.2");
    tl.to({}, { duration: 0.8 }); // let the CSS video/particle fade land before release
  });
})();

/* ============================================================
   Smooth scroll (Lenis) — eases native scroll and feeds every
   frame to ScrollTrigger so pins/scrubs stay exact. Skipped for
   reduced-motion and if the CDN/vendor script is unavailable, in
   which case the page just scrolls natively. Runs first so it is
   in place before any ScrollTrigger is built below.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    if (typeof Lenis === "undefined" || typeof gsap === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var lenis = new Lenis({
      duration: 1.05,
      easing: function (t) {
        return Math.min(1, 1.001 - Math.pow(2, -10 * t));
      },
      smoothWheel: true,
      anchors: true, // in-page #hash links ease via Lenis instead of a native jump
    });

    lenis.on("scroll", function () {
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
    });
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    window.__lenis = lenis;
    // the loader may still be holding the page: stay frozen until it lets go
    if (document.body.classList.contains("pl-lock")) lenis.stop();
  });
})();

/* ============================================================
   Scroll-Scrub engine — vanilla JS port of the Higgsfield
   scroll-scrub reference (React) component. Ties a background
   video's currentTime to scroll position for a cinematic,
   scroll-scrubbed hero film. Supports N scenes + optional
   connectors, lazy blob-based clip loading, poster/video
   crossfade, mobile detection and prefers-reduced-motion.
   ============================================================ */
(function () {
  "use strict";

  function clamp(value, min, max) {
    if (min === undefined) min = 0;
    if (max === undefined) max = 1;
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(value) {
    var x = clamp(value);
    return x * x * (3 - 2 * x);
  }

  function lingerEase(value, amount) {
    var x = clamp(value);
    var linger = clamp(amount, 0, 0.6);
    var centered = x - 0.5;
    return (1 - linger) * x + linger * (4 * Math.pow(centered, 3) + 0.5);
  }

  function buildSegments(scenes, connectors) {
    connectors = connectors || [];
    var result = [];
    scenes.forEach(function (scene, index) {
      result.push({
        clip: scene.clip,
        key: "scene:" + scene.id,
        kind: "scene",
        linger: scene.linger || 0,
        mobileClip: scene.mobileClip,
        mobilePoster: scene.mobilePoster,
        mobileObjectPosition:
          scene.mobileObjectPosition || scene.objectPosition || "50% 50%",
        nextSectionIndex: index,
        objectPosition: scene.objectPosition || "50% 50%",
        poster: scene.poster,
        scene: scene,
        sectionIndex: index,
        weight: scene.scroll || 1.4,
      });

      var connector = connectors[index];
      if (index < scenes.length - 1 && connector && connector.clip) {
        var nextScene = scenes[index + 1];
        result.push({
          clip: connector.clip,
          key: "connector:" + scene.id + ":" + nextScene.id,
          kind: "connector",
          linger: 0,
          mobileClip: connector.mobileClip,
          mobilePoster: connector.mobilePoster,
          mobileObjectPosition:
            nextScene.mobileObjectPosition ||
            nextScene.objectPosition ||
            "50% 50%",
          nextSectionIndex: index + 1,
          objectPosition: nextScene.objectPosition || "50% 50%",
          poster: connector.poster,
          sectionIndex: index,
          weight: connector.scroll || 0.8,
        });
      }
    });
    return result;
  }

  function initScrollScrub(root, scenes, connectors, theme) {
    if (!root || !scenes || scenes.length === 0) return;

    if (theme) {
      root.style.setProperty("--ss-accent", theme.accent);
      root.style.setProperty("--ss-bg", theme.background);
      root.style.setProperty("--ss-ink", theme.ink);
      root.style.setProperty("--ss-muted", theme.muted);
    }

    var segments = buildSegments(scenes, connectors);
    var layerNodes = Array.prototype.slice.call(
      root.querySelectorAll("[data-scroll-scrub-layer]")
    );
    var bandNodes = Array.prototype.slice.call(
      root.querySelectorAll("[data-scroll-scrub-band]")
    );

    if (
      layerNodes.length !== segments.length ||
      bandNodes.length !== segments.length
    ) {
      console.error("ScrollScrub segment markup is out of sync");
      return;
    }

    var reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    var coarsePointer = window.matchMedia(
      "(hover: none) and (pointer: coarse)"
    ).matches;
    var smallViewport = window.matchMedia("(max-width: 860px)");
    function isMobile() {
      return coarsePointer || smallViewport.matches;
    }
    function sourceFor(segment) {
      return segment.mobileClip && window.matchMedia(PORTRAIT_CLIPS_MQ).matches
        ? segment.mobileClip
        : segment.clip;
    }

    var runtime = segments.map(function (segment, index) {
      var r = {};
      for (var k in segment) {
        if (Object.prototype.hasOwnProperty.call(segment, k)) r[k] = segment[k];
      }
      r.band = bandNodes[index];
      r.layer = layerNodes[index];
      r.current = 0;
      r.end = 0;
      r.start = 0;
      r.target = 0;
      r.visible = index === 0;
      r.loading = false;
      r.ready = false;
      r.failed = false;
      return r;
    });

    var active = -1;
    var destroyed = false;
    var dirty = true;
    var frame = 0;
    var rootTop = 0;
    var total = 1;
    var viewportHeight = window.innerHeight;
    var layoutWidth = window.innerWidth;
    var userReady = false;

    function unloadClip(segment) {
      if (segment.abort) segment.abort.abort();
      if (segment.video) segment.video.remove();
      if (segment.objectUrl) URL.revokeObjectURL(segment.objectUrl);
      delete segment.abort;
      delete segment.video;
      delete segment.objectUrl;
      delete segment.loadedSource;
      segment.loading = false;
      segment.ready = false;
      segment.failed = false;
      segment.current = segment.target;
      delete segment.layer.dataset.videoPainted;
      delete segment.layer.dataset.videoFailed;
    }

    function layout() {
      var pageY = window.scrollY || window.pageYOffset;
      rootTop = root.getBoundingClientRect().top + pageY;
      viewportHeight = window.innerHeight;
      layoutWidth = window.innerWidth;

      runtime.forEach(function (segment) {
        if (segment.loadedSource && segment.loadedSource !== sourceFor(segment)) {
          unloadClip(segment);
        }
        var rect = segment.band.getBoundingClientRect();
        segment.start = rect.top + pageY - rootTop;
        segment.end = segment.start + rect.height;
      });

      var lastEnd = runtime.length ? runtime[runtime.length - 1].end : viewportHeight;
      total = Math.max(lastEnd, viewportHeight);
      dirty = true;
    }

    function primeVideo(video) {
      if (!video || !isMobile()) return Promise.resolve();
      return video
        .play()
        .then(function () {
          video.pause();
        })
        .catch(function () {
          /* keep poster; a later gesture/seek can retry naturally */
        });
    }

    function loadClip(segment) {
      var source = sourceFor(segment);
      if (
        reduceMotion ||
        destroyed ||
        segment.loading ||
        segment.ready ||
        segment.failed ||
        !source
      ) {
        return;
      }

      segment.loading = true;
      segment.loadedSource = source;
      segment.abort = new AbortController();
      var request = segment.abort;

      var pre = window.__heroPreload && window.__heroPreload[source];
      (pre
        ? pre.catch(function () {
            return fetch(source, { signal: request.signal }).then(function (response) {
              if (!response.ok) throw new Error("Clip failed: " + response.status);
              return response.blob();
            });
          })
        : fetch(source, { signal: request.signal }).then(function (response) {
            if (!response.ok) throw new Error("Clip failed: " + response.status);
            return response.blob();
          })
      )
        .then(function (blob) {
          if (destroyed || request.signal.aborted || segment.loadedSource !== source) {
            return;
          }

          var objectUrl = URL.createObjectURL(blob);
          var video = document.createElement("video");
          video.className = "scroll-scrub__video";
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.setAttribute("muted", "");
          video.setAttribute("playsinline", "");
          video.src = objectUrl;

          video.addEventListener("loadedmetadata", function onMeta() {
            video.removeEventListener("loadedmetadata", onMeta);
            if (segment.video !== video || segment.loadedSource !== source) return;
            segment.ready = true;
            segment.loading = false;
            dirty = true;
          });
          video.addEventListener("loadeddata", function onData() {
            video.removeEventListener("loadeddata", onData);
            if (userReady && segment.video === video && segment.loadedSource === source) {
              primeVideo(video);
            }
          });
          video.addEventListener("error", function onError() {
            video.removeEventListener("error", onError);
            if (segment.video !== video) return;
            video.remove();
            URL.revokeObjectURL(objectUrl);
            delete segment.video;
            delete segment.objectUrl;
            segment.failed = true;
            segment.loading = false;
            segment.ready = false;
            delete segment.layer.dataset.videoPainted;
            segment.layer.dataset.videoFailed = "true";
          });
          video.addEventListener("seeked", function onSeeked() {
            video.removeEventListener("seeked", onSeeked);
            if (segment.video === video && segment.loadedSource === source) {
              segment.layer.dataset.videoPainted = "true";
            }
          });

          segment.layer.appendChild(video);
          segment.objectUrl = objectUrl;
          segment.video = video;
        })
        .catch(function (error) {
          if (
            request.signal.aborted ||
            (error && error.name === "AbortError") ||
            segment.loadedSource !== source
          ) {
            return;
          }
          segment.layer.dataset.videoFailed = "true";
          segment.failed = true;
          segment.loading = false;
        });
    }

    function readScroll() {
      var pageY = window.scrollY || window.pageYOffset;
      var y = clamp(pageY - rootTop, 0, total);
      var crossfade = 0.1 * viewportHeight;
      var currentIndex = 0;

      var pinNow = 0;
      runtime.forEach(function (segment, index) {
        if (y >= segment.start) currentIndex = index;

        var length = Math.max(segment.end - segment.start, 1);
        var local = clamp((y - segment.start) / length);
        /* Pinned scenes: the stage is sticky for (length - viewport) of
           scroll, so the film is scrubbed across that stretch only — and
           only up to scene.videoSpan of it, leaving the rest for callouts
           and a hold. */
        if (segment.scene && segment.scene.pinned) {
          var pinLen = Math.max(length - viewportHeight, 1);
          var pin = clamp((y - segment.start) / pinLen);
          local = clamp(pin / (segment.scene.videoSpan || 1));
          pinNow = pin;
        }
        segment.target = segment.linger ? lingerEase(local, segment.linger) : local;

        var outside = 0;
        if (y < segment.start) outside = segment.start - y;
        if (y > segment.end) outside = y - segment.end;
        var opacity = smoothstep(1 - outside / Math.max(crossfade, 1));
        if (reduceMotion) opacity = outside === 0 ? 1 : 0;

        segment.visible = opacity > 0.001;
        segment.layer.style.opacity = String(opacity);
        segment.layer.style.zIndex = index === currentIndex ? "2" : "1";

        if (
          y > segment.start - 1.5 * viewportHeight &&
          y < segment.end + 1.5 * viewportHeight
        ) {
          loadClip(segment);
        }
      });

      var current = runtime[currentIndex];
      var currentLength = Math.max(current.end - current.start, 1);
      var currentProgress = clamp((y - current.start) / currentLength);
      var nextActive =
        current.kind === "connector" && currentProgress >= 0.5
          ? current.nextSectionIndex
          : current.sectionIndex;

      if (nextActive !== active) {
        active = nextActive;
        root.dataset.activeSection = String(active);
      }

      root.style.setProperty("--ss-progress", String(clamp(y / total)));
      root.style.setProperty("--ss-pin", String(pinNow));
      root.dispatchEvent(new CustomEvent("scrub:pin", { detail: pinNow }));
    }

    function updateVideos() {
      runtime.forEach(function (segment) {
        var video = segment.video;
        if (!video || !segment.ready || video.seeking) return;
        if (!segment.visible && Math.abs(segment.current - segment.target) < 0.002) {
          return;
        }

        segment.current += (segment.target - segment.current) * 0.2;
        var targetTime = clamp(segment.current, 0, 0.999) * (video.duration || 1);
        var epsilon = isMobile() ? 0.02 : 0.008;
        if (Math.abs(video.currentTime - targetTime) > epsilon) {
          try {
            video.currentTime = targetTime;
          } catch (e) {
            /* keep the last painted frame while the browser catches up */
          }
        }
      });
    }

    function tick() {
      if (destroyed) return;
      if (dirty) {
        dirty = false;
        readScroll();
      }
      updateVideos();
      frame = window.requestAnimationFrame(tick);
    }

    function onScroll() {
      dirty = true;
    }
    function onResize() {
      if (coarsePointer && window.innerWidth === layoutWidth) return;
      layout();
    }
    function onFirstGesture() {
      if (userReady) return;
      userReady = true;
      runtime.forEach(function (segment) {
        primeVideo(segment.video);
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", layout);
    window.addEventListener("pointerdown", onFirstGesture, { once: true, passive: true });
    window.addEventListener("touchstart", onFirstGesture, { once: true, passive: true });

    layout();
    frame = window.requestAnimationFrame(tick);
  }

  window.ScrollScrub = { init: initScrollScrub };
})();

/* ============================================================
   Page bootstrap: hero scene data + reveal-on-scroll for the
   rest of the page (stats, pillars, work, finale).
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var heroRoot = document.querySelector("[data-scroll-scrub-root]");
    if (heroRoot) {
      var clip = heroRoot.getAttribute("data-clip");
      window.ScrollScrub.init(
        heroRoot,
        [
          {
            id: "intro",
            poster: "",
            clip: clip,
            mobileClip: heroRoot.getAttribute("data-clip-mobile") || undefined,
            title: "Diego Henrique Luciano",
            kicker: "Design Engineer",
            tags: ["Design Systems", "AI Prototyping", "UI Engineering"],
            align: "left",
            scroll: 2.4,
            linger: 0,
            pinned: true,
            videoSpan: 0.66,
            objectPosition: "50% 32%",
            mobileObjectPosition: "50% 28%",
          },
        ],
        [],
        {
          accent: "#28f2a4",
          background: "#05070a",
          ink: "#f4efe1",
          muted: "rgba(244, 239, 225, 0.68)",
        }
      );
    }

    var revealTargets = document.querySelectorAll("[data-reveal]");
    if ("IntersectionObserver" in window && revealTargets.length) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
      );
      revealTargets.forEach(function (el) {
        io.observe(el);
      });
    } else {
      revealTargets.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }

    var yearEl = document.querySelector("[data-year]");
    if (yearEl) yearEl.textContent = "2026";

    initShotScroll();
  });

  /* ----------------------------------------------------------
     Live-screenshot panels (.hg-shot): each panel is a masked
     "browser viewport" holding a full, tall page screenshot that
     auto-scrolls down and back up in a continuous loop (CSS
     animation), pausing only while the panel is hovered. This
     runs by default rather than being hover-triggered because
     these panels sit inside the horizontally-pinned gallery: as
     the strip translates under a stationary cursor during the
     scroll-scrub, :hover flickers on/off across panels, and a
     one-shot hover-triggered transition would restart mid-flight
     and visibly fight with the horizontal scroll. A looping
     animation that just pauses/resumes has no such conflict.
     Speed scales with how much there is to scroll, so a short
     page and a long one both feel natural. Reduced-motion and
     the loop itself are handled in CSS; this just supplies the
     per-image distance/duration custom properties.
     ---------------------------------------------------------- */
  function initShotScroll() {
    var shots = document.querySelectorAll("[data-hg-shot]");
    if (!shots.length) return;

    var prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // On a touchscreen a vertical drag on a screenshot would fight page scroll
    // (and the card rail's swipe) — there the auto-pan is all you get.
    var coarseTouch =
      window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

    shots.forEach(function (shot) {
      var frame = shot.querySelector(".hg-shot__frame");
      var img = frame ? frame.querySelector("img") : null;
      if (!frame || !img) return;

      // Most-negative translateY (px) the image can take before its bottom
      // edge lifts off the frame bottom. Kept in sync by measure(); also the
      // clamp bound for the drag-to-scrub handler below.
      var minOffset = 0;

      function measure() {
        // Rendered image height comes from its intrinsic ratio × the frame
        // *width* — width never changes when we resize the shot, so a
        // re-measure can't feed back into a resize loop.
        var frameWidth = frame.clientWidth;
        if (frameWidth <= 0) return; // not laid out yet — a later observer call catches it
        var ratio =
          img.naturalWidth && img.naturalHeight
            ? img.naturalHeight / img.naturalWidth
            : 0;
        var renderedHeight = ratio
          ? Math.round(frameWidth * ratio)
          : Math.round(img.getBoundingClientRect().height);
        if (!renderedHeight) return;

        // Frame height at the CSS baseline (no inline override applied).
        var override = shot.style.height;
        shot.style.height = "";
        var baseFrameH = frame.clientHeight;
        if (baseFrameH <= 0) {
          shot.style.height = override;
          return;
        }
        var overflow = renderedHeight - baseFrameH;

        if (overflow > 8) {
          // Creative is taller than the frame → keep the fixed browser frame
          // and let it scroll/drag. The keyframe does `-100% + frame-h`, so
          // -100% self-tracks the image height and travel never overshoots.
          shot.classList.remove("is-fitted");
          shot.style.setProperty("--hg-shot-frame-h", baseFrameH + "px");
          // Full loop = down + hold + up + hold, ~38% of the duration each
          // way; aim for a readable ~90px/s either direction.
          var duration = Math.min(26, Math.max(8, overflow / 84));
          shot.style.setProperty("--hg-shot-duration", duration.toFixed(2) + "s");
          minOffset = -overflow;
          shot.classList.toggle("is-draggable", !prefersReducedMotion && !coarseTouch);
        } else {
          // Creative is shorter than the frame → collapse the container onto
          // it so there's no black letterbox inside the browser chrome.
          var shotBaseH = shot.getBoundingClientRect().height;
          shot.style.height =
            Math.round(shotBaseH - (baseFrameH - renderedHeight)) + "px";
          shot.style.setProperty("--hg-shot-frame-h", renderedHeight + "px");
          minOffset = 0;
          shot.classList.remove("is-draggable");
          shot.classList.add("is-fitted");
        }
      }

      if (img.complete && img.naturalWidth) {
        measure();
      } else {
        img.addEventListener("load", measure);
      }
      window.addEventListener("resize", measure);

      // The panel is resized by the pinned horizontal-gallery layout, by
      // font swaps and by Lenis settling well after load — re-measure
      // whenever the frame's box actually changes.
      if ("ResizeObserver" in window) {
        new ResizeObserver(measure).observe(frame);
      }
      if (typeof ScrollTrigger !== "undefined") {
        ScrollTrigger.addEventListener("refresh", measure);
      }
      window.addEventListener("load", measure);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measure);
      }

      if (!prefersReducedMotion && !coarseTouch) wireDrag();

      /* Grab-and-position. On pointerdown the viewer takes the image over
         from the auto-pan — seamlessly, from wherever it currently sits —
         drags it vertically within its travel, and ~2.6s after release it
         eases back to the top and the CSS loop resumes. Panels with nothing
         to scroll never reach here (.is-draggable stays off). Keyboard
         users lose nothing: the auto-pan still reveals the whole shot. */
      function wireDrag() {
        var dragging = false;
        var pointerStartY = 0;
        var offsetStart = 0;
        var offset = 0;
        var holdTimer = 0;
        var returnId = 0;

        function liveTranslateY() {
          var t = getComputedStyle(img).transform;
          if (!t || t === "none") return 0;
          var m = t.match(/matrix\(([^)]+)\)/);
          if (m) return parseFloat(m[1].split(",")[5]) || 0;
          var m3 = t.match(/matrix3d\(([^)]+)\)/);
          if (m3) return parseFloat(m3[1].split(",")[13]) || 0;
          return 0;
        }

        function clampRubber(v) {
          if (v > 0) return v * 0.25; // resist past the top
          if (v < minOffset) return minOffset + (v - minOffset) * 0.25;
          return v;
        }

        function apply() {
          img.style.transform = "translateY(" + offset + "px)";
        }

        function onDown(e) {
          if (!shot.classList.contains("is-draggable")) return;
          if (e.button != null && e.button > 0) return; // primary button only
          // Read the live auto-pan position BEFORE any class change — the
          // .is-grabbed / .is-returning rules zero the animation, which would
          // collapse the computed transform and make the grab jump to the top.
          offsetStart = liveTranslateY();
          dragging = true;
          returnId++; // invalidate any pending return-home cleanup
          clearTimeout(holdTimer);
          pointerStartY = e.clientY;
          offset = offsetStart;
          shot.classList.remove("is-returning");
          shot.classList.add("is-grabbed");
          img.style.animation = "none";
          apply();
          try {
            frame.setPointerCapture(e.pointerId);
          } catch (err) {}
          e.preventDefault();
        }

        function onMove(e) {
          if (!dragging) return;
          offset = clampRubber(offsetStart + (e.clientY - pointerStartY));
          apply();
          e.preventDefault();
        }

        function onUp(e) {
          if (!dragging) return;
          dragging = false;
          shot.classList.remove("is-grabbed");
          if (e && e.pointerId != null) {
            try {
              frame.releasePointerCapture(e.pointerId);
            } catch (err) {}
          }
          // Ease off any rubber-band overshoot straight away.
          var settled = Math.max(minOffset, Math.min(0, offset));
          if (settled !== offset) {
            offset = settled;
            shot.classList.add("is-returning");
            apply();
          }
          holdTimer = setTimeout(returnHome, 2600);
        }

        function returnHome() {
          var id = ++returnId;
          if (offset === 0) {
            shot.classList.remove("is-returning");
            img.style.transform = "";
            img.style.animation = "";
            return;
          }
          shot.classList.add("is-returning");
          void img.offsetWidth; // commit current offset before transitioning
          offset = 0;
          apply();
          setTimeout(function () {
            if (id !== returnId || dragging) return;
            shot.classList.remove("is-returning");
            img.style.transform = "";
            img.style.animation = ""; // CSS loop resumes from the top
          }, 620);
        }

        frame.addEventListener("pointerdown", onDown, { passive: false });
        frame.addEventListener("pointermove", onMove, { passive: false });
        frame.addEventListener("pointerup", onUp);
        frame.addEventListener("pointercancel", onUp);
      }
    });
  }
})();

/* ============================================================
   Work section — horizontal scroll-scrub galleries, one per
   project, powered by GSAP + ScrollTrigger. Each project's
   section pins in place while its strip (title → description
   → images) translates horizontally, driven by vertical scroll.
   When one project's strip finishes, normal scroll flow carries
   straight into the next project's own pinned gallery.

   Progressive enhancement: until GSAP loads and this runs, the
   .horiz-gallery-wrapper elements are plain horizontally
   scrollable/swipeable rows (see the base CSS), so the content
   stays fully usable even if the CDN script is blocked.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
      return; // CDN didn't load — fall back to the plain swipeable strips.
    }

    if (typeof gsap.matchMedia !== "function") {
      return; // GSAP too old for matchMedia — keep the plain swipeable strips.
    }

    gsap.registerPlugin(ScrollTrigger);

    var wrappers = gsap.utils.toArray("[data-hg]");
    if (!wrappers.length) return;

    // Pinned horizontal scroll only on pointer-precise, wide, motion-OK
    // viewports. Anywhere else (phones, reduced-motion) the matchMedia
    // cleanup runs and the strips revert to native horizontal swipe.
    var mm = gsap.matchMedia();

    mm.add(
      "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
      function () {
        document.body.classList.add("hg-enhanced");
        // tells fx.js the scanner sections are pinned + scrubbed here, so it
        // reads --work-reveal / --more-work-reveal back instead of driving them
        document.body.classList.add("scanner-pinned");
        var measurers = [];

        wrappers.forEach(function (sec) {
          var strip = sec.querySelector("[data-hg-strip]");
          if (!strip) return;
          var progressBar = sec.querySelector(".hg-progress span");
          var gridPanel = sec.querySelector("[data-mgrid]");
          // #more-work carries the emerald scanner wipe. Give its pin an
          // extra "wipe zone" of scroll at the very start: the strip holds
          // still while --more-work-reveal scrubs 0→1, so the wipe gets a
          // fixed scroll budget (a real brake) before the cards move —
          // fx.js reads --more-work-reveal back rather than driving it
          // (body.scanner-pinned). Everything else is unchanged.
          var isMoreWork = sec.id === "more-work";
          function wipeZone() {
            return isMoreWork ? Math.round(window.innerHeight * 0.6) : 0;
          }
          function setMWReveal(p) {
            sec.style.setProperty("--more-work-reveal", p.toFixed(4));
            var g = Math.max(0, Math.min(1, Math.min(p * 7, (1 - p) * 7)));
            sec.style.setProperty("--more-work-glow", g.toFixed(4));
          }

          // Travel = how far the strip must move to reveal its last panel.
          // Pin duration is tied to that same distance so the horizontal
          // scrub tracks vertical scroll 1:1 with no dead zone at the end.
          var travel = 0;
          function measure() {
            travel = Math.max(strip.scrollWidth - window.innerWidth, 0);
          }
          measure();
          if (travel <= 0 && !isMoreWork) return; // strip fits — nothing to scrub.

          ScrollTrigger.addEventListener("refreshInit", measure);
          measurers.push(measure);

          var hTween = gsap.to(isMoreWork ? { v: 0 } : strip, {
            x: isMoreWork ? undefined : function () {
              return -travel;
            },
            v: isMoreWork ? 1 : undefined,
            ease: "none",
            scrollTrigger: {
              trigger: sec,
              pin: true,
              scrub: 0.6,
              start: "top top",
              end: function () {
                return "+=" + (travel + wipeZone());
              },
              // Lower than the stats/pillars pins above so their
              // spacers are measured first on every refresh.
              refreshPriority: 1,
              invalidateOnRefresh: true,
              onUpdate: function (self) {
                var p = self.progress;
                if (isMoreWork) {
                  var total = travel + wipeZone();
                  var wf = total > 0 ? wipeZone() / total : 0;
                  var wipe = wf > 0 ? Math.min(1, p / wf) : 1;
                  var stripP = wf < 1 ? Math.max(0, (p - wf) / (1 - wf)) : 0;
                  gsap.set(strip, { x: -stripP * travel });
                  setMWReveal(wipe);
                }
                if (progressBar) {
                  progressBar.style.transform = "scaleX(" + p + ")";
                }
              },
              onLeave: isMoreWork
                ? function () {
                    setMWReveal(1);
                  }
                : undefined,
              onLeaveBack: isMoreWork
                ? function () {
                    setMWReveal(0);
                  }
                : undefined,
            },
          });

          // Dex "brand in use" grid panel, if this strip has one: the
          // tiles sit inside the horizontally-translating strip, so a
          // normal (vertical) ScrollTrigger would fire the instant the
          // pin starts — containerAnimation re-bases start/end against
          // the strip's horizontal position instead, so the stagger
          // plays only once the panel actually scrolls into view.
          if (gridPanel) {
            var tiles = gridPanel.querySelectorAll(".mgrid__item");
            gsap.set(tiles, { autoAlpha: 0, y: 30 });
            ScrollTrigger.create({
              trigger: gridPanel,
              containerAnimation: hTween,
              start: "left 85%",
              onEnter: function () {
                gsap.to(tiles, {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.6,
                  stagger: 0.07,
                  ease: "power2.out",
                  overwrite: true,
                });
              },
            });
          }
        });

        ScrollTrigger.refresh();

        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function () {
            ScrollTrigger.refresh();
          });
        }
        window.addEventListener("load", onLoadRefresh);

        return function cleanup() {
          // matchMedia reverts tweens/pins/inline styles automatically;
          // just drop the enhancement flag and our own listeners.
          window.removeEventListener("load", onLoadRefresh);
          measurers.forEach(function (fn) {
            ScrollTrigger.removeEventListener("refreshInit", fn);
          });
          document.body.classList.remove("hg-enhanced");
          document.body.classList.remove("scanner-pinned");
        };
      }
    );

    function onLoadRefresh() {
      ScrollTrigger.refresh();
    }
  });
})();

/* ============================================================
   Scanner brake — #work has no gallery of its own, so it gets a
   short dedicated pin: the section holds at the top while the
   emerald wipe scrubs 0→1 over ~0.85 viewport of scroll, so it
   can't blink past at scroll speed. script.js owns --work-reveal /
   --scan-glow while pinned; fx.js reads them back. Mobile /
   reduced-motion: no pin, fx.js drives the wipe off the live rect.
   ============================================================ */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    if (typeof gsap.matchMedia !== "function") return;
    var workEl = document.getElementById("work");
    if (!workEl) return;
    gsap.registerPlugin(ScrollTrigger);

    function setReveal(p) {
      workEl.style.setProperty("--work-reveal", p.toFixed(4));
      var g = Math.max(0, Math.min(1, Math.min(p * 7, (1 - p) * 7)));
      workEl.style.setProperty("--scan-glow", g.toFixed(4));
    }

    gsap.matchMedia().add(
      "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
      function () {
        var st = ScrollTrigger.create({
          trigger: workEl,
          start: "top top",
          end: function () {
            return "+=" + Math.round(window.innerHeight * 0.6);
          },
          pin: true,
          scrub: 0.7,
          refreshPriority: 1,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            setReveal(self.progress);
          },
          onLeave: function () {
            setReveal(1);
          },
          onLeaveBack: function () {
            setReveal(0);
          },
        });
        return function cleanup() {
          st.kill();
        };
      }
    );
  });
})();

/* ============================================================
   Stats section — scroll-locked (pinned) reveal.
   Wide + motion-OK viewports: the section pins while the six
   figures scrub up into place and their numbers count from
   zero, staggered left-to-right, top-to-bottom. Once settled,
   each figure keeps a slow independent vertical float so the
   grid feels weightless rather than static.
   Narrow viewports: no pin — the numbers just count up once
   when the section scrolls into view, then float.
   Reduced motion / no GSAP: numbers shown at final value.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var section = document.querySelector("[data-stats]");
    if (!section) return;

    var items = Array.prototype.slice.call(section.querySelectorAll("[data-stat]"));
    if (!items.length) return;

    // "150+" -> {target:150, suffix:"+"} ; "200K+" -> {target:200, suffix:"K+"}
    function parse(str) {
      var m = String(str).trim().match(/^([\d.,]+)\s*(.*)$/);
      if (!m) return null;
      return { target: parseFloat(m[1].replace(/,/g, "")), suffix: m[2] || "" };
    }

    var counters = items.map(function (el) {
      var valEl = el.querySelector("[data-stat-value]");
      return { el: el, valEl: valEl, spec: valEl ? parse(valEl.textContent) : null };
    });

    function render(c, value) {
      if (!c.spec) return;
      c.valEl.textContent =
        Math.round(value).toLocaleString("en-US") + c.spec.suffix;
    }
    function showFinal() {
      counters.forEach(function (c) {
        render(c, c.spec ? c.spec.target : 0);
      });
    }

    var noGsap =
      typeof gsap === "undefined" ||
      typeof ScrollTrigger === "undefined" ||
      typeof gsap.matchMedia !== "function";
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (noGsap || reduce) {
      showFinal();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    var rule = section.querySelector(".stats__rule i");

    var mm = gsap.matchMedia();

    // --- Wide screens: pinned scroll-lock, scrubbed staggered entrance ---
    mm.add("(min-width: 768px)", function () {
      section.classList.add("is-locked");
      gsap.set(items, { autoAlpha: 0, yPercent: 38 });
      if (rule) gsap.set(rule, { scaleX: 0 });

      var tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=110%",
          pin: true,
          scrub: 0.5,
          anticipatePin: 1,
          refreshPriority: 3, // topmost pin on the page — refresh first
          invalidateOnRefresh: true,
        },
      });

      var step = 0.7; // stagger spacing between figures on the timeline
      counters.forEach(function (c, i) {
        var at = i * step;
        tl.to(
          c.el,
          { autoAlpha: 1, yPercent: 0, duration: 1.1, ease: "expo.out" },
          at
        );
        if (c.spec) {
          var o = { v: 0 };
          tl.to(
            o,
            {
              v: c.spec.target,
              duration: 1.1,
              ease: "power1.out",
              onUpdate: function () {
                render(c, o.v);
              },
            },
            at
          );
        }
      });

      // Hairline drawing itself along the base of the grid, in step with
      // the whole locked span.
      if (rule) {
        tl.to(rule, { scaleX: 1, duration: tl.duration(), ease: "power2.inOut" }, 0);
      }

      tl.to({}, { duration: 1.3 }); // settle-and-read hold before release

      return function () {
        section.classList.remove("is-locked");
        gsap.set(items, { clearProps: "opacity,visibility,transform" });
        if (rule) gsap.set(rule, { clearProps: "transform" });
        showFinal();
      };
    });

    // --- Narrow screens: count up + draw the rule, once on enter ---
    mm.add("(max-width: 767px)", function () {
      if (rule) gsap.set(rule, { scaleX: 0 });
      var st = ScrollTrigger.create({
        trigger: section,
        start: "top 78%",
        once: true,
        onEnter: function () {
          counters.forEach(function (c, i) {
            if (!c.spec) return;
            var o = { v: 0 };
            gsap.to(o, {
              v: c.spec.target,
              duration: 1.4,
              delay: i * 0.09,
              ease: "power1.out",
              onUpdate: function () {
                render(c, o.v);
              },
            });
          });
          if (rule) {
            gsap.to(rule, { scaleX: 1, duration: 1.6, ease: "power2.inOut" });
          }
        },
      });
      return function () {
        st.kill();
      };
    });
  });
})();

/* ============================================================
   Pillars section — scroll-locked, one pillar at a time.
   Wide + motion-OK: #expertise pins while each .pillar__inner
   rises and fades in, one after the next, driven by scroll.
   The three outlined cells stay put the whole time.
   Narrow / reduced-motion / no GSAP: pillars just show, or a
   light on-enter stagger.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var section = document.querySelector("[data-pillars]");
    if (!section) return;

    var inners = Array.prototype.slice
      .call(section.querySelectorAll("[data-pillar]"))
      .map(function (p) {
        return p.querySelector(".pillar__inner") || p;
      });
    if (!inners.length) return;

    var noGsap =
      typeof gsap === "undefined" ||
      typeof ScrollTrigger === "undefined" ||
      typeof gsap.matchMedia !== "function";
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (noGsap || reduce) return; // pillars are visible by default

    gsap.registerPlugin(ScrollTrigger);
    var mm = gsap.matchMedia();

    mm.add("(min-width: 861px)", function () {
      section.classList.add("is-locked");
      gsap.set(inners, { autoAlpha: 0, y: 64 });

      var tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=115%",
          pin: true,
          scrub: 0.5,
          anticipatePin: 1,
          refreshPriority: 2, // between the stats pin (3) and the galleries (1)
          invalidateOnRefresh: true,
        },
      });

      inners.forEach(function (el, i) {
        tl.to(
          el,
          { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out" },
          i * 1.15
        );
      });
      tl.to({}, { duration: 1.2 }); // hold on the full trio before release

      return function () {
        section.classList.remove("is-locked");
        gsap.set(inners, { clearProps: "opacity,visibility,transform" });
      };
    });

    // 768–860px: single column, no pin — stagger in on enter.
    mm.add("(min-width: 768px) and (max-width: 860px)", function () {
      gsap.set(inners, { autoAlpha: 0, y: 40 });
      var st = ScrollTrigger.create({
        trigger: section,
        start: "top 75%",
        once: true,
        onEnter: function () {
          gsap.to(inners, {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.15,
            ease: "power2.out",
          });
        },
      });
      return function () {
        st.kill();
        gsap.set(inners, { clearProps: "opacity,visibility,transform" });
      };
    });
  });
})();

/* ============================================================
   Dex "brand in use" grid lightbox — any tile opens the full render
   (GSAP fade + scale, backdrop / Esc / close-button to dismiss, scroll
   locked while open). The grid's own scroll-in stagger is wired above,
   in the galleries block, via containerAnimation (the tiles live inside
   the horizontally-translating strip, not the normal page flow).
   ============================================================ */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var lb = document.querySelector("[data-lb]");
    if (!lb || !document.querySelector("[data-mgrid]")) return;

    var lbImg = lb.querySelector(".lightbox__img");
    var lbCap = lb.querySelector(".lightbox__cap");
    var lbFig = lb.querySelector(".lightbox__figure");
    var closeBtn = lb.querySelector("[data-lb-close]");
    var hasGsap = typeof gsap !== "undefined";
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var lastFocus = null;

    function openLb(src, cap) {
      lastFocus = document.activeElement;
      lbImg.src = src;
      lbImg.alt = cap || "";
      lbCap.textContent = cap || "";
      lb.hidden = false;
      document.body.classList.add("pl-lock");
      if (window.__lenis) window.__lenis.stop();
      closeBtn.focus();
      if (hasGsap && !reduce) {
        gsap.fromTo(lb, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: "power1.out" });
        gsap.fromTo(
          lbFig,
          { scale: 0.92, y: 18, autoAlpha: 0 },
          { scale: 1, y: 0, autoAlpha: 1, duration: 0.42, ease: "power3.out" }
        );
      }
    }

    function closeLb() {
      var done = function () {
        lb.hidden = true;
        lbImg.src = "";
        document.body.classList.remove("pl-lock");
        if (window.__lenis) window.__lenis.start();
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      };
      if (hasGsap && !reduce) {
        gsap.to(lb, { autoAlpha: 0, duration: 0.2, ease: "power1.in", onComplete: done });
      } else {
        done();
      }
    }

    // delegated so it covers every .mgrid on the page (Dex, Volp, …)
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".mgrid__btn");
      if (!btn || !btn.closest("[data-mgrid]")) return;
      openLb(btn.getAttribute("data-lb-src"), btn.getAttribute("data-lb-cap"));
    });
    closeBtn.addEventListener("click", closeLb);
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLb();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !lb.hidden) closeLb();
    });
  });
})();

/* ============================================================
   Dex "logo in motion" tile: the clip loops while it's on screen
   and pauses when it isn't. autoplay+loop on the element covers
   most browsers; this also (re)starts playback after visibility
   changes and honours reduced-motion.
   ============================================================ */
(function () {
  "use strict";
  var vid = document.querySelector(".mgrid__video");
  if (!vid) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    vid.removeAttribute("autoplay");
    vid.removeAttribute("loop");
    try {
      vid.pause();
    } catch (e) {}
    return;
  }

  var tryPlay = function () {
    var p = vid.play();
    if (p && p.catch) p.catch(function () {});
  };

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) tryPlay();
          else vid.pause();
        });
      },
      { threshold: 0.15 }
    ).observe(vid);
  } else {
    tryPlay();
  }
  // some engines drop muted-autoplay until a user gesture / first paint
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) tryPlay();
  });
})();

/* One final refresh once fonts and all assets have settled, after
   every block above has registered its ScrollTriggers — so the
   pin spacers are measured in top-to-bottom priority order and
   sections below the pins land in the right place. */
(function () {
  "use strict";
  if (typeof ScrollTrigger === "undefined") return;
  function refresh() {
    ScrollTrigger.refresh();
  }
  window.addEventListener("load", refresh);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(refresh);
  }
})();

/* ============================================================
   Hero reveal — anatomy callouts + looping "alive" clip.
   The callouts are placed from the film's own object-fit:cover
   math (so they stay glued to the exploded head at any viewport),
   and the loop clip takes over once the scrubbed film has fully
   opened the head, so the mechanisms keep moving.
   Driven by the "scrub:pin" event the scroll-scrub engine fires.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-scroll-scrub-root]");
    if (!root) return;
    var stage = root.querySelector(".scroll-scrub__stage");
    var overlay = root.querySelector("[data-hero-callouts]");
    var alive = root.querySelector("[data-hero-alive]");
    if (!stage || !overlay) return;

    var FRAME_W = 1920; // the film's intrinsic frame
    var FRAME_H = 1080;
    var mobileMQ = window.matchMedia("(max-width: 860px)");

    var years = root.querySelector("[data-years]");
    if (years) years.textContent = new Date().getFullYear() - 2001 + " yrs";

    function place() {
      var rect = stage.getBoundingClientRect();
      var W = rect.width;
      var H = rect.height;
      var scale = Math.max(W / FRAME_W, H / FRAME_H);
      var rw = FRAME_W * scale;
      var rh = FRAME_H * scale;

      var pos = (alive ? getComputedStyle(alive).objectPosition : "50% 32%") || "50% 32%";
      var parts = pos.split(/\s+/);
      var px = parseFloat(parts[0]) / 100;
      var py = parseFloat(parts.length > 1 ? parts[1] : parts[0]) / 100;
      if (isNaN(px)) px = 0.5;
      if (isNaN(py)) py = 0.5;
      var ox = (W - rw) * px;
      var oy = (H - rh) * py;

      var stacked = mobileMQ.matches;
      overlay.classList.toggle("is-stacked", stacked);

      Array.prototype.forEach.call(overlay.querySelectorAll("[data-hc]"), function (el) {
        if (stacked) {
          el.style.left = "";
          el.style.top = "";
          el.style.removeProperty("--len");
          return;
        }
        var ax = ox + parseFloat(el.getAttribute("data-ax")) * rw;
        var ay = oy + parseFloat(el.getAttribute("data-ay")) * rh;
        var lx = ox + parseFloat(el.getAttribute("data-lx")) * rw;
        el.style.left = ax + "px";
        el.style.top = ay + "px";
        el.style.setProperty("--len", Math.abs(lx - ax) + "px");
      });
    }

    var playing = false;

    // The loader already downloaded the loop clip; hand it to the <video>.
    if (alive && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var aliveUrl = (window.__heroSources && window.__heroSources.loop) || alive.getAttribute("data-src");
      var aliveBlob = window.__heroPreload && window.__heroPreload[aliveUrl];
      var useDirect = function () {
        alive.src = aliveUrl;
        alive.load();
      };
      if (aliveBlob) {
        aliveBlob
          .then(function (b) {
            alive.src = URL.createObjectURL(b);
            alive.load();
          })
          .catch(useDirect);
      } else {
        useDirect();
      }
    }

    root.addEventListener("scrub:pin", function (e) {
      if (!alive) return;
      var pin = e.detail || 0;
      var span = parseFloat(getComputedStyle(root).getPropertyValue("--ss-span")) || 0.66;

      var want = pin >= span - 0.02;
      if (want && !playing) {
        playing = true;
        var p = alive.play();
        if (p && p.catch) p.catch(function () { playing = false; });
      } else if (!want && playing) {
        playing = false;
        alive.pause();
        if (pin < span - 0.06) alive.currentTime = 0; // always re-enter on frame 0
      }
    });

    place();
    window.addEventListener("resize", place);
    window.addEventListener("load", place);
    if (mobileMQ.addEventListener) mobileMQ.addEventListener("change", place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  });
})();

/* ============================================================
   Mobile gallery rails. Below 768px the galleries aren't pinned: each one
   becomes [intro text] + a native horizontal snap rail of its cards, with a
   counter and prev/next arrows underneath (the ~78vw cards let the next one
   peek in, so it reads as swipeable). The rail is built from the existing
   panels at runtime and torn down again if the viewport grows past 768, so the
   desktop pinned film keeps working off the untouched markup.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-hg]"));
    if (!sections.length || !window.matchMedia) return;
    var mq = window.matchMedia("(max-width: 767px)");

    var CARD_SEL =
      ".hg-panel--shot, .hg-panel--image, .hg-panel--card, .hg-panel--more-cta, .mgrid__item";
    var CHEVRON_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18"></polyline></svg>';
    var CHEVRON_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>';

    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }

    function build(sec) {
      if (sec.__rail) return;
      var strip = sec.querySelector("[data-hg-strip]");
      if (!strip) return;
      var panels = Array.prototype.filter.call(strip.children, function (el) {
        return el.classList.contains("hg-panel");
      });
      var intro = null;
      panels.forEach(function (p) {
        if (!intro && (p.classList.contains("hg-panel--intro") || p.classList.contains("hg-panel--more-intro"))) {
          intro = p;
        }
      });
      var rest = panels.filter(function (p) {
        return p !== intro;
      });
      if (!rest.length) return;

      var rail = document.createElement("div");
      rail.className = "hg-rail";
      rail.setAttribute("data-hg-rail", "");
      rest.forEach(function (p) {
        rail.appendChild(p);
      });
      if (intro) intro.insertAdjacentElement("afterend", rail);
      else strip.insertBefore(rail, strip.firstChild);

      var nav = document.createElement("div");
      nav.className = "hg-rail-nav";
      nav.innerHTML =
        '<span class="hg-rail-nav__count" aria-hidden="true"><b data-cur>01</b> / <span data-total>01</span></span>' +
        '<span class="hg-rail-nav__btns">' +
        '<button type="button" class="hg-rail-nav__btn" data-dir="-1" aria-label="Previous">' + CHEVRON_L + "</button>" +
        '<button type="button" class="hg-rail-nav__btn" data-dir="1" aria-label="Next">' + CHEVRON_R + "</button>" +
        "</span>";
      rail.insertAdjacentElement("afterend", nav);

      var cards = Array.prototype.slice.call(rail.querySelectorAll(CARD_SEL));
      var cur = nav.querySelector("[data-cur]");
      var total = nav.querySelector("[data-total]");
      var prev = nav.querySelector('[data-dir="-1"]');
      var next = nav.querySelector('[data-dir="1"]');
      total.textContent = pad(cards.length);

      function padLeft() {
        return parseFloat(getComputedStyle(rail).paddingLeft) || 0;
      }
      function nearest() {
        var target = rail.scrollLeft + padLeft();
        var best = 0;
        var bestD = Infinity;
        cards.forEach(function (c, i) {
          var d = Math.abs(c.offsetLeft - target);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        return best;
      }
      function update() {
        var max = rail.scrollWidth - rail.clientWidth;
        cur.textContent = pad(nearest() + 1);
        prev.disabled = rail.scrollLeft <= 2;
        next.disabled = rail.scrollLeft >= max - 2;
      }
      function go(dir) {
        var i = Math.max(0, Math.min(cards.length - 1, nearest() + dir));
        rail.scrollTo({ left: Math.max(0, cards[i].offsetLeft - padLeft()), behavior: "smooth" });
      }
      function onNav(e) {
        var btn = e.target.closest ? e.target.closest("[data-dir]") : null;
        if (btn) go(parseInt(btn.getAttribute("data-dir"), 10));
      }
      var raf = 0;
      function onScroll() {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          update();
        });
      }

      nav.addEventListener("click", onNav);
      rail.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", update);
      update();

      sec.__rail = {
        rail: rail,
        nav: nav,
        cleanup: function () {
          rail.removeEventListener("scroll", onScroll);
          window.removeEventListener("resize", update);
        },
      };
    }

    function destroy(sec) {
      var st = sec.__rail;
      if (!st) return;
      var strip = st.rail.parentNode;
      Array.prototype.slice.call(st.rail.children).forEach(function (p) {
        strip.insertBefore(p, st.rail);
      });
      st.cleanup();
      st.rail.parentNode.removeChild(st.rail);
      st.nav.parentNode.removeChild(st.nav);
      delete sec.__rail;
    }

    function sync() {
      sections.forEach(mq.matches ? build : destroy);
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    }
    if (mq.addEventListener) mq.addEventListener("change", sync);
    else if (mq.addListener) mq.addListener(sync);
    sync();
  });
})();
