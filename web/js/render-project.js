/* ============================================================
   AOne PMO — render-project.js
   Project detail (department-wise pipeline in one view, fully
   customizable per project), All Projects table, and the
   add/edit project modal.
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var esc = App.Utils.escapeHtml;
  var S = App.Store;

  function deptCard(projectId, dept) {
    var isCompleted = dept.status === "Completed";
    var hasMeta = dept.stakeholder || dept.deadline || (typeof dept.estimatedDays === "number" && dept.estimatedDays !== null);
    var deadlineDaysLeft = dept.deadline ? App.Utils.daysUntil(dept.deadline) : null;
    var deadlineOverdue = !isCompleted && deadlineDaysLeft !== null && deadlineDaysLeft < 0;
    return (
      '<div class="dept-card glass-card ' + (isCompleted ? "dept-card-done" : "") + '" data-dept-id="' + dept.id + '" data-project-id="' + projectId + '">' +
        '<div class="dept-card-head">' +
          '<span class="dept-icon" style="background:' + esc(dept.color) + '1a;color:' + esc(dept.color) + '">' + App.Icons.get(dept.icon || "layers", { size: 16 }) + '</span>' +
          '<div class="dept-card-title">' +
            '<h4>' + esc(dept.name) + '</h4>' +
            '<span>' + esc(dept.ownerTeam || "Unassigned") + '</span>' +
          '</div>' +
          '<div class="flag-picker" role="group" aria-label="RAG flag">' +
            ["Green","Amber","Red"].map(function(f){
              return '<button type="button" class="flag-pick flag-pick-' + f.toLowerCase() + (dept.flag === f ? " active" : "") + '" data-action="set-dept-flag" data-flag="' + f + '" title="' + f + '"></button>';
            }).join("") +
          '</div>' +
        '</div>' +

        '<div class="dept-card-row">' +
          '<select class="dept-status-select" data-action="set-dept-status">' +
            App.STATUS_OPTIONS.map(function(s){ return '<option value="' + s + '"' + (dept.status===s?" selected":"") + '>' + s + '</option>'; }).join("") +
          '</select>' +
          (isCompleted ? '<span class="dept-completed-tag">' + App.Icons.get("check",{size:13}) + 'Done ' + App.Utils.formatDateShort(dept.completedOn) + '</span>' : '')  +
        '</div>' +

        '<div class="dept-progress-row">' +
          '<input type="range" min="0" max="100" step="5" value="' + (dept.percent||0) + '" class="dept-percent-slider" data-action="input-dept-percent"/>' +
          '<span class="dept-percent-value">' + (dept.percent||0) + '%</span>' +
        '</div>' +

        (hasMeta ?
          '<div class="dept-meta-row">' +
            (dept.stakeholder ? '<span class="dept-meta-item">' + App.Icons.get("user", {size:12}) + esc(dept.stakeholder) + '</span>' : '') +
            (dept.deadline ? '<span class="dept-meta-item' + (deadlineOverdue ? ' dept-meta-overdue' : '') + '">' + App.Icons.get("calendar", {size:12}) + 'Due ' + App.Utils.formatDateShort(dept.deadline) + '</span>' : '') +
            ((typeof dept.estimatedDays === "number" && dept.estimatedDays !== null) ? '<span class="dept-meta-item">' + App.Icons.get("clock", {size:12}) + 'Est. ' + dept.estimatedDays + 'd</span>' : '') +
          '</div>'
        : '') +

        '<textarea class="dept-notes" placeholder="Notes, blockers, updates…" data-action="blur-dept-notes">' + esc(dept.notes||"") + '</textarea>' +
        '<div class="dept-card-foot">' +
          '<span class="dept-updated">Updated ' + App.Utils.formatDateShort(dept.updatedAt) + '</span>' +
          '<span class="dept-card-foot-actions">' +
            (!isCompleted ? '<button type="button" class="link-btn-sm" data-action="mark-dept-complete">Mark complete</button>' : '<button type="button" class="link-btn-sm" data-action="reopen-dept">Reopen</button>') +
            '<button type="button" class="icon-btn icon-btn-xs" data-action="open-edit-project-dept" title="Edit this stage">' + App.Icons.get("edit", {size:12}) + '</button>' +
            '<button type="button" class="icon-btn icon-btn-xs icon-btn-danger" data-action="delete-project-dept" title="Remove this stage">' + App.Icons.get("trash", {size:12}) + '</button>' +
          '</span>' +
        '</div>' +
      '</div>'
    );
  }

  function fileTypeIcon(fileName) {
    var ext = (fileName.split(".").pop() || "").toLowerCase();
    if (["png","jpg","jpeg","gif","webp","bmp"].indexOf(ext) !== -1) return "image";
    if (ext === "pdf") return "file-text";
    if (["doc","docx"].indexOf(ext) !== -1) return "file-text";
    if (["xls","xlsx","csv"].indexOf(ext) !== -1) return "bar-chart";
    if (["ppt","pptx"].indexOf(ext) !== -1) return "layers";
    return "file-text";
  }

  function documentRow(projectId, doc) {
    return (
      '<div class="document-row" data-doc-id="' + doc.id + '">' +
        '<span class="document-icon">' + App.Icons.get(fileTypeIcon(doc.fileName), { size: 16 }) + '</span>' +
        '<div class="document-info">' +
          '<div class="document-name" title="' + esc(doc.fileName) + '">' + esc(doc.fileName) + '</div>' +
          '<div class="document-meta">' + App.Utils.formatFileSize(doc.size) + ' · added ' + App.Utils.formatDateShort(doc.uploadedAt) + '</div>' +
        '</div>' +
        '<div class="document-actions">' +
          '<a class="icon-btn icon-btn-xs" href="' + S.documentDownloadUrl(projectId, doc.id) + '" title="Download" download>' + App.Icons.get("download", { size: 13 }) + '</a>' +
          '<button type="button" class="icon-btn icon-btn-xs icon-btn-danger" data-action="delete-document" data-id="' + doc.id + '" title="Delete">' + App.Icons.get("trash", { size: 13 }) + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  App.Render.projectDetail = function (projectId) {
    var project = S.getProject(projectId);
    if (!project) { App.navigateTo("clients"); return; }
    var client = S.getClient(project.clientId);
    var depts = S.getOrderedProjectDepartments(projectId);
    var documents = S.getProjectDocuments(projectId);
    var progress = S.getProjectProgressPercent(projectId);
    var rag = S.getProjectRAG(projectId);
    var currentDept = S.getProjectCurrentDepartment(projectId);
    var completed = S.isProjectCompleted(projectId);
    var ragColor = rag === "Red" ? "#DC2626" : rag === "Amber" ? "#D97706" : "#16A34A";

    var daysLeft = App.Utils.daysUntil(S.getProjectDueDate(project));
    var dueBadge = "";
    if (!completed && daysLeft !== null) {
      if (daysLeft < 0) dueBadge = '<span class="chip chip-mini chip-red">' + Math.abs(daysLeft) + 'd overdue</span>';
      else if (daysLeft <= 5) dueBadge = '<span class="chip chip-mini chip-amber">Due in ' + daysLeft + 'd</span>';
    }

    var html =
      '<div class="view view-project-detail">' +
        '<button class="back-link" data-action="' + (client ? "open-client" : "nav-clients") + '" data-id="' + (client ? client.id : "") + '">' + App.Icons.get("chevron-left", {size:16}) + ' ' + (client ? esc(client.name) : "All Clients") + '</button>' +

        '<div class="project-detail-header glass-card">' +
          '<div class="project-detail-head-top">' +
            '<div>' +
              '<div class="project-detail-eyebrow">' +
                '<span class="project-code">' + esc(project.code) + '</span>' +
                App.Render.priorityChip(project.priority) +
                (completed ? '<span class="chip chip-mini chip-green">Completed</span>' : App.Render.ragBadge(rag)) +
                dueBadge +
              '</div>' +
              '<h1>' + esc(project.name) + '</h1>' +
              (client ? '<button class="project-client-link" data-action="open-client" data-id="' + client.id + '">' + App.Render.avatarHTML(client, 22) + esc(client.name) + '</button>' : '') +
            '</div>' +
            '<div class="project-detail-actions">' +
              '<button class="icon-btn" data-action="open-edit-project" data-id="' + project.id + '" title="Edit project">' + App.Icons.get("edit", {size:16}) + '</button>' +
              '<button class="icon-btn icon-btn-danger" data-action="delete-project" data-id="' + project.id + '" title="Delete project">' + App.Icons.get("trash", {size:16}) + '</button>' +
            '</div>' +
          '</div>' +

          (project.description ? '<p class="project-detail-desc">' + esc(project.description) + '</p>' : "") +

          '<div class="project-detail-stats">' +
            '<div class="pd-stat">' + App.Charts.progressRing(progress, {size:54, stroke:5, color:ragColor}) + '<div><span class="pd-stat-label">Overall Progress</span></div></div>' +
            '<div class="pd-stat-divider"></div>' +
            '<div class="pd-stat"><span class="pd-stat-value">' + (currentDept ? esc(currentDept.name) : "—") + '</span><span class="pd-stat-label">Current Stage</span></div>' +
            '<div class="pd-stat-divider"></div>' +
            '<div class="pd-stat"><span class="pd-stat-value">' + App.Utils.formatDate(project.startDate) + '</span><span class="pd-stat-label">Start Date</span></div>' +
            '<div class="pd-stat-divider"></div>' +
            '<div class="pd-stat"><span class="pd-stat-value">' + App.Utils.formatDate(project.expectedEndDate) + '</span><span class="pd-stat-label">Expected End</span></div>' +
            '<div class="pd-stat-divider"></div>' +
            '<div class="pd-stat"><span class="pd-stat-value">' + App.Utils.formatDate(project.deadlineDate) + '</span><span class="pd-stat-label">Deadline</span></div>' +
            '<div class="pd-stat-divider"></div>' +
            '<div class="pd-stat"><span class="pd-stat-value">' + App.Utils.formatCurrency(project.budget) + '</span><span class="pd-stat-label">Budget</span></div>' +
          '</div>' +

          (depts.length ? '<div class="pipeline-trace-wrap">' + App.Charts.pipelineTrace(depts, { compact: false }) + '</div>' : "") +
        '</div>' +

        (project.notes ? '<div class="glass-card notes-card"><h4>Project Notes</h4><p>' + esc(project.notes).replace(/\n/g,"<br>") + '</p></div>' : "") +

        '<div class="dash-section-head">' +
          '<h3>Department Pipeline <span class="count-pill">' + depts.length + '</span> <span class="pipeline-scope-tag">specific to this project</span></h3>' +
          '<div class="view-header-actions">' +
            '<button class="link-btn" data-action="open-add-project-dept" data-project-id="' + project.id + '">' + App.Icons.get("plus", {size:14}) + ' Add stage</button>' +
          '</div>' +
        '</div>' +

        (depts.length ?
          '<div class="dept-card-grid">' + depts.map(function(d){ return deptCard(projectId, d); }).join("") + '</div>' :
          '<div class="glass-card">' + App.Render.emptyState({
            icon: "layers", title: "No stages in this project's pipeline",
            body: "Add the stages this specific project should move through — they won't affect any other project.",
            action: "open-add-project-dept", actionLabel: "Add a stage"
          }) + '</div>'
        ) +

        '<div class="dash-section-head">' +
          '<h3>' + App.Icons.get("paperclip", {size:15}) + ' Documents <span class="count-pill">' + documents.length + '</span></h3>' +
          '<label class="link-btn file-btn">' + App.Icons.get("upload", {size:14}) + ' Upload<input type="file" id="project-document-input" multiple hidden/></label>' +
        '</div>' +

        (documents.length ?
          '<div class="glass-card documents-panel"><div class="documents-list">' + documents.map(function(d){ return documentRow(projectId, d); }).join("") + '</div></div>' :
          '<div class="glass-card">' + App.Render.emptyState({
            icon: "paperclip", title: "No documents attached yet",
            body: "Upload reports, quotations, or scanned paperwork — they're saved securely in the cloud, right alongside your data.",
            action: "upload-project-documents-empty", actionLabel: "Upload a document"
          }) + '</div>'
        ) +

      '</div>';

    document.getElementById("view-container").innerHTML = html;
    document.querySelectorAll("[data-action='open-add-project-dept']").forEach(function(btn){ btn.setAttribute("data-project-id", project.id); });
    document.querySelectorAll("[data-action='upload-project-documents']").forEach(function(btn){ btn.setAttribute("data-project-id", project.id); });
    App.Render.afterMount();
    wireDeptCards(projectId);
    wireDocuments(projectId);
  };

  function wireDocuments(projectId) {
    var fileInput = document.getElementById("project-document-input");

    function handleFiles(fileList) {
      if (!fileList || fileList.length === 0) return;
      App.Render.toast(fileList.length === 1 ? "Uploading document…" : "Uploading " + fileList.length + " documents…");
      S.uploadProjectDocuments(projectId, fileList).then(function (uploaded) {
        App.Render.toast(uploaded.length === 1 ? "Document added" : uploaded.length + " documents added");
        App.Render.projectDetail(projectId);
      }).catch(function (err) {
        App.Render.toast("Couldn't upload: " + err.message, "error");
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", function (e) {
        handleFiles(e.target.files);
        fileInput.value = "";
      });
    }

    // The empty-state's own "Upload a document" button isn't a file input
    // itself (the real one lives in the section header, always rendered)
    // -- forward its click to that hidden input. Browsers only allow a
    // file picker to open from a genuine, synchronous user click, which
    // this still is, just relayed to the real input.
    document.querySelectorAll("[data-action='upload-project-documents-empty']").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (fileInput) fileInput.click();
      });
    });

    document.querySelectorAll("[data-action='delete-document']").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var docId = btn.getAttribute("data-id");
        var doc = S.getProjectDocuments(projectId).find(function (d) { return d.id === docId; });
        if (!doc) return;
        App.Render.confirm({
          title: "Delete " + doc.fileName + "?",
          body: "This permanently removes the file. This cannot be undone.",
          confirmLabel: "Delete Document", danger: true, icon: "trash"
        }, function () {
          S.deleteProjectDocument(projectId, docId).then(function () {
            App.Render.toast("Document deleted");
            App.Render.projectDetail(projectId);
          }).catch(function (err) {
            App.Render.toast("Couldn't delete: " + err.message, "error");
          });
        });
      });
    });
  }

  function wireDeptCards(projectId) {
    document.querySelectorAll(".dept-card").forEach(function (card) {
      var deptId = card.getAttribute("data-dept-id");

      card.querySelectorAll("[data-action='set-dept-flag']").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          S.updateProjectDepartment(projectId, deptId, { flag: btn.getAttribute("data-flag") })
            .then(function () { App.Render.projectDetail(projectId); })
            .catch(function (err) { App.Render.toast("Couldn't update: " + err.message, "error"); });
        });
      });

      var statusSel = card.querySelector("[data-action='set-dept-status']");
      statusSel.addEventListener("change", function () {
        var val = statusSel.value;
        var patch = { status: val };
        if (val === "Completed") patch.percent = 100;
        if (val === "Not Started") patch.percent = 0;
        S.updateProjectDepartment(projectId, deptId, patch)
          .then(function () { App.Render.projectDetail(projectId); })
          .catch(function (err) { App.Render.toast("Couldn't update: " + err.message, "error"); App.Render.projectDetail(projectId); });
      });

      var slider = card.querySelector("[data-action='input-dept-percent']");
      var valueLabel = card.querySelector(".dept-percent-value");
      slider.addEventListener("input", function () {
        valueLabel.textContent = slider.value + "%";
      });
      slider.addEventListener("change", function () {
        var pct = parseInt(slider.value, 10);
        var patch = { percent: pct };
        if (pct === 100) patch.status = "Completed";
        else if (pct > 0) {
          var cur = S.getProjectDepartment(projectId, deptId);
          if (!cur || cur.status === "Not Started" || cur.status === "Completed") patch.status = "In Progress";
        }
        S.updateProjectDepartment(projectId, deptId, patch)
          .then(function () { App.Render.projectDetail(projectId); })
          .catch(function (err) { App.Render.toast("Couldn't update: " + err.message, "error"); App.Render.projectDetail(projectId); });
      });

      var notes = card.querySelector("[data-action='blur-dept-notes']");
      var notesOriginalValue = notes.value;
      notes.addEventListener("blur", function () {
        if (notes.value === notesOriginalValue) return; // nothing actually changed — skip the save and the toast
        S.updateProjectDepartment(projectId, deptId, { notes: notes.value })
          .then(function () { App.Render.toast("Notes saved", "success"); })
          .catch(function (err) { App.Render.toast("Couldn't save notes: " + err.message, "error"); });
      });

      var completeBtn = card.querySelector("[data-action='mark-dept-complete']");
      if (completeBtn) completeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        S.updateProjectDepartment(projectId, deptId, { status: "Completed", percent: 100, flag: "Green" })
          .then(function () {
            App.Render.projectDetail(projectId);
            App.Render.toast("Marked complete");
          })
          .catch(function (err) { App.Render.toast("Couldn't update: " + err.message, "error"); });
      });
      var reopenBtn = card.querySelector("[data-action='reopen-dept']");
      if (reopenBtn) reopenBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        S.updateProjectDepartment(projectId, deptId, { status: "In Progress" })
          .then(function () { App.Render.projectDetail(projectId); })
          .catch(function (err) { App.Render.toast("Couldn't update: " + err.message, "error"); });
      });

      var editBtn = card.querySelector("[data-action='open-edit-project-dept']");
      if (editBtn) editBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        App.Render.projectDeptFormModal(projectId, deptId);
      });
      var deleteBtn = card.querySelector("[data-action='delete-project-dept']");
      if (deleteBtn) deleteBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var dept = S.getProjectDepartment(projectId, deptId);
        if (!dept) return;
        App.Render.confirm({
          title: "Remove " + dept.name + "?",
          body: "This removes the stage from this project only — no other project is affected. This cannot be undone.",
          confirmLabel: "Remove Stage", danger: true, icon: "trash"
        }, function () {
          S.deleteProjectDepartment(projectId, deptId)
            .then(function () {
              App.Render.toast("Stage removed");
              App.Render.projectDetail(projectId);
            })
            .catch(function (err) { App.Render.toast("Couldn't remove stage: " + err.message, "error"); });
        });
      });
    });
  }

  /* ---------- Add / Edit a department WITHIN one project ---------- */

  var PROJECT_DEPT_ICON_CHOICES = ["search","handshake","package","calendar","clipboard-check","wrench","life-buoy","receipt","bar-chart","layers","briefcase","zap","building","rocket","inbox","activity"];

  App.Render.projectDeptFormModal = function (projectId, existingDeptId) {
    var dept = existingDeptId ? S.getProjectDepartment(projectId, existingDeptId) : null;
    var isEdit = !!dept;
    var color = dept ? dept.color : App.PALETTE[S.getOrderedProjectDepartments(projectId).length % App.PALETTE.length];
    var icon = dept ? (dept.icon || "layers") : "layers";

    var html =
      '<form id="proj-dept-form" class="modal-body">' +
        '<h3>' + (isEdit ? "Edit Stage" : "Add a Stage") + '</h3>' +
        '<p class="field-hint">This only changes the pipeline for this one project.</p>' +
        '<div class="field-grid">' +
          '<label class="field field-full"><span>Name *</span><input type="text" id="pdf-name" required value="' + (dept ? esc(dept.name) : "") + '" placeholder="e.g. Quality Audit"/></label>' +
          '<label class="field field-full"><span>Owning team</span><input type="text" id="pdf-owner" value="' + (dept ? esc(dept.ownerTeam) : "") + '" placeholder="e.g. Field, Engineering, Finance"/></label>' +
        '</div>' +
        '<div class="field-grid">' +
          '<label class="field field-full"><span>Stakeholder <em>(person responsible)</em></span><input type="text" id="pdf-stakeholder" value="' + (dept ? esc(dept.stakeholder) : "") + '" placeholder="e.g. Rajesh Kumar"/></label>' +
          '<label class="field"><span>Deadline</span><input type="date" id="pdf-deadline" value="' + (dept && dept.deadline ? dept.deadline : "") + '"/></label>' +
          '<label class="field"><span>Est. days to complete</span><input type="number" id="pdf-estimated-days" min="0" step="1" value="' + (dept && typeof dept.estimatedDays === "number" ? dept.estimatedDays : "") + '" placeholder="e.g. 5"/></label>' +
        '</div>' +
        '<label class="field"><span>Color</span></label>' +
        '<div class="color-swatch-row" id="pdf-color-swatches">' +
          App.PALETTE.map(function(c){ return '<button type="button" class="color-swatch ' + (color===c?"active":"") + '" style="background:' + c + '" data-color="' + c + '"></button>'; }).join("") +
        '</div>' +
        '<input type="hidden" id="pdf-color-value" value="' + esc(color) + '"/>' +
        '<label class="field"><span>Icon</span></label>' +
        '<div class="icon-picker-row" id="pdf-icon-picker">' +
          PROJECT_DEPT_ICON_CHOICES.map(function(ic){ return '<button type="button" class="icon-pick ' + (icon===ic?"active":"") + '" data-icon="' + ic + '">' + App.Icons.get(ic,{size:16}) + '</button>'; }).join("") +
        '</div>' +
        '<input type="hidden" id="pdf-icon-value" value="' + esc(icon) + '"/>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">' + App.Icons.get("check",{size:15}) + '<span>' + (isEdit ? "Save Changes" : "Add Stage") + '</span></button>' +
        '</div>' +
      '</form>';

    App.Render.openModal(html, { className: "modal-md" });

    document.querySelectorAll("#pdf-color-swatches .color-swatch").forEach(function (sw) {
      sw.addEventListener("click", function () {
        document.querySelectorAll("#pdf-color-swatches .color-swatch").forEach(function (s) { s.classList.remove("active"); });
        sw.classList.add("active");
        document.getElementById("pdf-color-value").value = sw.getAttribute("data-color");
      });
    });
    document.querySelectorAll("#pdf-icon-picker .icon-pick").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#pdf-icon-picker .icon-pick").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        document.getElementById("pdf-icon-value").value = btn.getAttribute("data-icon");
      });
    });

    document.getElementById("proj-dept-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var estDaysRaw = document.getElementById("pdf-estimated-days").value;
      var payload = {
        name: document.getElementById("pdf-name").value.trim() || "New Stage",
        ownerTeam: document.getElementById("pdf-owner").value.trim(),
        stakeholder: document.getElementById("pdf-stakeholder").value.trim(),
        deadline: document.getElementById("pdf-deadline").value || null,
        estimatedDays: estDaysRaw === "" ? null : Math.max(0, parseInt(estDaysRaw, 10) || 0),
        color: document.getElementById("pdf-color-value").value,
        icon: document.getElementById("pdf-icon-value").value
      };
      App.Render.closeModal();
      var action = isEdit ? S.updateProjectDepartment(projectId, dept.id, payload) : S.addProjectDepartment(projectId, payload);
      action.then(function () {
        App.Render.toast(isEdit ? "Stage updated" : "Stage added");
        App.Render.projectDetail(projectId);
      }).catch(function (err) {
        console.error("AOne PMO: saving project stage failed", err);
        App.Render.toast("Couldn't save that stage — try again.", "error");
        App.Render.projectDetail(projectId);
      });
    });
  };

  /* ---------- All Projects (cross-client table) ---------- */

  App.Render.allProjects = function (opts) {
    opts = opts || {};
    var initialRag = opts.rag && App.FLAG_OPTIONS.indexOf(opts.rag) !== -1 ? opts.rag : "all";
    var flat = S.getAllProjectsFlat().sort(function (a, b) { return new Date(b.project.createdAt) - new Date(a.project.createdAt); });

    var html =
      '<div class="view view-all-projects">' +
        '<div class="view-header">' +
          '<div>' +
            '<div class="eyebrow">Every engagement</div>' +
            '<h1>All Projects</h1>' +
            '<p class="view-subtitle">' + flat.length + ' project' + (flat.length===1?"":"s") + ' across every client</p>' +
          '</div>' +
          '<div class="view-header-actions">' +
            '<div class="search-box"><span>' + App.Icons.get("search", {size:15}) + '</span><input type="text" id="proj-search" placeholder="Search projects or clients…"/></div>' +
            '<button class="btn btn-primary" data-action="open-add-project">' + App.Icons.get("plus", { size: 16 }) + '<span>New Project</span></button>' +
          '</div>' +
        '</div>' +

        '<div class="filter-bar">' +
          '<button class="filter-chip' + (initialRag==="all"?" active":"") + '" data-filter-rag="all">All</button>' +
          '<button class="filter-chip' + (initialRag==="Green"?" active":"") + '" data-filter-rag="Green"><span class="flag-dot flag-green"></span>On Track</button>' +
          '<button class="filter-chip' + (initialRag==="Amber"?" active":"") + '" data-filter-rag="Amber"><span class="flag-dot flag-amber"></span>At Risk</button>' +
          '<button class="filter-chip' + (initialRag==="Red"?" active":"") + '" data-filter-rag="Red"><span class="flag-dot flag-red"></span>Delayed</button>' +
        '</div>' +

        (flat.length ?
          '<div class="projects-table-wrap glass-card">' +
            '<table class="projects-table" id="projects-table">' +
              '<thead><tr><th>Project</th><th>Client</th><th>Stage</th><th>Progress</th><th>Status</th><th>Due</th><th>Budget</th></tr></thead>' +
              '<tbody>' +
                flat.map(function (row) {
                  var p = row.project;
                  var ragColor = row.rag === "Red" ? "#DC2626" : row.rag === "Amber" ? "#D97706" : "#16A34A";
                  return (
                    '<tr data-action="open-project" data-id="' + p.id + '" data-rag="' + row.rag + '" data-search="' + esc((p.name + " " + (row.client?row.client.name:"")).toLowerCase()) + '">' +
                      '<td><span class="project-code">' + esc(p.code) + '</span> ' + esc(p.name) + '</td>' +
                      '<td>' + (row.client ? ('<span class="table-client">' + App.Render.avatarHTML(row.client, 22) + esc(row.client.name) + '</span>') : "—") + '</td>' +
                      '<td>' + (row.currentDepartment ? esc(row.currentDepartment.name) : "—") + '</td>' +
                      '<td><div class="table-progress"><div class="table-progress-track"><div class="table-progress-fill" style="width:' + row.progressPercent + '%;background:' + ragColor + '"></div></div><span>' + row.progressPercent + '%</span></div></td>' +
                      '<td>' + (row.completed ? '<span class="chip chip-mini chip-green">Completed</span>' : App.Render.ragBadge(row.rag)) + '</td>' +
                      '<td>' + App.Utils.formatDateShort(S.getProjectDueDate(p)) + '</td>' +
                      '<td>' + App.Utils.formatCurrency(p.budget) + '</td>' +
                    '</tr>'
                  );
                }).join("") +
              '</tbody>' +
            '</table>' +
          '</div>' :
          App.Render.emptyState({
            icon: "projects", title: "No projects yet",
            body: "Add a client first, then create their first project to see it here.",
            action: "open-add-project", actionLabel: "New project"
          })
        ) +
      '</div>';

    document.getElementById("view-container").innerHTML = html;
    App.Render.afterMount();

    var searchEl = document.getElementById("proj-search");
    var activeRag = initialRag;
    function applyFilters() {
      var q = searchEl ? searchEl.value.trim().toLowerCase() : "";
      document.querySelectorAll("#projects-table tbody tr").forEach(function (tr) {
        var matchesSearch = !q || tr.getAttribute("data-search").indexOf(q) !== -1;
        var matchesRag = activeRag === "all" || tr.getAttribute("data-rag") === activeRag;
        tr.style.display = (matchesSearch && matchesRag) ? "" : "none";
      });
    }
    if (initialRag !== "all") applyFilters();
    if (searchEl) searchEl.addEventListener("input", App.Utils.debounce(applyFilters, 140));
    document.querySelectorAll(".filter-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        activeRag = chip.getAttribute("data-filter-rag");
        applyFilters();
      });
    });
  };

  /* ---------- Add / Edit project modal ---------- */

  App.Render.projectFormModal = function (existingId, presetClientId) {
    var project = existingId ? S.getProject(existingId) : null;
    var isEdit = !!project;
    var clients = S.data.clients.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
    var selectedClientId = project ? project.clientId : (presetClientId || (clients[0] && clients[0].id) || "");

    if (clients.length === 0) {
      App.Render.openModal(
        '<div class="modal-body confirm-body">' +
          '<div class="confirm-icon">' + App.Icons.get("clients", {size:22}) + '</div>' +
          '<h3>Add a client first</h3>' +
          '<p>Projects belong to a client. Add your first client, then create their project.</p>' +
          '<div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="open-add-client">Add Client</button></div>' +
        '</div>', { className: "modal-sm" }
      );
      return;
    }

    var templateCount = S.getOrderedTemplate().length;

    var html =
      '<form id="project-form" class="modal-body">' +
        '<h3>' + (isEdit ? "Edit Project" : "New Project") + '</h3>' +
        '<div class="field-grid">' +
          '<label class="field field-full"><span>Project name *</span><input type="text" id="pf-name" required value="' + (project ? esc(project.name) : "") + '" placeholder="e.g. Cold Room IoT Rollout — Phase 2"/></label>' +
          '<label class="field"><span>Client *</span><select id="pf-client">' + App.Render.selectOptions(clients.map(function(c){return {value:c.id,label:c.name};}), selectedClientId) + '</select></label>' +
          '<label class="field"><span>Priority</span><select id="pf-priority">' + App.Render.selectOptions(App.PRIORITY_OPTIONS, project ? project.priority : "Medium") + '</select></label>' +
          '<label class="field"><span>Start date</span><input type="date" id="pf-start" value="' + (project && project.startDate ? project.startDate : "") + '"/></label>' +
          '<label class="field"><span>Expected end date</span><input type="date" id="pf-end" value="' + (project && project.expectedEndDate ? project.expectedEndDate : "") + '"/></label>' +
          '<label class="field"><span>Deadline <em>(optional)</em></span><input type="date" id="pf-deadline" value="' + (project && project.deadlineDate ? project.deadlineDate : "") + '"/></label>' +
          '<label class="field"><span>Budget <em>(optional, ₹)</em></span><input type="number" id="pf-budget" min="0" step="1" value="' + (project && typeof project.budget === "number" ? project.budget : "") + '" placeholder="e.g. 500000"/></label>' +
          (isEdit ? '<label class="field"><span>Actual end date</span><input type="date" id="pf-actual-end" value="' + (project && project.actualEndDate ? project.actualEndDate : "") + '"/></label>' : '') +
          (isEdit ? '<label class="field"><span>RAG override</span><select id="pf-rag">' + App.Render.selectOptions(["Auto"].concat(App.FLAG_OPTIONS), project ? project.ragOverride : "Auto") + '</select></label>' : '') +
        '</div>' +
        '<p class="field-hint">Deadline is a hard commitment date — if set, it is used for overdue/due-soon warnings instead of the expected end date.</p>' +
        '<label class="field"><span>Description</span><textarea id="pf-desc" rows="2" placeholder="What is this engagement about?">' + (project ? esc(project.description) : "") + '</textarea></label>' +
        '<label class="field"><span>Notes</span><textarea id="pf-notes" rows="2" placeholder="Internal notes…">' + (project ? esc(project.notes) : "") + '</textarea></label>' +
        (!isEdit ? '<p class="field-hint">This project starts with the default pipeline (' + templateCount + ' stage' + (templateCount===1?"":"s") + ') — fully editable afterward, just for this project.</p>' : '') +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">' + App.Icons.get("check", {size:15}) + '<span>' + (isEdit ? "Save Changes" : "Create Project") + '</span></button>' +
        '</div>' +
      '</form>';

    App.Render.openModal(html, { className: "modal-md" });

    document.getElementById("project-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var budgetRaw = document.getElementById("pf-budget").value;
      var payload = {
        name: document.getElementById("pf-name").value.trim() || "Untitled Project",
        clientId: document.getElementById("pf-client").value,
        priority: document.getElementById("pf-priority").value,
        startDate: document.getElementById("pf-start").value || null,
        expectedEndDate: document.getElementById("pf-end").value || null,
        deadlineDate: document.getElementById("pf-deadline").value || null,
        budget: budgetRaw === "" ? null : Math.max(0, parseFloat(budgetRaw) || 0),
        description: document.getElementById("pf-desc").value.trim(),
        notes: document.getElementById("pf-notes").value.trim()
      };
      if (isEdit) {
        var actualEndEl = document.getElementById("pf-actual-end");
        var ragEl = document.getElementById("pf-rag");
        if (actualEndEl) payload.actualEndDate = actualEndEl.value || null;
        if (ragEl) payload.ragOverride = ragEl.value;
      }
      // Close the modal before mutating, so the UI always feels responsive
      // to the click even in the unlikely case the save step below throws.
      App.Render.closeModal();
      if (isEdit) {
        S.updateProject(project.id, payload).then(function () {
          App.Render.toast("Project updated");
          App.navigateTo("project-detail", { id: project.id });
        }).catch(function (err) {
          console.error("AOne PMO: saving project failed", err);
          App.Render.toast("Couldn't save that project — try again.", "error");
        });
      } else {
        S.addProject(payload).then(function (created) {
          App.Render.toast("Project created");
          App.navigateTo("project-detail", { id: created.id });
        }).catch(function (err) {
          console.error("AOne PMO: saving project failed", err);
          App.Render.toast("Couldn't save that project — try again.", "error");
        });
      }
    });
  };

})(window);
