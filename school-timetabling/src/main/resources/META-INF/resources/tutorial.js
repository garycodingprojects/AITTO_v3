/**
 * Tutorial tab: English / Traditional Chinese language toggle.
 * Persists the user's choice in localStorage.
 */
(function () {
  /** localStorage key for the tutorial language preference. */
  var TUTORIAL_LANG_STORAGE_KEY = "school-timetabling-tutorial-lang";

  /** Supported tutorial languages. */
  var TUTORIAL_LANG_EN = "en";
  var TUTORIAL_LANG_ZH = "zh";

  /** Button label shown when English content is visible (click to switch to Chinese). */
  var TOGGLE_LABEL_TO_ZH = "繁體中文";
  /** Button label shown when Chinese content is visible (click to switch to English). */
  var TOGGLE_LABEL_TO_EN = "English";

  /**
   * Returns the saved tutorial language, defaulting to English.
   * @returns {string}
   */
  function getSavedTutorialLang() {
    var saved = localStorage.getItem(TUTORIAL_LANG_STORAGE_KEY);
    return saved === TUTORIAL_LANG_ZH ? TUTORIAL_LANG_ZH : TUTORIAL_LANG_EN;
  }

  /**
   * Applies the selected tutorial language to the page.
   * @param {string} lang - TUTORIAL_LANG_EN or TUTORIAL_LANG_ZH
   */
  function applyTutorialLang(lang) {
    var isZh = lang === TUTORIAL_LANG_ZH;
    var enBlock = document.getElementById("tutorialLangEn");
    var zhBlock = document.getElementById("tutorialLangZh");
    var toggleLabel = document.getElementById("tutorialLangToggleLabel");
    var toggleButton = document.getElementById("tutorialLangToggle");

    if (enBlock) {
      enBlock.classList.toggle("d-none", isZh);
    }
    if (zhBlock) {
      zhBlock.classList.toggle("d-none", !isZh);
    }
    if (toggleLabel) {
      toggleLabel.textContent = isZh ? TOGGLE_LABEL_TO_EN : TOGGLE_LABEL_TO_ZH;
    }
    if (toggleButton) {
      toggleButton.setAttribute(
        "aria-label",
        isZh ? "Switch tutorial to English" : "Switch tutorial to Traditional Chinese"
      );
    }

    localStorage.setItem(TUTORIAL_LANG_STORAGE_KEY, isZh ? TUTORIAL_LANG_ZH : TUTORIAL_LANG_EN);
  }

  /**
   * Toggles between English and Traditional Chinese tutorial content.
   */
  function toggleTutorialLang() {
    var current = getSavedTutorialLang();
    applyTutorialLang(current === TUTORIAL_LANG_ZH ? TUTORIAL_LANG_EN : TUTORIAL_LANG_ZH);
  }

  // Restore saved language and bind the toggle button on page load.
  document.addEventListener("DOMContentLoaded", function () {
    applyTutorialLang(getSavedTutorialLang());

    var toggleButton = document.getElementById("tutorialLangToggle");
    if (toggleButton) {
      toggleButton.addEventListener("click", toggleTutorialLang);
    }
  });
})();
