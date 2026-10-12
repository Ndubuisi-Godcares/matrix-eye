// Runs before the page paints, so the chosen colour theme never flashes the wrong one.
// It also adds the "js" class that lets the page enable enhancements (tabs, search) that need JavaScript.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) {
    // Storage can be blocked (private mode, strict settings): the system preference applies.
  }
})();
