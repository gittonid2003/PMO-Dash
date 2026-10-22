/* ============================================================
   AOne PMO — render-common.js
   Shared UI primitives: avatars, badges, modal, toast, empty state.
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var esc = App.Utils.escapeHtml;
  App.Render = App.Render || {};

  /* ---------- Avatar ---------- */
  App.Render.avatarHTML = function (entity, size, opts) {
    opts = opts || {};
    var name = (entity && entity.name) || "?";
    var photoUrl = entity && entity.hasPhoto && entity.id ? App.Store.clientPhotoUrl(entity.id) : null;
    var cls = "avatar" + (opts.className ? " " + opts.className : "");
    var style = "width:" + size + "px;height:" + size + "px;font-size:" + Math.round(size * 0.38) + "px;";
    if (photoUrl) {
      return '<span class="' + cls + '" style="' + style + '"><img src="' + photoUrl + '" alt="' + esc(name) + '"/></span>';
    }
    var grad = App.Utils.gradientFromString(name);
    return '<span class="' + cls + '" style="' + style + 'background:' + grad + '">' + esc(App.Utils.initials(name)) + '</span>';
  };

  /* ---------- Badges / chips ---------- */
  App.Render.ragBadge = function (rag) {
    var map = { Green: "On Track", Amber: "At Risk", Red: "Delayed" };
    return '<span class="chip chip-rag chip-' + rag.toLowerCase() + '"><span class="chip-dot"></span>' + (map[rag] || rag) + '</span>';
  };

  App.Render.flagDot = function (flag, opts) {
    opts = opts || {};
    return '<span class="flag-dot flag-' + String(flag).toLowerCase() + (opts.className ? " " + opts.className : "") + '" title="' + esc(flag) + '"></span>';
  };

  App.Render.statusChip = function (status) {
    var slug = status.toLowerCase().replace(/\s+/g, "-");
    return '<span class="chip chip-status chip-status-' + slug + '">' + esc(status) + '</span>';
  };

  App.Render.priorityChip = function (priority) {
    var slug = (priority || "Medium").toLowerCase();
    return '<span class="chip chip-priority chip-priority-' + slug + '">' + esc(priority || "Medium") + '</span>';
  };

  /* ---------- Empty state ---------- */
  App.Render.emptyState = function (opts) {
    opts = opts || {};
    return (
      '<div class="empty-state">' +
        '<div class="empty-icon">' + App.Icons.get(opts.icon || "inbox", { size: 30 }) + '</div>' +
        '<h3>' + esc(opts.title || "Nothing here yet") + '</h3>' +
        '<p>' + esc(opts.body || "") + '</p>' +
        (opts.actionLabel ? '<button class="btn btn-primary" data-action="' + esc(opts.action) + '">' + App.Icons.get("plus", { size: 16 }) + '<span>' + esc(opts.actionLabel) + '</span></button>' : "") +
      '</div>'
    );
  };

  /* ---------- Modal ----------
     A generation counter guards against a real race: closeModal() delays
     clearing #modal-root by 220ms for the closing transition. If a new
     modal is opened again within that window (e.g. cancel a form, then
     immediately reopen it — exactly the kind of thing that happens while
     testing), the OLD delayed cleanup was firing after the NEW modal had
     already replaced it, silently wiping the new modal back out with no
     visible error. Each open/close now stamps and checks a generation
     number so a stale cleanup can never touch a modal that isn't its own. */
  var modalGeneration = 0;

  App.Render.openModal = function (innerHTML, opts) {
    opts = opts || {};
    var root = document.getElementById("modal-root");
    var myGeneration = ++modalGeneration;
    root.innerHTML =
      '<div class="modal-overlay">' +
        '<div class="modal-card ' + (opts.className || "") + '" role="dialog" aria-modal="true">' +
          innerHTML +
        '</div>' +
      '</div>';
    root.setAttribute("data-modal-generation", String(myGeneration));
    root.classList.add("open");
    document.body.classList.add("modal-open");
    var overlay = root.querySelector(".modal-overlay");
    var card = root.querySelector(".modal-card");
    // Clicking the dimmed backdrop (not the card itself) closes the modal.
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) App.Render.closeModal();
    });
    // Clicks inside the card are stopped from bubbling to the overlay/document
    // listeners, but are still dispatched through the shared action handler
    // so buttons like Cancel (data-action="close-modal") keep working.
    card.addEventListener("click", function (e) {
      e.stopPropagation();
      var el = e.target.closest("[data-action]");
      if (el && card.contains(el) && App.handleAction) App.handleAction(el);
    });
    requestAnimationFrame(function () {
      // Guard here too: if this modal was already superseded before its
      // first paint even happened, don't force it visible.
      if (root.getAttribute("data-modal-generation") === String(myGeneration)) {
        overlay.classList.add("visible");
      }
    });
    var firstInput = card.querySelector("input, textarea, select");
    if (firstInput) {
      setTimeout(function () {
        // Don't steal focus if the person already clicked into a field.
        if (root.getAttribute("data-modal-generation") === String(myGeneration) && !card.contains(document.activeElement)) firstInput.focus();
      }, 60);
    }
  };

  App.Render.closeModal = function () {
    var root = document.getElementById("modal-root");
    var overlay = root.querySelector(".modal-overlay");
    var myGeneration = modalGeneration;
    document.body.classList.remove("modal-open");
    if (!overlay) { root.innerHTML = ""; return; }
    overlay.classList.remove("visible");
    setTimeout(function () {
      // Only clear if no newer modal has opened in the meantime — otherwise
      // this stale cleanup would wipe out a modal that isn't even the one
      // it was scheduled to close.
      if (root.getAttribute("data-modal-generation") === String(myGeneration)) {
        root.innerHTML = "";
        root.classList.remove("open");
      }
    }, 220);
  };

  /* ---------- Toast ---------- */
  App.Render.toast = function (message, type) {
    var root = document.getElementById("toast-root");
    var el = document.createElement("div");
    el.className = "toast toast-" + (type || "default");
    var iconName = type === "error" ? "alert-triangle" : (type === "success" ? "check" : "info");
    el.innerHTML = App.Icons.get(iconName, { size: 16 }) + '<span>' + esc(message) + '</span>';
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("visible"); });
    setTimeout(function () {
      el.classList.remove("visible");
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  };

  /* ---------- Confirm dialog (returns via callback) ---------- */
  App.Render.confirm = function (opts, onConfirm) {
    var html =
      '<div class="modal-body confirm-body">' +
        '<div class="confirm-icon ' + (opts.danger ? "danger" : "") + '">' + App.Icons.get(opts.icon || "alert-triangle", { size: 22 }) + '</div>' +
        '<h3>' + esc(opts.title || "Are you sure?") + '</h3>' +
        '<p>' + esc(opts.body || "") + '</p>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
          '<button class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" id="confirm-yes-btn">' + esc(opts.confirmLabel || "Confirm") + '</button>' +
        '</div>' +
      '</div>';
    App.Render.openModal(html, { className: "modal-sm" });
    document.getElementById("confirm-yes-btn").addEventListener("click", function () {
      App.Render.closeModal();
      onConfirm();
    });
  };

  /* ---------- Select / dropdown builder ---------- */
  App.Render.selectOptions = function (options, selected) {
    return options.map(function (o) {
      var val = typeof o === "object" ? o.value : o;
      var label = typeof o === "object" ? o.label : o;
      return '<option value="' + esc(val) + '"' + (val === selected ? " selected" : "") + '>' + esc(label) + '</option>';
    }).join("");
  };

})(window);
