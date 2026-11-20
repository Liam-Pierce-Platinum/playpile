// Load the optional 3D renderer separately so a stalled download or a lost GPU
// context can't take the driving controls, simulation or current run with it.
export async function mountDrivingView(canvas, load3D, create2D, setView) {
  if (new URLSearchParams(location.search).get("graphics") === "canvas") {
    setView(create2D(canvas), canvas);
    return;
  }

  function useCanvas() {
    const focused = document.activeElement === canvas;
    const replacement = canvas.cloneNode(false);
    replacement.removeAttribute("data-engine");
    canvas.replaceWith(replacement);
    const fallback = create2D(replacement);
    fallback.resize?.(innerWidth, innerHeight);
    setView(fallback, replacement);
    if (focused) replacement.focus({ preventScroll: true });
  }

  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("3D download timed out")), 8000);
    });
    const create3D = await Promise.race([load3D(), deadline]);
    const view = create3D(canvas);
    setView(view, canvas);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      try {
        view.dispose();
      } catch (error) {
        console.info("3D cleanup after context loss:", error.message);
      }
      useCanvas();
    }, { once: true });
  } catch (error) {
    console.info("Using the 2D driving view:", error.message);
    useCanvas();
  } finally {
    clearTimeout(timer);
  }
}

// Only offer this on the game selection screen, before a run has started.
export function graphicsChoice(canvas) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "graphics-choice";
  const has3D = Boolean(canvas.dataset.engine);
  button.textContent = has3D ? "Use low-power 2D" : "Try 3D graphics";
  button.addEventListener("click", () => {
    const url = new URL(location.href);
    if (has3D) url.searchParams.set("graphics", "canvas");
    else url.searchParams.delete("graphics");
    location.replace(url.href);
  });
  return button;
}

// Keep HUD text and controls at native resolution. If frames consistently
// exceed the 30fps budget, spend fewer pixels and shadow passes on the city.
export function drivingFrameBudget(renderer) {
  const nativeRatio = renderer.getPixelRatio();
  const scales = [1, 0.8, 0.65];
  let tier = 0, last = null, duration = 0, frames = 0, fastWindows = 0, shadowFrame = 0;

  return function adjust(now = performance.now()) {
    const gap = last === null ? 0 : now - last;
    last = now;
    if (gap <= 0 || globalThis.document?.hidden) {
      duration = frames = fastWindows = 0;
    } else {
      // One background-tab gap must not change quality. Repeated long
      // foreground frames still need to move a struggling device down a tier.
      duration += Math.min(gap, 200);
      frames++;
    }
    if (duration >= 1600) {
      const average = duration / frames;
      fastWindows = average < 22 ? fastWindows + 1 : 0;
      const oldTier = tier;
      if (average > 38 && tier < scales.length - 1) tier++;
      else if (fastWindows >= 5 && tier > 0) tier--;
      if (tier !== oldTier) {
        renderer.setPixelRatio(nativeRatio * scales[tier]);
        renderer.shadowMap.autoUpdate = tier === 0;
        fastWindows = shadowFrame = 0;
      }
      duration = frames = 0;
    }
    if (tier > 0 && shadowFrame++ % (tier + 1) === 0) renderer.shadowMap.needsUpdate = true;
  };
}
