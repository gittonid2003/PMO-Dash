/* ============================================================
   AOne PMO — app.js
   Routing, event dispatch, login gate, sidebar, init.
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var S = App.Store;
  var esc = App.Utils.escapeHtml;

  App.State = { view: "dashboard", params: {} };

  var NAV_ITEMS = [
    { view: "dashboard", label: "Dashboard", icon: "dashboard" },
    { view: "clients", label: "Clients", icon: "clients" },
    { view: "all-projects", label: "All Projects", icon: "projects" },
    { view: "settings", label: "Settings", icon: "settings" }
  ];

  /* ---------- Routing ---------- */

  App.navigateTo = function (view, params) {
    App.State = { view: view, params: params || {} };
    renderView();
    updateSidebarActive();
    var main = document.getElementById("main-content");
    if (main) main.scrollTop = 0;
    closeMobileSidebar();
  };

  App.Render.refreshCurrentView = function () {
    renderView();
  };

  function renderView() {
    var v = App.State.view, p = App.State.params;
    switch (v) {
      case "dashboard": App.Render.dashboard(); break;
      case "clients": App.Render.clients(); break;
      case "client-detail": App.Render.clientDetail(p.id); break;
      case "all-projects": App.Render.allProjects(p); break;
      case "project-detail": App.Render.projectDetail(p.id); break;
      case "settings": App.Render.settings(p); break;
      default: App.Render.dashboard();
    }
  }

  /* ---------- Sidebar ---------- */

  function renderSidebar() {
    var ws = S.data.workspace;
    var sidebar = document.getElementById("sidebar");
    var savedWhere = "Saved to the cloud";
    sidebar.innerHTML =
      '<div class="sidebar-brand">' +
        '<span class="brand-mark" id="brand-mark">' + (ws.logoDataUrl ? '<img src="' + ws.logoDataUrl + '"/>' : App.Icons.get("zap", { size: 18 })) + '</span>' +
        '<div class="brand-text"><strong id="sidebar-workspace-name">' + esc(ws.name) + '</strong><span>Command Deck</span></div>' +
        '<button class="mobile-close-btn" id="mobile-close-btn" aria-label="Close menu">' + App.Icons.get("close", { size: 18 }) + '</button>' +
      '</div>' +
      '<nav class="sidebar-nav">' +
        NAV_ITEMS.map(function (item) {
          return '<button class="nav-item" data-action="nav-' + item.view + '" data-view="' + item.view + '">' +
            App.Icons.get(item.icon, { size: 18 }) + '<span>' + item.label + '</span></button>';
        }).join("") +
      '</nav>' +
      '<div class="sidebar-footer">' +
        '<div class="autosave-indicator"><span class="autosave-dot"></span>' + savedWhere + '</div>' +
        '<button class="link-btn-sm sidebar-logout" data-action="logout">' + App.Icons.get("logout", {size:13}) + ' Log out</button>' +
      '</div>';
    document.getElementById("mobile-close-btn").addEventListener("click", closeMobileSidebar);
  }

  function updateSidebarActive() {
    document.querySelectorAll(".nav-item").forEach(function (btn) {
      var isActive = btn.getAttribute("data-view") === App.State.view ||
        (App.State.view === "client-detail" && btn.getAttribute("data-view") === "clients");
      btn.classList.toggle("active", isActive);
    });
  }

  App.updateSidebarBranding = function () {
    var ws = S.data.workspace;
    var nameEl = document.getElementById("sidebar-workspace-name");
    if (nameEl) nameEl.textContent = ws.name;
    var markEl = document.getElementById("brand-mark");
    if (markEl) markEl.innerHTML = ws.logoDataUrl ? '<img src="' + ws.logoDataUrl + '"/>' : App.Icons.get("zap", { size: 18 });
  };

  function openMobileSidebar() {
    document.getElementById("app-shell").classList.add("sidebar-open");
  }
  function closeMobileSidebar() {
    var shell = document.getElementById("app-shell");
    if (shell) shell.classList.remove("sidebar-open");
  }

  /* ---------- Accent color ---------- */

  App.applyAccentColor = function () {
    var color = (S.data.workspace && S.data.workspace.accentColor) || "#3B4FF0";
    document.documentElement.style.setProperty("--signal", color);
  };

  /* ---------- Post-render animation pass ---------- */

  App.Render.afterMount = function () {
    var container = document.getElementById("view-container");
    if (!container) return;
    var cards = container.querySelectorAll(".glass-card, .client-card, .client-mini-card, .project-row, .dept-card");
    cards.forEach(function (el, i) {
      el.classList.add("card-enter");
      el.style.animationDelay = Math.min(i * 18, 180) + "ms";
    });
    App.Charts.animateIn(container);
    container.querySelectorAll("[data-count-to]").forEach(animateCountUp);
  };

  function animateCountUp(el) {
    var raw = el.getAttribute("data-count-to");
    var format = el.getAttribute("data-count-format");
    var suffix = "";
    var numMatch = String(raw).match(/^-?\d+/);
    var target = numMatch ? parseInt(numMatch[0], 10) : 0;
    if (String(raw).indexOf("%") !== -1) suffix = "%";
    var start = 0;
    var duration = 700;
    var startTime = null;
    function render(val) {
      if (format === "currency") return App.Utils.formatCurrency(val);
      return val + suffix;
    }
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = Math.round(start + (target - start) * eased);
      el.textContent = render(val);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = render(target);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Central action dispatcher ----------
     Exposed as App.handleAction so the modal card (which stops click
     propagation to avoid triggering the overlay's outside-click-closes
     behavior) can still dispatch data-action clicks that occur inside it. */

  function handleAction(el) {
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");

    switch (action) {
      case "close-modal": App.Render.closeModal(); break;

      case "nav-dashboard": App.navigateTo("dashboard"); break;
      case "nav-clients": App.navigateTo("clients"); break;
      case "nav-all-projects": App.navigateTo("all-projects"); break;
      case "nav-all-projects-filtered":
        App.navigateTo("all-projects", { rag: el.getAttribute("data-rag") });
        break;
      case "nav-settings": App.navigateTo("settings"); break;
      case "nav-settings-departments": App.navigateTo("settings", { scrollToDepartments: true }); break;

      case "open-client": App.navigateTo("client-detail", { id: id }); break;
      case "open-project": App.navigateTo("project-detail", { id: id }); break;

      case "open-add-client": App.Render.clientFormModal(); break;
      case "open-edit-client": App.Render.clientFormModal(id); break;
      case "delete-client":
        var client = S.getClient(id);
        if (!client) break;
        App.Render.confirm({
          title: "Delete " + client.name + "?",
          body: "This removes the client and all " + S.getClientProjects(id).length + " of their project(s), including all pipeline progress. This cannot be undone.",
          confirmLabel: "Delete Client", danger: true, icon: "trash"
        }, function () {
          S.deleteClient(id).then(function () {
            App.Render.toast("Client deleted");
            App.navigateTo("clients");
          }).catch(function (err) {
            App.Render.toast("Could not delete client: " + err.message, "error");
          });
        });
        break;

      case "open-add-project": App.Render.projectFormModal(null, el.getAttribute("data-client-id")); break;
      case "open-edit-project": App.Render.projectFormModal(id); break;
      case "delete-project":
        var project = S.getProject(id);
        if (!project) break;
        var backToClientId = project.clientId;
        var hasDocs = S.getProjectDocuments(id).length;
        App.Render.confirm({
          title: "Delete " + project.name + "?",
          body: "This removes the project, its entire department pipeline history" + (hasDocs ? ", and " + hasDocs + " attached document" + (hasDocs===1?"":"s") : "") + ". This cannot be undone.",
          confirmLabel: "Delete Project", danger: true, icon: "trash"
        }, function () {
          S.deleteProject(id).then(function () {
            App.Render.toast("Project deleted");
            var stillExists = S.getClient(backToClientId);
            App.navigateTo(stillExists ? "client-detail" : "all-projects", stillExists ? { id: backToClientId } : {});
          }).catch(function (err) {
            App.Render.toast("Could not delete project: " + err.message, "error");
          });
        });
        break;

      case "open-add-project-dept":
        var forProjectId = el.getAttribute("data-project-id");
        if (forProjectId) App.Render.projectDeptFormModal(forProjectId, null);
        break;

      case "open-add-tmpl-dept": App.Render.templateDeptFormModal(); break;
      case "open-edit-tmpl-dept": App.Render.templateDeptFormModal(id); break;
      case "delete-tmpl-dept":
        var tmplDept = S.data.departmentTemplate.find(function (d) { return d.id === id; });
        if (!tmplDept) break;
        App.Render.confirm({
          title: "Remove " + tmplDept.name + " from the template?",
          body: "New projects won't include this stage anymore. Projects that already exist are not affected. This cannot be undone.",
          confirmLabel: "Remove from Template", danger: true, icon: "trash"
        }, function () {
          S.deleteTemplateDepartment(id).then(function () {
            App.Render.toast("Removed from default template");
            App.Render.settings();
          }).catch(function (err) {
            App.Render.toast("Could not remove stage: " + err.message, "error");
          });
        });
        break;

      case "export-excel": App.Export.toExcel(); break;
      case "export-json": App.Export.toJSON(); break;

      case "open-mobile-menu": openMobileSidebar(); break;

      case "logout":
        S.logout().then(function () {
          document.getElementById("app-shell").classList.add("hidden");
          App.AuthUI.boot(function () { window.location.reload(); });
        }).catch(function () {
          // Even if the network call fails, the person's intent is clear —
          // drop them back to the login screen rather than leaving them
          // stuck on a "logout failed" state with no way forward.
          window.location.reload();
        });
        break;
    }
  }
  App.handleAction = handleAction;

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    handleAction(el);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var modalRoot = document.getElementById("modal-root");
      if (modalRoot && modalRoot.classList.contains("open")) App.Render.closeModal();
    }
  });

  /* ---------- Login gate ----------
     Real, per-person accounts now (see auth-ui.js) — this app is reachable
     over the internet, so the login here is a genuine security boundary,
     not just a workflow gate. */

  function showAppShell() {
    document.getElementById("setup-wizard").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");
    renderSidebar();
    App.applyAccentColor();
    App.navigateTo("dashboard");
  }

  /* ---------- Init ---------- */

  function init() {
    var loading = document.getElementById("loading-screen");

    App.AuthUI.boot(function () {
      // onReady: a session now exists (just logged in, just bootstrapped,
      // or already had a valid cookie) -- load the real dataset before
      // showing anything.
      S.loadFromServer().then(function () {
        loading.classList.add("fade-out");
        setTimeout(function () {
          loading.classList.add("hidden");
          showAppShell();
        }, 320);
      }).catch(function (err) {
        loading.classList.add("hidden");
        document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#DC2626;">Could not load your data: ' + esc(err.message) + '. Please refresh the page.</div>';
      });
    });

    var hamburger = document.getElementById("mobile-menu-btn");
    if (hamburger) hamburger.addEventListener("click", openMobileSidebar);
    var backdrop = document.getElementById("sidebar-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeMobileSidebar);
  }

  /* ---------- Safety net ----------
     If something throws that we didn't anticipate, surface it instead of
     leaving the person looking at an unresponsive screen with no signal
     that anything went wrong. This does not fix the underlying error, but
     it turns a silent freeze into a visible, recoverable message. A 401
     specifically means the session ended (expired, or revoked from
     another device) -- that gets its own handling, back to the login
     screen, rather than a generic error toast. */
  window.addEventListener("error", function (e) {
    var msg = "uncaught error: " + ((e.error && (e.error.stack || e.error.message)) || e.message);
    console.error("AOne PMO:", msg);
    if (App.Render && App.Render.toast) {
      App.Render.toast("Something went wrong with that last action. Your data is safe — try again.", "error");
    }
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (e.reason && e.reason.status === 401) {
      e.preventDefault();
      App.AuthUI.handleSessionExpired();
      return;
    }
    var msg = "unhandled promise rejection: " + (e.reason && (e.reason.stack || e.reason.message || e.reason));
    console.error("AOne PMO:", msg);
    if (App.Render && App.Render.toast) {
      App.Render.toast("Something went wrong with that last action. Your data is safe — try again.", "error");
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})(window);
