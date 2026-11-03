// Runs before first paint (blocking, in <head>) so a stored light/dark choice never flashes.
try { var t = localStorage.getItem("gr.theme"); if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
