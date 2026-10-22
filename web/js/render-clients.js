/* ============================================================
   AOne PMO — render-clients.js
   Clients grid, client detail, add/edit client modal.
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var esc = App.Utils.escapeHtml;
  var S = App.Store;

  function clientCard(client) {
    var projects = S.getClientProjects(client.id);
    var progress = S.getClientProgressPercent(client.id);
    var rag = S.getClientRAG(client.id);
    var ragColor = rag === "Red" ? "#DC2626" : rag === "Amber" ? "#D97706" : "#16A34A";
    return (
      '<div class="client-card glass-card" data-action="open-client" data-id="' + client.id + '">' +
        '<div class="client-card-top">' +
          App.Render.avatarHTML(client, 56) +
          App.Render.ragBadge(rag) +
        '</div>' +
        '<h3 class="client-card-name">' + esc(client.name) + '</h3>' +
        '<p class="client-card-company">' + esc(client.industry || "—") + '</p>' +
        '<div class="client-card-foot">' +
          '<div class="client-card-stat"><span class="num">' + projects.length + '</span><span class="lbl">Project' + (projects.length===1?"":"s") + '</span></div>' +
          App.Charts.progressRing(progress, { size: 46, stroke: 4, color: ragColor }) +
        '</div>' +
      '</div>'
    );
  }

  App.Render.clients = function () {
    var clients = S.data.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html =
      '<div class="view view-clients">' +
        '<div class="view-header">' +
          '<div>' +
            '<div class="eyebrow">Accounts</div>' +
            '<h1>Clients</h1>' +
            '<p class="view-subtitle">' + clients.length + ' client' + (clients.length===1?"":"s") + ' under management</p>' +
          '</div>' +
          '<div class="view-header-actions">' +
            '<div class="search-box"><span>' + App.Icons.get("search", {size:15}) + '</span><input type="text" id="client-search" placeholder="Search clients…"/></div>' +
            '<button class="btn btn-primary" data-action="open-add-client">' + App.Icons.get("plus", { size: 16 }) + '<span>Add Client</span></button>' +
          '</div>' +
        '</div>' +
        (clients.length ?
          '<div class="client-grid" id="client-grid">' + clients.map(clientCard).join("") + '</div>' :
          App.Render.emptyState({
            icon: "clients", title: "No clients yet",
            body: "Every project lives under a client. Add your first one to get moving.",
            action: "open-add-client", actionLabel: "Add your first client"
          })
        ) +
      '</div>';
    document.getElementById("view-container").innerHTML = html;
    App.Render.afterMount();

    var searchEl = document.getElementById("client-search");
    if (searchEl) {
      searchEl.addEventListener("input", App.Utils.debounce(function () {
        var q = searchEl.value.trim().toLowerCase();
        var grid = document.getElementById("client-grid");
        if (!grid) return;
        grid.querySelectorAll(".client-card").forEach(function (card) {
          var id = card.getAttribute("data-id");
          var client = S.getClient(id);
          var hay = (client.name + " " + client.industry).toLowerCase();
          card.style.display = hay.indexOf(q) === -1 ? "none" : "";
        });
      }, 140));
    }
  };

  function projectRowCard(project) {
    var progress = S.getProjectProgressPercent(project.id);
    var rag = S.getProjectRAG(project.id);
    var currentDept = S.getProjectCurrentDepartment(project.id);
    var completed = S.isProjectCompleted(project.id);
    return (
      '<div class="project-row glass-card" data-action="open-project" data-id="' + project.id + '">' +
        '<div class="project-row-main">' +
          '<div class="project-row-top">' +
            '<span class="project-code">' + esc(project.code) + '</span>' +
            App.Render.priorityChip(project.priority) +
            (completed ? '<span class="chip chip-mini chip-green">Completed</span>' : App.Render.ragBadge(rag)) +
          '</div>' +
          '<h4>' + esc(project.name) + '</h4>' +
          '<div class="project-row-meta">' +
            (currentDept ? ('<span>' + App.Icons.get(currentDept.icon || "layers", {size:13}) + esc(currentDept.name) + '</span>') : "") +
            (S.getProjectDueDate(project) ? ('<span>' + App.Icons.get("calendar", {size:13}) + 'Due ' + App.Utils.formatDate(S.getProjectDueDate(project)) + '</span>') : "") +
            (typeof project.budget === "number" && project.budget !== null ? ('<span>' + App.Icons.get("receipt", {size:13}) + App.Utils.formatCurrency(project.budget) + '</span>') : "") +
          '</div>' +
        '</div>' +
        '<div class="project-row-progress">' +
          App.Charts.progressRing(progress, { size: 50, stroke: 5, color: rag === "Red" ? "#DC2626" : rag === "Amber" ? "#D97706" : "#16A34A" }) +
        '</div>' +
      '</div>'
    );
  }

  App.Render.clientDetail = function (clientId) {
    var client = S.getClient(clientId);
    if (!client) { App.navigateTo("clients"); return; }
    var projects = S.getClientProjects(clientId).sort(function(a,b){ return new Date(b.createdAt) - new Date(a.createdAt); });
    var progress = S.getClientProgressPercent(clientId);
    var rag = S.getClientRAG(clientId);

    var html =
      '<div class="view view-client-detail">' +
        '<button class="back-link" data-action="nav-clients">' + App.Icons.get("chevron-left", {size:16}) + ' All Clients</button>' +

        '<div class="client-detail-header glass-card">' +
          App.Render.avatarHTML(client, 84, { className: "avatar-xl" }) +
          '<div class="client-detail-info">' +
            '<div class="client-detail-title-row">' +
              '<h1>' + esc(client.name) + '</h1>' +
              App.Render.ragBadge(rag) +
            '</div>' +
            '<p class="client-detail-company">' + esc(client.industry || "") + '</p>' +
            '<div class="client-detail-contacts">' +
              (client.email ? ('<span>' + App.Icons.get("mail", {size:13}) + esc(client.email) + '</span>') : "") +
              (client.phone ? ('<span>' + App.Icons.get("phone", {size:13}) + esc(client.phone) + '</span>') : "") +
            '</div>' +
          '</div>' +
          '<div class="client-detail-progress">' +
            App.Charts.progressRing(progress, { size: 72, stroke: 6, color: rag === "Red" ? "#DC2626" : rag === "Amber" ? "#D97706" : "#16A34A" }) +
            '<span class="client-detail-progress-label">Overall</span>' +
          '</div>' +
          '<div class="client-detail-actions">' +
            '<button class="icon-btn" data-action="open-edit-client" data-id="' + client.id + '" title="Edit client">' + App.Icons.get("edit", {size:16}) + '</button>' +
            '<button class="icon-btn icon-btn-danger" data-action="delete-client" data-id="' + client.id + '" title="Delete client">' + App.Icons.get("trash", {size:16}) + '</button>' +
          '</div>' +
        '</div>' +

        (client.notes ? '<div class="glass-card notes-card"><h4>Notes</h4><p>' + esc(client.notes).replace(/\n/g,"<br>") + '</p></div>' : "") +

        '<div class="dash-section-head">' +
          '<h3>Projects <span class="count-pill">' + projects.length + '</span></h3>' +
          '<button class="btn btn-primary btn-sm" data-action="open-add-project" data-client-id="' + client.id + '">' + App.Icons.get("plus", {size:14}) + '<span>Add Project</span></button>' +
        '</div>' +

        (projects.length ?
          '<div class="project-row-list">' + projects.map(projectRowCard).join("") + '</div>' :
          App.Render.emptyState({
            icon: "projects", title: "No projects yet for " + client.name,
            body: "Start their first engagement and it'll flow through the AOne pipeline automatically.",
            action: "open-add-project", actionLabel: "Add first project"
          })
        ) +
      '</div>';

    document.getElementById("view-container").innerHTML = html;
    App.Render.afterMount();
  };

  /* ---------- Add / Edit client modal ---------- */

  App.Render.clientFormModal = function (existingId) {
    var client = existingId ? S.getClient(existingId) : null;
    var isEdit = !!client;
    var html =
      '<form id="client-form" class="modal-body">' +
        '<h3>' + (isEdit ? "Edit Client" : "Add a New Client") + '</h3>' +
        '<div class="photo-upload-row">' +
          '<div class="photo-preview" id="client-photo-preview">' +
            (client && client.hasPhoto ? '<img src="' + S.clientPhotoUrl(client.id) + '"/>' : App.Icons.get("camera", { size: 22 })) +
          '</div>' +
          '<div>' +
            '<label class="btn btn-ghost btn-sm file-btn">' + App.Icons.get("upload", {size:14}) + '<span>Upload photo</span><input type="file" id="client-photo-input" accept="image/*" hidden/></label>' +
            '<p class="field-hint">Square image works best. Optional.</p>' +
          '</div>' +
        '</div>' +

        '<div class="field-grid">' +
          '<label class="field field-full"><span>Client name *</span><input type="text" id="cf-name" required value="' + (client ? esc(client.name) : "") + '" placeholder="e.g. Hatsun Agro"/></label>' +
          (!isEdit ? '<label class="field field-full"><span>First project name <em>(optional)</em></span><input type="text" id="cf-first-project" placeholder="e.g. Cold Room IoT Rollout — start it right away"/></label>' : '') +
          '<label class="field"><span>Industry</span><input type="text" id="cf-industry" value="' + (client ? esc(client.industry) : "") + '" placeholder="e.g. FMCG, Retail, Cold Chain"/></label>' +
          '<label class="field"><span>Email</span><input type="email" id="cf-email" value="' + (client ? esc(client.email) : "") + '" placeholder="contact@client.com"/></label>' +
          '<label class="field"><span>Phone</span><input type="text" id="cf-phone" value="' + (client ? esc(client.phone) : "") + '" placeholder="+91…"/></label>' +
        '</div>' +
        '<label class="field"><span>Notes</span><textarea id="cf-notes" rows="3" placeholder="Anything worth remembering about this account…">' + (client ? esc(client.notes) : "") + '</textarea></label>' +

        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">' + App.Icons.get("check", {size:15}) + '<span>' + (isEdit ? "Save Changes" : "Add Client") + '</span></button>' +
        '</div>' +
      '</form>';

    App.Render.openModal(html, { className: "modal-md" });

    // The chosen photo is held as a Blob (not uploaded yet) until the form
    // actually submits -- a new client doesn't have an id to upload a
    // photo to until it's created, and for an edit, there's no reason to
    // touch the photo endpoint at all if it wasn't changed.
    var pendingPhotoBlob = null;
    var photoInput = document.getElementById("client-photo-input");
    photoInput.addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      Promise.all([
        App.Export.readImageFile(file, 300, 0.82),
        App.Export.readImageFileAsBlob(file, 300, 0.82)
      ]).then(function (results) {
        document.getElementById("client-photo-preview").innerHTML = '<img src="' + results[0] + '"/>';
        pendingPhotoBlob = results[1];
      }).catch(function () {
        App.Render.toast("Couldn't read that image. Try a different file.", "error");
      });
    });

    document.getElementById("client-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var submitBtn = e.target.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      var payload = {
        name: document.getElementById("cf-name").value.trim() || "Untitled Client",
        industry: document.getElementById("cf-industry").value.trim(),
        email: document.getElementById("cf-email").value.trim(),
        phone: document.getElementById("cf-phone").value.trim(),
        notes: document.getElementById("cf-notes").value.trim()
      };
      var firstProjectEl = document.getElementById("cf-first-project");
      var firstProjectName = firstProjectEl ? firstProjectEl.value.trim() : "";
      App.Render.closeModal();

      function uploadPendingPhoto(clientId) {
        return pendingPhotoBlob ? S.uploadClientPhoto(clientId, pendingPhotoBlob) : Promise.resolve();
      }

      if (isEdit) {
        S.updateClient(client.id, payload)
          .then(function () { return uploadPendingPhoto(client.id); })
          .then(function () {
            App.Render.toast("Client updated");
            App.Render.refreshCurrentView();
          })
          .catch(function (err) {
            console.error("AOne PMO: saving client failed", err);
            App.Render.toast("Couldn't save that client — try again.", "error");
          });
      } else {
        var createdClient;
        S.addClient(payload)
          .then(function (created) {
            createdClient = created;
            return uploadPendingPhoto(created.id);
          })
          .then(function () {
            if (firstProjectName) {
              return S.addProject({ clientId: createdClient.id, name: firstProjectName }).then(function (proj) {
                App.Render.toast("Client and first project added");
                App.navigateTo("project-detail", { id: proj.id });
              });
            } else {
              App.Render.toast("Client added");
              App.navigateTo("client-detail", { id: createdClient.id });
            }
          })
          .catch(function (err) {
            console.error("AOne PMO: saving client failed", err);
            App.Render.toast("Couldn't save that client — try again.", "error");
          });
      }
    });
  };

})(window);
