/* ============================================================
   AOne PMO — store.js (cloud/web edition)
   Same in-memory data shape and the same read/computation logic
   as the desktop version (RAG rollup, stats, flagged items,
   workload, recent activity, due-date priority) -- only the
   persistence layer changed: every write now calls the REST API
   instead of localStorage, and each returns a Promise instead of
   a plain value. Read methods stay fully synchronous since they
   just work off Store.data, already loaded in memory.
   ============================================================ */

(function (window) {
  "use strict";
  var App = window.App = window.App || {};

  /* Plain calendar dates ("2026-10-22", as the API returns them) are parsed
     as LOCAL midnight. new Date("2026-10-22") alone means UTC midnight, which
     is the previous evening in the Americas and shifts the shown day. */
  function parseDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    if (typeof value === "string") {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    }
    return new Date(value);
  }

  var Utils = {
    parseDate: parseDate,
    uid: function (prefix) {
      var rand = Math.random().toString(36).slice(2, 8);
      var time = Date.now().toString(36).slice(-5);
      return (prefix || "id") + "_" + time + rand;
    },
    nowISO: function () {
      return new Date().toISOString();
    },
    escapeHtml: function (str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },
    clamp: function (n, min, max) {
      return Math.min(max, Math.max(min, n));
    },
    formatDate: function (isoOrDateStr) {
      if (!isoOrDateStr) return "—";
      var d = parseDate(isoOrDateStr);
      if (isNaN(d.getTime())) return "—";
      var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    },
    formatDateShort: function (isoOrDateStr) {
      if (!isoOrDateStr) return "—";
      var d = parseDate(isoOrDateStr);
      if (isNaN(d.getTime())) return "—";
      var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return months[d.getMonth()] + " " + d.getDate();
    },
    /* Indian-style digit grouping (last 3 digits, then pairs — e.g.
       12,34,567) since every reference client/project in this workspace is
       India-based; falls back cleanly for smaller numbers where the pattern
       doesn't apply. */
    formatCurrency: function (amount) {
      if (amount === null || amount === undefined || amount === "" || isNaN(amount)) return "—";
      var n = Math.round(Number(amount));
      var negative = n < 0;
      n = Math.abs(n);
      var s = String(n);
      var lastThree = s.length > 3 ? s.slice(-3) : s;
      var rest = s.length > 3 ? s.slice(0, -3) : "";
      if (rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      var grouped = rest ? rest + "," + lastThree : lastThree;
      return (negative ? "-" : "") + "₹" + grouped;
    },
    formatFileSize: function (bytes) {
      if (typeof bytes !== "number" || isNaN(bytes)) return "—";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    },
    daysBetween: function (a, b) {
      var d1 = parseDate(a), d2 = parseDate(b);
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
      return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    },
    daysUntil: function (dateStr) {
      if (!dateStr) return null;
      var target = parseDate(dateStr);
      if (isNaN(target.getTime())) return null;
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      return Math.round((target - today) / (1000 * 60 * 60 * 24));
    },
    initials: function (name) {
      if (!name) return "?";
      var parts = String(name).trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return "?";
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },
    // deterministic pastel-ish gradient pair from a string (for avatar fallback)
    gradientFromString: function (str) {
      var hash = 0;
      var s = String(str || "x");
      for (var i = 0; i < s.length; i++) {
        hash = s.charCodeAt(i) + ((hash << 5) - hash);
      }
      var hue1 = Math.abs(hash) % 360;
      var hue2 = (hue1 + 46) % 360;
      return "linear-gradient(135deg, hsl(" + hue1 + ", 78%, 62%), hsl(" + hue2 + ", 82%, 48%))";
    },
    debounce: function (fn, wait) {
      var t;
      return function () {
        var args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait);
      };
    },
    deepClone: function (obj) {
      return JSON.parse(JSON.stringify(obj));
    }
  };
  App.Utils = Utils;

  /* ---------- Default / seed data ---------- */

  var DEFAULT_DEPARTMENT_TEMPLATE = [
    { name: "Pre-Sales & Design Capture", ownerTeam: "Sales", color: "#3B4FF0", icon: "search" },
    { name: "Account Mgmt & Kickoff", ownerTeam: "Account Management", color: "#8B5CF6", icon: "handshake" },
    { name: "Procurement", ownerTeam: "Supply Chain", color: "#0EA5E9", icon: "package" },
    { name: "Project Planning", ownerTeam: "Operations", color: "#14B8A6", icon: "calendar" },
    { name: "Pre-Installation", ownerTeam: "Engineering + Ops", color: "#F59E0B", icon: "clipboard-check" },
    { name: "Installation", ownerTeam: "Field", color: "#10B981", icon: "wrench" },
    { name: "Post-Install Support", ownerTeam: "Engineering + AM", color: "#6366F1", icon: "life-buoy" },
    { name: "Invoicing", ownerTeam: "AM + Finance", color: "#EC4899", icon: "receipt" },
    { name: "MIS & Governance", ownerTeam: "Operations", color: "#64748B", icon: "bar-chart" }
  ];

  App.PALETTE = ["#3B4FF0", "#8B5CF6", "#0EA5E9", "#14B8A6", "#F59E0B", "#10B981", "#6366F1", "#EC4899", "#64748B", "#DC2626", "#059669", "#7C3AED"];
  App.STATUS_OPTIONS = ["Not Started", "In Progress", "On Hold", "Blocked", "Completed"];
  App.FLAG_OPTIONS = ["Green", "Amber", "Red"];
  App.PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];
  /* ---------- API helper ----------
     Every call sends cookies (the session lives in an httpOnly cookie, not
     something JS can or needs to touch) and expects JSON back. Non-2xx
     responses reject with an Error carrying the server's message, so every
     call site can show something meaningful rather than a generic failure. */
  var API_BASE = "/api";

  function apiFetch(path, opts) {
    opts = opts || {};
    var fetchOpts = {
      method: opts.method || "GET",
      credentials: "include",
      headers: {}
    };
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      fetchOpts.headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(opts.body);
    } else if (opts.body instanceof FormData) {
      fetchOpts.body = opts.body; // browser sets multipart Content-Type + boundary itself
    }
    return fetch(API_BASE + path, fetchOpts).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error((json && json.error) || ("Request failed (" + res.status + ")"));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  var Store = {
    data: null,
    currentUser: null,

    /* ---- Auth ---- */
    checkSetupStatus: function () {
      return apiFetch("/auth/setup-status");
    },
    bootstrapAdmin: function (name, email, password) {
      return apiFetch("/auth/bootstrap-admin", { method: "POST", body: { name: name, email: email, password: password } })
        .then(function (r) { Store.currentUser = r.user; return r.user; });
    },
    login: function (email, password) {
      return apiFetch("/auth/login", { method: "POST", body: { email: email, password: password } })
        .then(function (r) { Store.currentUser = r.user; return r.user; });
    },
    logout: function () {
      return apiFetch("/auth/logout", { method: "POST" }).then(function () { Store.currentUser = null; });
    },
    logoutOtherSessions: function () {
      return apiFetch("/auth/logout-other-sessions", { method: "POST" });
    },
    fetchCurrentUser: function () {
      return apiFetch("/auth/me").then(function (r) { Store.currentUser = r.user; return r.user; });
    },
    listUsers: function () {
      return apiFetch("/auth/users");
    },
    createUser: function (payload) {
      return apiFetch("/auth/users", { method: "POST", body: payload });
    },
    deleteUser: function (id) {
      return apiFetch("/auth/users/" + id, { method: "DELETE" });
    },
    resetUserPassword: function (id, password) {
      return apiFetch("/auth/users/" + id + "/reset-password", { method: "POST", body: { password: password } });
    },

    /* ---- Initial bulk load ---- */
    loadFromServer: function () {
      return apiFetch("/data").then(function (d) {
        Store.data = d;
        return d;
      });
    },

    /* ---- Clients ---- */
    addClient: function (client) {
      return apiFetch("/clients", { method: "POST", body: client }).then(function (r) {
        Store.data.clients.push(r.client);
        return r.client;
      });
    },
    updateClient: function (id, patch) {
      return apiFetch("/clients/" + id, { method: "PATCH", body: patch }).then(function (r) {
        var i = Store.data.clients.findIndex(function (c) { return c.id === id; });
        if (i !== -1) Store.data.clients[i] = r.client;
        return r.client;
      });
    },
    deleteClient: function (id) {
      return apiFetch("/clients/" + id, { method: "DELETE" }).then(function () {
        Store.data.clients = Store.data.clients.filter(function (c) { return c.id !== id; });
        Store.data.projects = Store.data.projects.filter(function (p) { return p.clientId !== id; });
      });
    },
    uploadClientPhoto: function (id, file) {
      var fd = new FormData();
      fd.append("photo", file);
      return apiFetch("/clients/" + id + "/photo", { method: "PUT", body: fd }).then(function (r) {
        var c = Store.getClient(id);
        if (c) {
          c.hasPhoto = true;
          c.photoVersion = (r && r.client && r.client.photoVersion) || Date.now();
        }
      });
    },
    // ?v= changes whenever the photo is replaced, so browsers never show a
    // stale cached copy (the server lets them cache each version for a day).
    clientPhotoUrl: function (id) {
      var c = Store.data && Store.getClient(id);
      return API_BASE + "/clients/" + id + "/photo" + (c && c.photoVersion ? "?v=" + c.photoVersion : "");
    },
    getClient: function (id) {
      return this.data.clients.find(function (c) { return c.id === id; }) || null;
    },

    /* ---- Projects ---- */
    addProject: function (project) {
      return apiFetch("/projects", { method: "POST", body: project }).then(function (r) {
        Store.data.projects.push(r.project);
        return r.project;
      });
    },
    updateProject: function (id, patch) {
      return apiFetch("/projects/" + id, { method: "PATCH", body: patch }).then(function (r) {
        var i = Store.data.projects.findIndex(function (p) { return p.id === id; });
        if (i !== -1) Store.data.projects[i] = r.project;
        return r.project;
      });
    },
    deleteProject: function (id) {
      return apiFetch("/projects/" + id, { method: "DELETE" }).then(function () {
        Store.data.projects = Store.data.projects.filter(function (p) { return p.id !== id; });
      });
    },
    getProject: function (id) {
      return this.data.projects.find(function (p) { return p.id === id; }) || null;
    },
    getClientProjects: function (clientId) {
      return this.data.projects.filter(function (p) { return p.clientId === clientId; });
    },
    duplicateProjectPipelineFrom: function (targetProjectId, sourceProjectId) {
      var source = this.getProject(sourceProjectId);
      var target = this.getProject(targetProjectId);
      if (!source || !target) return Promise.reject(new Error("Project not found"));
      var self = this;
      // Clear the target's current stages, then re-add copies of the
      // source's, sequentially so ordering is preserved.
      var deleteChain = Promise.all(
        target.departments.slice().map(function (d) { return self.deleteProjectDepartment(targetProjectId, d.id); })
      );
      return deleteChain.then(function () {
        var addChain = Promise.resolve();
        source.departments.forEach(function (d) {
          addChain = addChain.then(function () {
            return self.addProjectDepartment(targetProjectId, { name: d.name, ownerTeam: d.ownerTeam, color: d.color, icon: d.icon });
          });
        });
        return addChain.then(function () { return self.getProject(targetProjectId); });
      });
    },

    /* ---- Project documents ---- */
    getProjectDocuments: function (projectId) {
      var p = this.getProject(projectId);
      if (!p || !Array.isArray(p.documents)) return [];
      return p.documents.slice().sort(function (a, b) { return new Date(b.uploadedAt) - new Date(a.uploadedAt); });
    },
    uploadProjectDocuments: function (projectId, fileList) {
      var fd = new FormData();
      Array.prototype.forEach.call(fileList, function (f) { fd.append("files", f); });
      return apiFetch("/projects/" + projectId + "/documents", { method: "POST", body: fd }).then(function (r) {
        var p = Store.getProject(projectId);
        if (p) p.documents = r.documents.concat(p.documents || []);
        return r.documents;
      });
    },
    documentDownloadUrl: function (projectId, docId) {
      return API_BASE + "/projects/" + projectId + "/documents/" + docId + "/download";
    },
    deleteProjectDocument: function (projectId, docId) {
      return apiFetch("/projects/" + projectId + "/documents/" + docId, { method: "DELETE" }).then(function () {
        var p = Store.getProject(projectId);
        if (p) p.documents = (p.documents || []).filter(function (d) { return d.id !== docId; });
      });
    },

    /* ---- Department TEMPLATE ---- */
    getOrderedTemplate: function () {
      return this.data.departmentTemplate.slice().sort(function (a, b) { return a.order - b.order; });
    },
    addTemplateDepartment: function (dept) {
      return apiFetch("/workspace/template", { method: "POST", body: dept }).then(function (r) {
        Store.data.departmentTemplate.push(r.template);
        return r.template;
      });
    },
    updateTemplateDepartment: function (id, patch) {
      return apiFetch("/workspace/template/" + id, { method: "PATCH", body: patch }).then(function (r) {
        var i = Store.data.departmentTemplate.findIndex(function (t) { return t.id === id; });
        if (i !== -1) Store.data.departmentTemplate[i] = r.template;
        return r.template;
      });
    },
    deleteTemplateDepartment: function (id) {
      return apiFetch("/workspace/template/" + id, { method: "DELETE" }).then(function () {
        Store.data.departmentTemplate = Store.data.departmentTemplate.filter(function (t) { return t.id !== id; });
      });
    },
    reorderTemplate: function (orderedIds) {
      return apiFetch("/workspace/template/reorder", { method: "POST", body: { orderedIds: orderedIds } }).then(function () {
        orderedIds.forEach(function (id, i) {
          var t = Store.data.departmentTemplate.find(function (x) { return x.id === id; });
          if (t) t.order = i;
        });
      });
    },
    updateWorkspace: function (patch) {
      return apiFetch("/workspace", { method: "PATCH", body: patch }).then(function () {
        Object.assign(Store.data.workspace, patch.name !== undefined ? { name: patch.name } : {}, patch.accentColor !== undefined ? { accentColor: patch.accentColor } : {});
      });
    },

    /* ---- Per-project pipeline stages ---- */
    getOrderedProjectDepartments: function (projectId) {
      var p = this.getProject(projectId);
      if (!p) return [];
      return p.departments.slice().sort(function (a, b) { return a.order - b.order; });
    },
    getProjectDepartment: function (projectId, deptId) {
      var p = this.getProject(projectId);
      if (!p) return null;
      return p.departments.find(function (d) { return d.id === deptId; }) || null;
    },
    addProjectDepartment: function (projectId, dept) {
      return apiFetch("/projects/" + projectId + "/departments", { method: "POST", body: dept }).then(function (r) {
        var p = Store.getProject(projectId);
        if (p) p.departments.push(r.department);
        return r.department;
      });
    },
    updateProjectDepartment: function (projectId, deptId, patch) {
      return apiFetch("/projects/" + projectId + "/departments/" + deptId, { method: "PATCH", body: patch }).then(function (r) {
        var p = Store.getProject(projectId);
        if (p) {
          var i = p.departments.findIndex(function (d) { return d.id === deptId; });
          if (i !== -1) p.departments[i] = r.department;
        }
        return r.department;
      });
    },
    deleteProjectDepartment: function (projectId, deptId) {
      return apiFetch("/projects/" + projectId + "/departments/" + deptId, { method: "DELETE" }).then(function () {
        var p = Store.getProject(projectId);
        if (p) p.departments = p.departments.filter(function (d) { return d.id !== deptId; });
      });
    },
    reorderProjectDepartments: function (projectId, orderedIds) {
      return apiFetch("/projects/" + projectId + "/departments/reorder", { method: "POST", body: { orderedIds: orderedIds } }).then(function () {
        var p = Store.getProject(projectId);
        if (p) {
          orderedIds.forEach(function (id, i) {
            var d = p.departments.find(function (x) { return x.id === id; });
            if (d) d.order = i;
          });
        }
      });
    },

    getProjectProgressPercent: function (projectId) {
      var depts = this.getOrderedProjectDepartments(projectId);
      if (depts.length === 0) return 0;
      var sum = depts.reduce(function (acc, d) { return acc + (d.percent || 0); }, 0);
      return Math.round(sum / depts.length);
    },
    getProjectRAG: function (projectId) {
      var project = this.getProject(projectId);
      if (project && project.ragOverride && project.ragOverride !== "Auto") {
        return project.ragOverride;
      }
      var depts = this.getOrderedProjectDepartments(projectId);
      if (depts.some(function (d) { return d.flag === "Red"; })) return "Red";
      if (depts.some(function (d) { return d.flag === "Amber"; })) return "Amber";
      return "Green";
    },
    getProjectCurrentDepartment: function (projectId) {
      var depts = this.getOrderedProjectDepartments(projectId);
      for (var i = 0; i < depts.length; i++) {
        if (depts[i].status !== "Completed") return depts[i];
      }
      return depts.length ? depts[depts.length - 1] : null;
    },
    isProjectCompleted: function (projectId) {
      var depts = this.getOrderedProjectDepartments(projectId);
      if (depts.length === 0) return false;
      return depts.every(function (d) { return d.status === "Completed"; });
    },
    getClientProgressPercent: function (clientId) {
      var self = this;
      var projects = this.getClientProjects(clientId);
      if (projects.length === 0) return 0;
      var sum = projects.reduce(function (acc, p) { return acc + self.getProjectProgressPercent(p.id); }, 0);
      return Math.round(sum / projects.length);
    },
    getClientRAG: function (clientId) {
      var self = this;
      var projects = this.getClientProjects(clientId);
      var rags = projects.map(function (p) { return self.getProjectRAG(p.id); });
      if (rags.indexOf("Red") !== -1) return "Red";
      if (rags.indexOf("Amber") !== -1) return "Amber";
      return "Green";
    },

    /* The date that actually governs "is this late" — a hard deadline (if
       set) takes priority over the expected-end estimate, since missing a
       real commitment date matters more than drifting from a forecast. */
    getProjectDueDate: function (project) {
      return (project && (project.deadlineDate || project.expectedEndDate)) || null;
    },

    getStats: function () {
      var self = this;
      var projects = this.data.projects;
      var total = projects.length;
      var green = 0, amber = 0, red = 0, completed = 0, overdue = 0;
      projects.forEach(function (p) {
        var rag = self.getProjectRAG(p.id);
        if (rag === "Green") green++;
        else if (rag === "Amber") amber++;
        else red++;
        if (self.isProjectCompleted(p.id)) completed++;
        var daysLeft = Utils.daysUntil(self.getProjectDueDate(p));
        if (!self.isProjectCompleted(p.id) && daysLeft !== null && daysLeft < 0) overdue++;
      });
      var active = total - completed;
      var avgProgress = total === 0 ? 0 : Math.round(projects.reduce(function (acc, p) { return acc + self.getProjectProgressPercent(p.id); }, 0) / total);
      var totalBudget = projects.reduce(function (acc, p) { return acc + (typeof p.budget === "number" ? p.budget : 0); }, 0);
      return {
        totalClients: this.data.clients.length,
        totalProjects: total,
        active: active,
        completed: completed,
        green: green, amber: amber, red: red,
        overdue: overdue,
        avgProgress: avgProgress,
        totalBudget: totalBudget
      };
    },

    getFlaggedItems: function () {
      var self = this;
      var items = [];
      this.data.projects.forEach(function (project) {
        var client = self.getClient(project.clientId);
        self.getOrderedProjectDepartments(project.id).forEach(function (dept) {
          if ((dept.flag === "Red" || dept.flag === "Amber" || dept.status === "Blocked") && dept.status !== "Completed") {
            items.push({ department: dept, project: project, client: client });
          }
        });
      });
      items.sort(function (a, b) {
        var rank = { Red: 0, Amber: 1, Green: 2 };
        var ra = a.department.status === "Blocked" ? -1 : rank[a.department.flag];
        var rb = b.department.status === "Blocked" ? -1 : rank[b.department.flag];
        return ra - rb;
      });
      return items;
    },

    getDepartmentWorkload: function () {
      // Departments are now project-owned, so the cross-project aggregate
      // groups by name (the only stable label shared across pipelines).
      var self = this;
      var byName = {};
      var order = [];
      this.data.projects.forEach(function (project) {
        self.getOrderedProjectDepartments(project.id).forEach(function (dept) {
          if (!byName[dept.name]) {
            byName[dept.name] = { name: dept.name, color: dept.color, icon: dept.icon, activeCount: 0, totalCount: 0, percentSum: 0 };
            order.push(dept.name);
          }
          var bucket = byName[dept.name];
          bucket.totalCount++;
          bucket.percentSum += dept.percent || 0;
          if (dept.status !== "Completed" && dept.status !== "Not Started") bucket.activeCount++;
        });
      });
      return order.map(function (name) {
        var b = byName[name];
        return { department: { name: b.name, color: b.color, icon: b.icon }, activeCount: b.activeCount, totalCount: b.totalCount, avgPercent: b.totalCount ? Math.round(b.percentSum / b.totalCount) : 0 };
      });
    },

    getRecentActivity: function (limit) {
      var self = this;
      var all = [];
      this.data.projects.forEach(function (project) {
        var client = self.getClient(project.clientId);
        project.departments.forEach(function (dept) {
          if (!dept.updatedAt) return;
          all.push({ department: dept, project: project, client: client });
        });
      });
      all.sort(function (a, b) { return new Date(b.department.updatedAt) - new Date(a.department.updatedAt); });
      return all.slice(0, limit || 6);
    },

    getAllProjectsFlat: function () {
      var self = this;
      return this.data.projects.map(function (p) {
        var client = self.getClient(p.clientId);
        return {
          project: p,
          client: client,
          progressPercent: self.getProjectProgressPercent(p.id),
          rag: self.getProjectRAG(p.id),
          currentDepartment: self.getProjectCurrentDepartment(p.id),
          completed: self.isProjectCompleted(p.id)
        };
      });
    }
  };

  App.Store = Store;
})(window);
