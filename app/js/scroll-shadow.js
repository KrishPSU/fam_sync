// Scroll fades for the Today panels (Events / Tasks).
//
// A soft fade dissolves the top and/or bottom edge of a scroll container ONLY
// when there's clipped content in that direction, so the user can tell the list
// scrolls:
//   - no overflow            → no fade at all
//   - scrolled to the top    → no top fade
//   - scrolled to the bottom → no bottom fade
//   - somewhere in between    → both
//
// The actual fades live in CSS (a mask toggled by the has-top-fade /
// has-bottom-fade classes); this file just decides when each one applies.
(function () {
  function attach(el) {
    if (!el) return;

    let frame = null;
    function update() {
      frame = null;
      // +1px slack absorbs sub-pixel rounding so "at the bottom" reads cleanly.
      const scrollable = el.scrollHeight - el.clientHeight > 1;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      el.classList.toggle('has-top-fade', scrollable && !atTop);
      el.classList.toggle('has-bottom-fade', scrollable && !atBottom);
    }
    function schedule() {
      if (frame === null) frame = requestAnimationFrame(update);
    }

    // Scrolling moves the edges; recompute as it happens.
    el.addEventListener('scroll', schedule, { passive: true });

    // Size/visibility changes (window resize, tab shown/hidden) change how much
    // is clipped — ResizeObserver fires on those, including display:none ↔ shown.
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(el);

    // Content changes (lists are rebuilt over sockets) don't resize the capped
    // box, so watch for added/removed rows too.
    new MutationObserver(schedule).observe(el, { childList: true, subtree: true });

    schedule();
  }

  function init() {
    attach(document.getElementById('my-events'));
    attach(document.getElementById('my-tasks'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
