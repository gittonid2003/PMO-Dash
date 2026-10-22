/* ============================================================
   AOne PMO — auth-ui.js (cloud/web edition)
   Renders the bootstrap-first-admin screen (shown once, only
   when no accounts exist yet) or the normal login screen, and
   hands off to app.js's init() once a session is established.
   ============================================================ */
(function (window) {
  "use strict";
  var App = window.App = window.App || {};
  var S = App.Store;

  function esc(s) { return App.Utils.escapeHtml(String(s == null ? "" : s)); }

  App.AuthUI = {};

  App.AuthUI.boot = function (onReady) {
    S.fetchCurrentUser().then(function (user) {
      // Session already exists
      onReady();
    }).catch(function () {
      // No session, show auth UI
      var wizard = document.getElementById("setup-wizard");
      var loading = document.getElementById("loading-screen");
      
      loading.classList.add("hidden");
      wizard.classList.remove("hidden");

      S.checkSetupStatus().then(function (status) {
        if (status.needsBootstrap) renderBootstrapForm(wizard, onReady);
        else renderLoginForm(wizard, onReady);
      }).catch(function () {
        renderLoginForm(wizard, onReady);
      });
    });
  };

  function renderBootstrapForm(wizard, onReady) {
    wizard.innerHTML =
      '<div class="setup-card">' +
        '<div class="setup-mark">' + App.Icons.get("zap", { size: 26 }) + '</div>' +
        '<h1>Set up AOne PMO</h1>' +
        '<p>Nobody has an account yet — create the first one. It becomes the admin account, which can add the rest of the team afterward from Settings.</p>' +
        '<form id="bootstrap-form">' +
          '<div id="auth-error" class="login-error hidden"></div>' +
          '<label class="field"><span>Your name</span><input type="text" id="bs-name" required autocomplete="name" placeholder="e.g. Rishikesh"/></label>' +
          '<label class="field"><span>Email</span><input type="email" id="bs-email" required autocomplete="email" placeholder="you@atsuyatech.com"/></label>' +
          '<label class="field"><span>Password</span><input type="password" id="bs-password" required autocomplete="new-password" minlength="8" placeholder="At least 8 characters"/></label>' +
          '<button type="submit" class="btn btn-primary btn-block">' + App.Icons.get("check", { size: 15 }) + '<span>Create admin account</span></button>' +
        '</form>' +
        '<p class="setup-foot">Everyone who needs access after this gets their own login — added by an admin, from Settings.</p>' +
      '</div>';

    document.getElementById("bootstrap-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button[type=submit]");
      var errEl = document.getElementById("auth-error");
      errEl.classList.add("hidden");
      btn.disabled = true;
      S.bootstrapAdmin(
        document.getElementById("bs-name").value.trim(),
        document.getElementById("bs-email").value.trim(),
        document.getElementById("bs-password").value
      ).then(function () {
        onReady();
      }).catch(function (err) {
        btn.disabled = false;
        errEl.textContent = err.message || "Could not create the account.";
        errEl.classList.remove("hidden");
      });
    });
  }

  function renderLoginForm(wizard, onReady) {
    wizard.innerHTML =
      '<div class="setup-card">' +
        '<div class="setup-mark">' + App.Icons.get("zap", { size: 26 }) + '</div>' +
        '<h1>AOne PMO</h1>' +
        '<p>Sign in to open your Command Deck.</p>' +
        '<form id="login-form">' +
          '<div id="auth-error" class="login-error hidden"></div>' +
          '<label class="field"><span>Email</span><input type="email" id="login-email" required autocomplete="email" placeholder="you@atsuyatech.com"/></label>' +
          '<label class="field"><span>Password</span><input type="password" id="login-password" required autocomplete="current-password"/></label>' +
          '<button type="submit" class="btn btn-primary btn-block">' + App.Icons.get("arrow-up-right", { size: 15 }) + '<span>Log In</span></button>' +
        '</form>' +
        '<p class="setup-foot">Forgot your password? Ask an admin on your team to reset it from Settings.</p>' +
      '</div>';

    document.getElementById("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button[type=submit]");
      var errEl = document.getElementById("auth-error");
      errEl.classList.add("hidden");
      btn.disabled = true;
      S.login(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value)
        .then(function () { onReady(); })
        .catch(function (err) {
          btn.disabled = false;
          errEl.textContent = err.status === 429 ? err.message : "Incorrect email or password.";
          errEl.classList.remove("hidden");
        });
    });
  }

  // Called by app.js when any API call comes back 401 mid-session (the
  // person's session expired or was revoked from another device) -- drops
  // back to the login screen instead of leaving a broken, half-working UI
  // on screen.
  App.AuthUI.handleSessionExpired = function () {
    document.getElementById("app-shell").classList.add("hidden");
    App.Render.toast("Your session ended — please log in again.", "error");
    App.AuthUI.boot(function () { window.location.reload(); });
  };
})(window);
