/* ============================================================
   AOne PMO — render-dashboard.js
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var esc = App.Utils.escapeHtml;
  var S = App.Store;

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  function kpiCard(icon, label, value, opts) {
    opts = opts || {};
    return (
      '<div class="kpi-card glass-card' + (opts.accent ? " kpi-accent" : "") + '">' +
        '<div class="kpi-icon" style="' + (opts.iconColor ? "color:" + opts.iconColor + ";background:" + opts.iconColor + "1a;" : "") + '">' + App.Icons.get(icon, { size: 19 }) + '</div>' +
        '<div class="kpi-value' + (opts.format === "currency" ? " kpi-value-currency" : "") + '" data-count-to="' + value + '"' + (opts.format ? ' data-count-format="' + opts.format + '"' : '') + '>0</div>' +
        '<div class="kpi-label">' + esc(label) + '</div>' +
      '</div>'
    );
  }

  function flaggedRow(item) {
    var dept = item.department;
    var flagLabel = dept.status === "Blocked" ? "Blocked" : (dept.flag + " flag");
    var flagClass = dept.status === "Blocked" ? "red" : dept.flag.toLowerCase();
    return (
      '<div class="flagged-row" data-action="open-project" data-id="' + item.project.id + '">' +
        '<span class="flag-dot flag-' + flagClass + '"></span>' +
        '<div class="flagged-main">' +
          '<div class="flagged-title">' + esc(item.project.name) + '<span class="flagged-dept"> · ' + esc(dept.name) + '</span></div>' +
          '<div class="flagged-sub">' + esc(item.client ? item.client.name : "Unknown client") + '</div>' +
        '</div>' +
        '<span class="chip chip-mini chip-' + flagClass + '">' + esc(flagLabel) + '</span>' +
      '</div>'
    );
  }

  function activityRow(item) {
    var dept = item.department;
    var when = App.Utils.formatDateShort(dept.updatedAt);
    return (
      '<div class="activity-row" data-action="open-project" data-id="' + item.project.id + '">' +
        '<span class="activity-dot" style="background:' + esc(dept.color || "#3B4FF0") + '"></span>' +
        '<div class="activity-main">' +
          '<div class="activity-title"><strong>' + esc(item.project.name) + '</strong> · ' + esc(dept.name) + '</div>' +
          '<div class="activity-sub">' + esc(item.client ? item.client.name : "") + ' — marked ' + esc(dept.status) + (dept.percent ? " (" + dept.percent + "%)" : "") + '</div>' +
        '</div>' +
        '<span class="activity-time">' + when + '</span>' +
      '</div>'
    );
  }

  function clientPreviewCard(client) {
    var progress = S.getClientProgressPercent(client.id);
    var projectCount = S.getClientProjects(client.id).length;
    var rag = S.getClientRAG(client.id);
    return (
      '<div class="client-mini-card glass-card" data-action="open-client" data-id="' + client.id + '">' +
        App.Render.avatarHTML(client, 44) +
        '<div class="client-mini-info">' +
          '<div class="client-mini-name">' + esc(client.name) + '</div>' +
          '<div class="client-mini-sub">' + projectCount + ' project' + (projectCount === 1 ? "" : "s") + '</div>' +
        '</div>' +
        App.Charts.progressRing(progress, { size: 40, stroke: 4, showLabel: false, color: rag === "Red" ? "#DC2626" : rag === "Amber" ? "#D97706" : "#16A34A" }) +
      '</div>'
    );
  }

  App.Render.dashboard = function () {
    var stats = S.getStats();
    var flagged = S.getFlaggedItems();
    var activity = S.getRecentActivity(6);
    var workload = S.getDepartmentWorkload();
    var clients = S.data.clients.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 4);
    var ws = S.data.workspace;

    var html =
      '<div class="view view-dashboard">' +

        '<div class="view-header">' +
          '<div>' +
            '<div class="eyebrow">' + esc(App.Utils.formatDate(new Date())) + '</div>' +
            '<h1>' + greeting() + (S.currentUser && S.currentUser.name ? ", " + esc(S.currentUser.name.split(" ")[0]) : "") + '.</h1>' +
            '<p class="view-subtitle">Here is the full ' + esc(ws.name) + ' pipeline, live.</p>' +
          '</div>' +
          '<div class="view-header-actions">' +
            '<button class="btn btn-ghost" data-action="open-add-client">' + App.Icons.get("plus", { size: 16 }) + '<span>Client</span></button>' +
            '<button class="btn btn-primary" data-action="open-add-project">' + App.Icons.get("plus", { size: 16 }) + '<span>New Project</span></button>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-strip">' +
          kpiCard("clients", "Total Clients", stats.totalClients) +
          kpiCard("briefcase", "Active Projects", stats.active, { accent: true, iconColor: "#3B4FF0" }) +
          kpiCard("check", "Completed", stats.completed, { iconColor: "#16A34A" }) +
          kpiCard("alert-triangle", "Overdue", stats.overdue, { iconColor: stats.overdue ? "#DC2626" : "#64748B" }) +
          kpiCard("receipt", "Budget", stats.totalBudget, { iconColor: "#8B5CF6", format: "currency" }) +
        '</div>' +

        '<div class="dash-grid">' +

          '<div class="glass-card panel panel-rag">' +
            '<div class="panel-head"><h3>Program Health</h3><span class="panel-sub">RAG distribution</span></div>' +
            '<div class="rag-donut-wrap">' +
              App.Charts.ragDonut({ green: stats.green, amber: stats.amber, red: stats.red }) +
              '<div class="rag-legend">' +
                '<button type="button" class="rag-legend-item" data-action="nav-all-projects-filtered" data-rag="Green"><span class="flag-dot flag-green"></span>On Track <b>' + stats.green + '</b></button>' +
                '<button type="button" class="rag-legend-item" data-action="nav-all-projects-filtered" data-rag="Amber"><span class="flag-dot flag-amber"></span>At Risk <b>' + stats.amber + '</b></button>' +
                '<button type="button" class="rag-legend-item" data-action="nav-all-projects-filtered" data-rag="Red"><span class="flag-dot flag-red"></span>Delayed <b>' + stats.red + '</b></button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="glass-card panel panel-workload">' +
            '<div class="panel-head"><h3>Pipeline Load</h3><span class="panel-sub">Active work per department</span></div>' +
            (workload.some(function(w){return w.activeCount>0;}) ?
              '<div class="bar-list">' + App.Charts.barList(workload) + '</div>' :
              App.Render.emptyState({ icon: "layers", title: "No active work yet", body: "Once projects move through departments, load shows up here." })
            ) +
          '</div>' +

        '</div>' +

        '<div class="dash-grid dash-grid-2">' +

          '<div class="glass-card panel panel-flagged">' +
            '<div class="panel-head"><h3>' + App.Icons.get("flag", {size:15}) + ' Needs Attention</h3><span class="panel-sub">' + flagged.length + ' flagged</span></div>' +
            '<div class="flagged-list">' +
              (flagged.length ? flagged.slice(0, 6).map(flaggedRow).join("") :
                '<div class="all-clear"><span class="flag-dot flag-green"></span>Everything is on track. Nothing flagged right now.</div>')  +
            '</div>' +
          '</div>' +

          '<div class="glass-card panel panel-activity">' +
            '<div class="panel-head"><h3>Recent Activity</h3></div>' +
            '<div class="activity-list">' +
              (activity.length ? activity.map(activityRow).join("") :
                App.Render.emptyState({ icon: "activity", title: "No activity yet", body: "Updates to project stages will show up here." })) +
            '</div>' +
          '</div>' +

        '</div>' +

        '<div class="dash-section-head">' +
          '<h3>Recent Clients</h3>' +
          '<button class="link-btn" data-action="nav-clients">View all ' + App.Icons.get("arrow-up-right", { size: 14 }) + '</button>' +
        '</div>' +
        (clients.length ?
          '<div class="client-mini-grid">' + clients.map(clientPreviewCard).join("") + '</div>' :
          App.Render.emptyState({
            icon: "clients", title: "No clients yet",
            body: "Add your first client to start tracking projects against the AOne pipeline.",
            action: "open-add-client", actionLabel: "Add a client"
          })
        ) +

      '</div>';

    document.getElementById("view-container").innerHTML = html;
    App.Render.afterMount();
  };

})(window);
