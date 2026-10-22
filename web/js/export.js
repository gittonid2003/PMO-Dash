/* ============================================================
   AOne PMO — export.js
   Excel export (SheetJS), JSON backup/import, image resizing.
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var S = App.Store;

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function dateStamp() {
    var d = new Date();
    function pad(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  var Export = {

    readImageFile: function (file, maxSize, quality) {
      return new Promise(function (resolve, reject) {
        if (!file || !file.type || file.type.indexOf("image/") !== 0) {
          reject(new Error("Not an image file"));
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error("Could not read file")); };
        reader.onload = function () {
          var img = new Image();
          img.onerror = function () { reject(new Error("Could not decode image")); };
          img.onload = function () {
            try {
              var side = Math.min(img.width, img.height);
              var sx = (img.width - side) / 2;
              var sy = (img.height - side) / 2;
              var size = maxSize || 300;
              var canvas = document.createElement("canvas");
              canvas.width = size;
              canvas.height = size;
              var ctx = canvas.getContext("2d");
              ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
              resolve(canvas.toDataURL("image/jpeg", quality || 0.85));
            } catch (err) {
              reject(err);
            }
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    // Same square-crop-and-resize as readImageFile, but resolves a real
    // Blob (via canvas.toBlob) instead of a data URL -- what the cloud
    // upload endpoint needs, since photos now go to the server as a real
    // file rather than being embedded as base64 in the saved data.
    readImageFileAsBlob: function (file, maxSize, quality) {
      return new Promise(function (resolve, reject) {
        if (!file || !file.type || file.type.indexOf("image/") !== 0) {
          reject(new Error("Not an image file"));
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error("Could not read file")); };
        reader.onload = function () {
          var img = new Image();
          img.onerror = function () { reject(new Error("Could not decode image")); };
          img.onload = function () {
            try {
              var side = Math.min(img.width, img.height);
              var sx = (img.width - side) / 2;
              var sy = (img.height - side) / 2;
              var size = maxSize || 300;
              var canvas = document.createElement("canvas");
              canvas.width = size;
              canvas.height = size;
              var ctx = canvas.getContext("2d");
              ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
              canvas.toBlob(function (blob) {
                if (blob) resolve(blob); else reject(new Error("Could not encode image"));
              }, "image/jpeg", quality || 0.85);
            } catch (err) {
              reject(err);
            }
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    /* SheetJS is ~900KB, so it's fetched only the first time someone
       exports, from this same server (the CSP blocks CDN scripts). It was
       previously never loaded at all, so Export Excel always failed. */
    loadXlsxLibrary: function () {
      if (typeof XLSX !== "undefined") return Promise.resolve();
      if (Export._xlsxLoading) return Export._xlsxLoading;
      Export._xlsxLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "vendor/xlsx.full.min.js";
        s.onload = function () { typeof XLSX !== "undefined" ? resolve() : reject(new Error("XLSX missing")); };
        s.onerror = function () { Export._xlsxLoading = null; s.remove(); reject(new Error("Could not load the Excel library")); };
        document.head.appendChild(s);
      });
      return Export._xlsxLoading;
    },

    toExcel: function () {
      App.Render.toast("Preparing Excel workbook…");
      Export.loadXlsxLibrary().then(function () {
        Export.buildExcel();
      }).catch(function (err) {
        console.error("AOne PMO: Excel export failed", err);
        App.Render.toast("Excel export failed — please try again.", "error");
      });
    },

    buildExcel: function () {
      var wb = XLSX.utils.book_new();
      var stats = S.getStats();
      var ws = S.data.workspace;

      // --- Summary sheet ---
      var summaryRows = [
        [ws.name + " — Command Deck Export"],
        ["Generated " + new Date().toLocaleString()],
        [],
        ["Total Clients", stats.totalClients],
        ["Total Projects", stats.totalProjects],
        ["Active Projects", stats.active],
        ["Completed Projects", stats.completed],
        ["On Track (Green)", stats.green],
        ["At Risk (Amber)", stats.amber],
        ["Delayed (Red)", stats.red],
        ["Overdue Projects", stats.overdue],
        ["Average Progress %", stats.avgProgress],
        ["Total Budget", App.Utils.formatCurrency(stats.totalBudget)]
      ];
      var summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

      // --- Clients sheet ---
      var clientHeader = ["Client Name", "Industry", "Email", "Phone", "# Projects", "Overall Progress %", "RAG", "Added On", "Notes"];
      var clientRows = S.data.clients.map(function (c) {
        return [
          c.name, c.industry, c.email, c.phone,
          S.getClientProjects(c.id).length,
          S.getClientProgressPercent(c.id),
          S.getClientRAG(c.id),
          App.Utils.formatDate(c.createdAt),
          c.notes
        ];
      });
      var clientSheet = XLSX.utils.aoa_to_sheet([clientHeader].concat(clientRows));
      clientSheet["!cols"] = [{wch:22},{wch:18},{wch:24},{wch:16},{wch:11},{wch:16},{wch:8},{wch:14},{wch:34}];
      XLSX.utils.book_append_sheet(wb, clientSheet, "Clients");

      // --- Projects sheet ---
      var projHeader = ["Project ID", "Project Name", "Client", "Priority", "Current Stage", "Progress %", "RAG", "Start Date", "Expected End", "Deadline", "Actual End", "Budget", "Documents", "Status", "Notes"];
      var projRows = S.getAllProjectsFlat().map(function (row) {
        var p = row.project;
        return [
          p.code, p.name, row.client ? row.client.name : "", p.priority,
          row.currentDepartment ? row.currentDepartment.name : "",
          row.progressPercent, row.rag,
          p.startDate || "", p.expectedEndDate || "", p.deadlineDate || "", p.actualEndDate || "",
          (typeof p.budget === "number" && p.budget !== null) ? p.budget : "",
          Array.isArray(p.documents) ? p.documents.length : 0,
          row.completed ? "Completed" : "In Progress",
          p.notes
        ];
      });
      var projSheet = XLSX.utils.aoa_to_sheet([projHeader].concat(projRows));
      projSheet["!cols"] = [{wch:10},{wch:30},{wch:20},{wch:10},{wch:24},{wch:11},{wch:8},{wch:12},{wch:13},{wch:13},{wch:12},{wch:13},{wch:11},{wch:12},{wch:34}];
      XLSX.utils.book_append_sheet(wb, projSheet, "Projects");

      // --- Department Progress sheet (each project's pipeline is its own now) ---
      var dpHeader = ["Project ID", "Project Name", "Client", "Stage", "Owner Team", "Stakeholder", "Status", "Progress %", "Flag", "Deadline", "Est. Days", "Last Updated", "Completed On", "Notes"];
      var dpRows = [];
      S.data.projects.forEach(function (project) {
        var client = S.getClient(project.clientId);
        S.getOrderedProjectDepartments(project.id).forEach(function (dept) {
          dpRows.push([
            project.code, project.name, client ? client.name : "",
            dept.name, dept.ownerTeam, dept.stakeholder || "",
            dept.status, dept.percent, dept.flag,
            dept.deadline || "", (typeof dept.estimatedDays === "number" && dept.estimatedDays !== null) ? dept.estimatedDays : "",
            App.Utils.formatDate(dept.updatedAt), dept.completedOn ? App.Utils.formatDate(dept.completedOn) : "",
            dept.notes
          ]);
        });
      });
      var dpSheet = XLSX.utils.aoa_to_sheet([dpHeader].concat(dpRows));
      dpSheet["!cols"] = [{wch:10},{wch:28},{wch:18},{wch:26},{wch:18},{wch:18},{wch:12},{wch:10},{wch:8},{wch:12},{wch:10},{wch:13},{wch:13},{wch:34}];
      XLSX.utils.book_append_sheet(wb, dpSheet, "Department Progress");

      var filename = (ws.name || "AOne-PMO").replace(/[^a-z0-9]+/gi, "-") + "_export_" + dateStamp() + ".xlsx";
      XLSX.writeFile(wb, filename);
      App.Render.toast("Excel workbook downloaded");
    },

    toJSON: function () {
      var payload = JSON.stringify(S.data, null, 2);
      var blob = new Blob([payload], { type: "application/json" });
      var filename = (S.data.workspace.name || "AOne-PMO").replace(/[^a-z0-9]+/gi, "-") + "_backup_" + dateStamp() + ".json";
      triggerDownload(blob, filename);
      App.Render.toast("Backup file downloaded");
    },

    confirmAndImportJSON: function (file) {
      var reader = new FileReader();
      reader.onerror = function () { App.Render.toast("Could not read that file.", "error"); };
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (e) {
          App.Render.toast("That file isn't valid backup JSON.", "error");
          return;
        }
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.clients) || !Array.isArray(parsed.projects) || !Array.isArray(parsed.departments)) {
          App.Render.toast("That file doesn't look like an AOne PMO backup.", "error");
          return;
        }
        var clientCount = parsed.clients.length, projectCount = parsed.projects.length;
        App.Render.confirm({
          title: "Import this backup?",
          body: "This will replace everything currently in this workspace with " + clientCount + " client(s) and " + projectCount + " project(s) from the file. Export a backup of your current data first if you want to keep it.",
          confirmLabel: "Replace & Import",
          danger: true,
          icon: "upload"
        }, function () {
          if (typeof parsed.nextProjectSeq !== "number") parsed.nextProjectSeq = (parsed.projects.length || 0) + 1;
          if (!parsed.workspace) parsed.workspace = S.getDefaultData().workspace;
          parsed.workspace.setupComplete = true;
          var result = S.replaceAll(parsed);
          if (result.ok) {
            App.Render.toast("Data imported successfully");
            App.applyAccentColor();
            App.updateSidebarBranding();
            App.navigateTo("dashboard");
          } else {
            App.Render.toast("Import failed to save — storage may be full.", "error");
          }
        });
      };
      reader.readAsText(file);
    }
  };

  App.Export = Export;
})(window);
