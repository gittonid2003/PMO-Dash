/* ============================================================
   AOne PMO — render-settings.js
   Default pipeline template, workspace profile, login
   credentials, and data & backup.
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var esc = App.Utils.escapeHtml;
  var S = App.Store;

  var ICON_CHOICES = ["search","handshake","package","calendar","clipboard-check","wrench","life-buoy","receipt","bar-chart","layers","briefcase","zap","building","rocket","inbox","activity"];

  function templateRow(dept, index, total) {
    return (
      '<div class="dept-manage-row" data-dept-id="' + dept.id + '">' +
        '<span class="dept-drag-handle">' + App.Icons.get("drag-handle", {size:15}) + '</span>' +
        '<span class="dept-icon" style="background:' + esc(dept.color) + '1a;color:' + esc(dept.color) + '">' + App.Icons.get(dept.icon || "layers", { size: 16 }) + '</span>' +
        '<div class="dept-manage-info">' +
          '<div class="dept-manage-name">' + esc(dept.name) + '</div>' +
          '<div class="dept-manage-sub">' + esc(dept.ownerTeam || "No owner set") + '</div>' +
        '</div>' +
        '<div class="dept-manage-actions">' +
          '<button class="icon-btn icon-btn-xs" data-action="move-tmpl-up" ' + (index===0?"disabled":"") + ' title="Move up">' + App.Icons.get("chevron-up", {size:14}) + '</button>' +
          '<button class="icon-btn icon-btn-xs" data-action="move-tmpl-down" ' + (index===total-1?"disabled":"") + ' title="Move down">' + App.Icons.get("chevron-down", {size:14}) + '</button>' +
          '<button class="icon-btn icon-btn-xs" data-action="open-edit-tmpl-dept" data-id="' + dept.id + '" title="Edit">' + App.Icons.get("edit", {size:14}) + '</button>' +
          '<button class="icon-btn icon-btn-xs icon-btn-danger" data-action="delete-tmpl-dept" data-id="' + dept.id + '" title="Delete">' + App.Icons.get("trash", {size:14}) + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  App.Render.settings = function (opts) {
    opts = opts || {};
    var template = S.getOrderedTemplate();
    var ws = S.data.workspace;
    var totalRecords = S.data.clients.length + S.data.projects.length;

    var html =
      '<div class="view view-settings">' +
        '<div class="view-header">' +
          '<div><div class="eyebrow">Configuration</div><h1>Settings</h1><p class="view-subtitle">Shape the default pipeline, workspace, login, and your data.</p></div>' +
        '</div>' +

        '<div class="settings-grid">' +

          '<div class="glass-card panel" id="settings-departments">' +
            '<div class="panel-head"><h3>' + App.Icons.get("layers",{size:15}) + ' Default Pipeline Template</h3><span class="panel-sub">Used to seed new projects only</span></div>' +
            '<p class="panel-desc">These stages are copied onto every <strong>new</strong> project you create — based on how AOne actually runs, Pre-Sales through MIS. Editing them here does not change any project that already exists; open any project\'s Department Pipeline to customize that project specifically.</p>' +
            '<div class="dept-manage-list" id="tmpl-manage-list">' + template.map(function(d,i){return templateRow(d,i,template.length);}).join("") + '</div>' +
            '<button class="btn btn-ghost btn-sm" data-action="open-add-tmpl-dept">' + App.Icons.get("plus",{size:14}) + '<span>Add to Template</span></button>' +
          '</div>' +

          '<div class="glass-card panel">' +
            '<div class="panel-head"><h3>' + App.Icons.get("building",{size:15}) + ' Workspace</h3></div>' +
            '<form id="workspace-form">' +
              '<label class="field"><span>Workspace name</span><input type="text" id="ws-name" value="' + esc(ws.name) + '"/></label>' +
              '<label class="field"><span>Accent color</span></label>' +
              '<div class="color-swatch-row" id="ws-accent-swatches">' +
                App.PALETTE.map(function(c){ return '<button type="button" class="color-swatch ' + (ws.accentColor===c?"active":"") + '" style="background:' + c + '" data-color="' + c + '"></button>'; }).join("") +
              '</div>' +
              '<input type="hidden" id="ws-accent-value" value="' + esc(ws.accentColor) + '"/>' +
              '<button type="submit" class="btn btn-primary btn-sm">' + App.Icons.get("check",{size:14}) + '<span>Save Workspace</span></button>' +
            '</form>' +
          '</div>' +

          '<div class="glass-card panel">' +
            '<div class="panel-head"><h3>' + App.Icons.get("logout",{size:15}) + ' Team &amp; Access</h3></div>' +
            '<p class="panel-desc">' + (S.currentUser ? "Signed in as <strong>" + esc(S.currentUser.name) + "</strong> (" + esc(S.currentUser.email) + ", " + esc(S.currentUser.role) + ")." : "") + '</p>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="logout-other-sessions" style="margin-bottom:14px;">' + App.Icons.get("logout",{size:13}) + '<span>Log out other devices</span></button>' +
            '<div id="team-members-panel"><p class="field-hint">Loading team members…</p></div>' +
          '</div>' +

          '<div class="glass-card panel">' +
            '<div class="panel-head"><h3>' + App.Icons.get("download",{size:15}) + ' Data &amp; Backup</h3></div>' +
            '<p class="panel-desc">' + totalRecords + ' record' + (totalRecords===1?"":"s") + ' shared across your whole team, stored in the cloud. Export regularly so you always have a copy of your own.</p>' +
            '<div class="data-actions">' +
              '<button class="btn btn-secondary" data-action="export-excel">' + App.Icons.get("download",{size:15}) + '<div><span>Export Excel</span><small>Full tracker workbook (.xlsx)</small></div></button>' +
              '<button class="btn btn-secondary" data-action="export-json">' + App.Icons.get("download",{size:15}) + '<div><span>Export Backup</span><small>Full data snapshot (.json)</small></div></button>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>';

    document.getElementById("view-container").innerHTML = html;
    App.Render.afterMount();
    wireSettingsEvents();
    loadTeamMembersPanel();

    if (opts.scrollToDepartments) {
      var el = document.getElementById("settings-departments");
      if (el) setTimeout(function () { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
    }
  };

  function loadTeamMembersPanel() {
    var panel = document.getElementById("team-members-panel");
    if (!panel) return;
    if (!S.currentUser || S.currentUser.role !== "admin") {
      panel.innerHTML = '<p class="field-hint">Only admins can see and manage the full team list.</p>';
      return;
    }
    S.listUsers().then(function (r) {
      panel.innerHTML =
        '<div class="dept-manage-list" id="team-manage-list">' +
          r.users.map(function (u) {
            var isSelf = u.id === S.currentUser.id;
            return (
              '<div class="dept-manage-row">' +
                '<div class="dept-manage-info">' +
                  '<div class="dept-manage-name">' + esc(u.name) + (isSelf ? ' <span class="pipeline-scope-tag">you</span>' : '') + '</div>' +
                  '<div class="dept-manage-sub">' + esc(u.email) + ' · ' + esc(u.role) + '</div>' +
                '</div>' +
                '<div class="dept-manage-actions">' +
                  '<button class="icon-btn icon-btn-xs" data-action="reset-team-member-password" data-id="' + u.id + '" data-name="' + esc(u.name) + '" title="Reset password">' + App.Icons.get("logout", {size:14}) + '</button>' +
                  (isSelf ? '' : '<button class="icon-btn icon-btn-xs icon-btn-danger" data-action="delete-team-member" data-id="' + u.id + '" data-name="' + esc(u.name) + '" title="Remove">' + App.Icons.get("trash", {size:14}) + '</button>') +
                '</div>' +
              '</div>'
            );
          }).join("") +
        '</div>' +
        '<form id="add-member-form" style="margin-top:14px;">' +
          '<div class="field-grid">' +
            '<label class="field"><span>Name</span><input type="text" id="am-name" required placeholder="Full name"/></label>' +
            '<label class="field"><span>Email</span><input type="email" id="am-email" required placeholder="them@atsuyatech.com"/></label>' +
            '<label class="field"><span>Temporary password</span><input type="text" id="am-password" required minlength="8" placeholder="At least 8 characters"/></label>' +
            '<label class="field"><span>Role</span><select id="am-role"><option value="member">Member</option><option value="admin">Admin</option></select></label>' +
          '</div>' +
          '<button type="submit" class="btn btn-ghost btn-sm">' + App.Icons.get("plus",{size:14}) + '<span>Add team member</span></button>' +
        '</form>';

      document.querySelectorAll("[data-action='delete-team-member']").forEach(function (btn) {
        btn.addEventListener("click", function () {
          App.Render.confirm({
            title: "Remove " + btn.getAttribute("data-name") + "?",
            body: "They immediately lose access on every device they're logged in on. This cannot be undone.",
            confirmLabel: "Remove Access", danger: true, icon: "trash"
          }, function () {
            S.deleteUser(btn.getAttribute("data-id")).then(function () {
              App.Render.toast("Team member removed");
              loadTeamMembersPanel();
            }).catch(function (err) { App.Render.toast(err.message, "error"); });
          });
        });
      });

      document.querySelectorAll("[data-action='reset-team-member-password']").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var userId = btn.getAttribute("data-id");
          var userName = btn.getAttribute("data-name");
          App.Render.openModal(
            '<form id="reset-pw-form" class="modal-body">' +
              '<h3>Reset password for ' + esc(userName) + '</h3>' +
              '<p class="field-hint">This immediately logs them out on every device — share the new password with them directly.</p>' +
              '<label class="field"><span>New temporary password</span><input type="text" id="reset-pw-value" required minlength="8" placeholder="At least 8 characters"/></label>' +
              '<div class="modal-actions">' +
                '<button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
                '<button type="submit" class="btn btn-primary">' + App.Icons.get("check",{size:15}) + '<span>Reset Password</span></button>' +
              '</div>' +
            '</form>',
            { className: "modal-sm" }
          );
          document.getElementById("reset-pw-form").addEventListener("submit", function (e) {
            e.preventDefault();
            var newPassword = document.getElementById("reset-pw-value").value;
            App.Render.closeModal();
            S.resetUserPassword(userId, newPassword).then(function () {
              App.Render.toast("Password reset for " + userName);
            }).catch(function (err) {
              App.Render.toast(err.message, "error");
            });
          });
        });
      });

      document.getElementById("add-member-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var btn = e.target.querySelector("button[type=submit]");
        btn.disabled = true;
        S.createUser({
          name: document.getElementById("am-name").value.trim(),
          email: document.getElementById("am-email").value.trim(),
          password: document.getElementById("am-password").value,
          role: document.getElementById("am-role").value
        }).then(function () {
          App.Render.toast("Team member added");
          loadTeamMembersPanel();
        }).catch(function (err) {
          btn.disabled = false;
          App.Render.toast(err.message, "error");
        });
      });
    }).catch(function () {
      panel.innerHTML = '<p class="field-hint">Couldn\'t load the team list.</p>';
    });
  }

  function wireSettingsEvents() {
    document.querySelectorAll("#tmpl-manage-list [data-action='move-tmpl-up']").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var row = btn.closest(".dept-manage-row");
        moveTemplateDept(row.getAttribute("data-dept-id"), -1);
      });
    });
    document.querySelectorAll("#tmpl-manage-list [data-action='move-tmpl-down']").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var row = btn.closest(".dept-manage-row");
        moveTemplateDept(row.getAttribute("data-dept-id"), 1);
      });
    });

    var wsForm = document.getElementById("workspace-form");
    wsForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      S.updateWorkspace({
        name: document.getElementById("ws-name").value.trim() || "AOne PMO",
        accentColor: document.getElementById("ws-accent-value").value
      }).then(function () {
        btn.disabled = false;
        App.applyAccentColor();
        App.Render.toast("Workspace saved");
        App.updateSidebarBranding();
      }).catch(function (err) {
        btn.disabled = false;
        App.Render.toast("Couldn't save: " + err.message, "error");
      });
    });
    document.querySelectorAll("#ws-accent-swatches .color-swatch").forEach(function (sw) {
      sw.addEventListener("click", function () {
        document.querySelectorAll("#ws-accent-swatches .color-swatch").forEach(function (s) { s.classList.remove("active"); });
        sw.classList.add("active");
        document.getElementById("ws-accent-value").value = sw.getAttribute("data-color");
      });
    });

    var logoutOthersBtn = document.querySelector("[data-action='logout-other-sessions']");
    if (logoutOthersBtn) logoutOthersBtn.addEventListener("click", function () {
      S.logoutOtherSessions().then(function () {
        App.Render.toast("Logged out on every other device");
      }).catch(function (err) {
        App.Render.toast(err.message, "error");
      });
    });
  }

  function moveTemplateDept(id, dir) {
    var template = S.getOrderedTemplate();
    var idx = template.findIndex(function (d) { return d.id === id; });
    var swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= template.length) return;
    var tmp = template[idx];
    template[idx] = template[swapIdx];
    template[swapIdx] = tmp;
    S.reorderTemplate(template.map(function (d) { return d.id; })).then(function () {
      App.Render.settings();
    }).catch(function (err) {
      App.Render.toast("Couldn't reorder: " + err.message, "error");
    });
  }

  /* ---------- Add / Edit a TEMPLATE department (affects only future new projects) ---------- */

  App.Render.templateDeptFormModal = function (existingId) {
    var dept = existingId ? S.data.departmentTemplate.find(function (d) { return d.id === existingId; }) : null;
    var isEdit = !!dept;
    var color = dept ? dept.color : App.PALETTE[S.data.departmentTemplate.length % App.PALETTE.length];
    var icon = dept ? (dept.icon || "layers") : "layers";

    var html =
      '<form id="tmpl-dept-form" class="modal-body">' +
        '<h3>' + (isEdit ? "Edit Template Stage" : "Add to Default Template") + '</h3>' +
        '<p class="field-hint">Only affects projects you create from now on.</p>' +
        '<div class="field-grid">' +
          '<label class="field field-full"><span>Name *</span><input type="text" id="tdf-name" required value="' + (dept ? esc(dept.name) : "") + '" placeholder="e.g. Quality Assurance"/></label>' +
          '<label class="field field-full"><span>Owning team</span><input type="text" id="tdf-owner" value="' + (dept ? esc(dept.ownerTeam) : "") + '" placeholder="e.g. Field, Engineering, Finance"/></label>' +
        '</div>' +
        '<label class="field"><span>Color</span></label>' +
        '<div class="color-swatch-row" id="tdf-color-swatches">' +
          App.PALETTE.map(function(c){ return '<button type="button" class="color-swatch ' + (color===c?"active":"") + '" style="background:' + c + '" data-color="' + c + '"></button>'; }).join("") +
        '</div>' +
        '<input type="hidden" id="tdf-color-value" value="' + esc(color) + '"/>' +
        '<label class="field"><span>Icon</span></label>' +
        '<div class="icon-picker-row" id="tdf-icon-picker">' +
          ICON_CHOICES.map(function(ic){ return '<button type="button" class="icon-pick ' + (icon===ic?"active":"") + '" data-icon="' + ic + '">' + App.Icons.get(ic,{size:16}) + '</button>'; }).join("") +
        '</div>' +
        '<input type="hidden" id="tdf-icon-value" value="' + esc(icon) + '"/>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">' + App.Icons.get("check",{size:15}) + '<span>' + (isEdit ? "Save Changes" : "Add to Template") + '</span></button>' +
        '</div>' +
      '</form>';

    App.Render.openModal(html, { className: "modal-md" });

    document.querySelectorAll("#tdf-color-swatches .color-swatch").forEach(function (sw) {
      sw.addEventListener("click", function () {
        document.querySelectorAll("#tdf-color-swatches .color-swatch").forEach(function (s) { s.classList.remove("active"); });
        sw.classList.add("active");
        document.getElementById("tdf-color-value").value = sw.getAttribute("data-color");
      });
    });
    document.querySelectorAll("#tdf-icon-picker .icon-pick").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#tdf-icon-picker .icon-pick").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        document.getElementById("tdf-icon-value").value = btn.getAttribute("data-icon");
      });
    });

    document.getElementById("tmpl-dept-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {
        name: document.getElementById("tdf-name").value.trim() || "New Department",
        ownerTeam: document.getElementById("tdf-owner").value.trim(),
        color: document.getElementById("tdf-color-value").value,
        icon: document.getElementById("tdf-icon-value").value
      };
      App.Render.closeModal();
      var action = isEdit ? S.updateTemplateDepartment(dept.id, payload) : S.addTemplateDepartment(payload);
      action.then(function () {
        App.Render.toast(isEdit ? "Template updated" : "Added to default template");
        App.Render.settings({ scrollToDepartments: true });
      }).catch(function (err) {
        console.error("AOne PMO: saving template stage failed", err);
        App.Render.toast("Couldn't save that — try again.", "error");
        App.Render.settings();
      });
    });
  };

})(window);
