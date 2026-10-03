// Landing-page motion: scroll reveal, screenshot parallax and the top bar state.
// Loaded as a classic script in <head>. Everything is visible without it: the
// hidden "pre-reveal" state only exists once the `js` class is set below, and the
// CSS applies it only when the visitor has not asked for reduced motion.
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  var reduceQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  var reduced = reduceQuery !== null && reduceQuery.matches;

  function start() {
    initTopBar();
    if (reduced) return;
    initReveal();
    initParallax();
  }

  // Top bar gains a border and a stronger backdrop after the page scrolls.
  function initTopBar() {
    var bar = document.querySelector("[data-top]");
    if (bar === null) return;
    var ticking = false;
    function update() {
      ticking = false;
      bar.classList.toggle("is-scrolled", window.scrollY > 8);
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();
  }

  // Fade + rise as elements enter the viewport, staggered inside each group.
  function initReveal() {
    var items = Array.prototype.slice.call(
      document.querySelectorAll("[data-reveal]"),
    );
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) {
        item.classList.add("is-in");
      });
      return;
    }
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-stagger]"),
      function (group) {
        var index = 0;
        Array.prototype.forEach.call(group.children, function (child) {
          if (child.hasAttribute("data-reveal")) {
            child.style.setProperty("--i", String(index));
            index += 1;
          }
        });
      },
    );
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    items.forEach(function (item) {
      observer.observe(item);
    });

    // A fast scroll or an anchor jump can skip an element entirely, and the
    // observer never fires for something that was never on screen. Anything left
    // above the viewport is revealed here so it cannot stay invisible.
    var sweeping = false;
    function sweep() {
      sweeping = false;
      items.forEach(function (item) {
        if (
          !item.classList.contains("is-in") &&
          item.getBoundingClientRect().bottom < 0
        ) {
          item.classList.add("is-in");
          observer.unobserve(item);
        }
      });
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!sweeping) {
          sweeping = true;
          window.requestAnimationFrame(sweep);
        }
      },
      { passive: true },
    );
    window.requestAnimationFrame(sweep);
  }

  // Screenshots drift and settle as they cross the viewport (rAF-throttled and
  // only measured while on screen).
  function initParallax() {
    var frames = Array.prototype.slice.call(
      document.querySelectorAll("[data-parallax]"),
    );
    if (frames.length === 0 || !("IntersectionObserver" in window)) return;
    var visible = new Set();
    var ticking = false;

    function paint() {
      ticking = false;
      var viewport = window.innerHeight || 1;
      visible.forEach(function (frame) {
        var host = frame.parentElement;
        if (host === null) return;
        var rect = host.getBoundingClientRect();
        var progress = (rect.top + rect.height / 2 - viewport / 2) / viewport;
        progress = Math.max(-1, Math.min(1, progress));
        var depth = parseFloat(frame.getAttribute("data-parallax")) || 1;
        var shift = progress * 26 * depth;
        var scale = 1 - Math.min(Math.abs(progress), 1) * 0.04;
        frame.style.transform =
          "translate3d(0," + shift.toFixed(1) + "px,0) scale(" +
          scale.toFixed(4) + ")";
      });
    }
    function schedule() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(paint);
      }
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var frame = entry.target.firstElementChild;
          if (frame === null) return;
          if (entry.isIntersecting) visible.add(frame);
          else visible.delete(frame);
        });
        schedule();
      },
      { rootMargin: "20% 0px 20% 0px" },
    );
    frames.forEach(function (frame) {
      if (frame.parentElement !== null) observer.observe(frame.parentElement);
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
