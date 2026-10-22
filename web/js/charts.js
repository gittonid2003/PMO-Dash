/* ============================================================
   AOne PMO — charts.js
   Hand-rolled SVG visualizations: RAG donut, progress rings,
   and the signature "circuit pipeline" department trace.
   ============================================================ */

(function (global) {
  "use strict";
  var App = global.App = global.App || {};
  var esc = App.Utils.escapeHtml;

  var RAG_COLORS = { Green: "#16A34A", Amber: "#D97706", Red: "#DC2626" };

  var Charts = {

    /* Small circular progress ring. percent 0-100 */
    progressRing: function (percent, opts) {
      opts = opts || {};
      var size = opts.size || 56;
      var stroke = opts.stroke || 5;
      var color = opts.color || "var(--signal)";
      var trackColor = opts.trackColor || "rgba(23,27,46,0.08)";
      var showLabel = opts.showLabel !== false;
      var r = (size - stroke) / 2;
      var c = 2 * Math.PI * r;
      var pct = App.Utils.clamp(percent || 0, 0, 100);
      var offset = c * (1 - pct / 100);
      var fontSize = Math.max(11, Math.round(size * 0.24));
      return (
        '<svg class="progress-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
          '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="' + trackColor + '" stroke-width="' + stroke + '"/>' +
          '<circle class="ring-progress" cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke +
            '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + c.toFixed(2) + '" transform="rotate(-90 ' + size/2 + ' ' + size/2 + ')" data-target-offset="' + offset.toFixed(2) + '"/>' +
          (showLabel ? '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-label" style="font-size:' + fontSize + 'px">' + pct + '%</text>' : '') +
        '</svg>'
      );
    },

    /* RAG donut chart for dashboard: {green, amber, red} */
    ragDonut: function (data, opts) {
      opts = opts || {};
      var size = opts.size || 168;
      var stroke = opts.stroke || 20;
      var r = (size - stroke) / 2;
      var c = 2 * Math.PI * r;
      var total = (data.green || 0) + (data.amber || 0) + (data.red || 0);
      var segments = [
        { key: "Green", val: data.green || 0, color: RAG_COLORS.Green },
        { key: "Amber", val: data.amber || 0, color: RAG_COLORS.Amber },
        { key: "Red", val: data.red || 0, color: RAG_COLORS.Red }
      ];
      var cx = size / 2, cy = size / 2;
      var offsetAcc = 0;
      var circles = "";
      if (total === 0) {
        circles = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(23,27,46,0.08)" stroke-width="' + stroke + '"/>';
      } else {
        segments.forEach(function (seg, i) {
          if (seg.val <= 0) return;
          var frac = seg.val / total;
          var dash = c * frac;
          var gap = c - dash;
          circles += '<circle class="donut-seg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + seg.color +
            '" stroke-width="' + stroke + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + gap.toFixed(2) +
            '" stroke-dashoffset="' + (-offsetAcc).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" style="animation-delay:' + (i * 120) + 'ms"/>';
          offsetAcc += dash;
        });
      }
      return (
        '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" class="rag-donut">' +
          circles +
          '<text x="50%" y="47%" text-anchor="middle" dominant-baseline="central" class="donut-total">' + total + '</text>' +
          '<text x="50%" y="63%" text-anchor="middle" dominant-baseline="central" class="donut-caption">projects</text>' +
        '</svg>'
      );
    },

    /* Signature element: horizontal circuit-style pipeline trace.
       depts: ordered array of department objects, each carrying its own
       status/percent/flag/name directly (schema v2 — departments are
       project-owned, so there's no separate progress record to join). */
    pipelineTrace: function (depts, opts) {
      opts = opts || {};
      var compact = !!opts.compact;
      var nodeR = compact ? 7 : 11;
      var gap = compact ? 46 : 92;
      // Non-compact mode prints a centered label under each node (up to 16
      // chars in the mono face); padX must be wide enough that the first and
      // last labels' overhang doesn't run past the SVG's own edge.
      var padX = compact ? 20 : 56;
      var h = compact ? 32 : 64;
      var w = padX * 2 + gap * Math.max(depts.length - 1, 0) + 4;
      var cy = h / 2;

      var segs = "";
      var nodes = "";
      depts.forEach(function (dept, i) {
        var cx = padX + i * gap;
        var status = dept.status || "Not Started";
        var flag = dept.flag || "Green";
        var isDone = status === "Completed";
        var isActive = !isDone && (status === "In Progress" || (dept.percent || 0) > 0);
        var isBlocked = status === "Blocked";
        var color = isDone ? "#16A34A" : (isBlocked ? "#DC2626" : (isActive ? (RAG_COLORS[flag] || "#3B4FF0") : "rgba(23,27,46,0.18)"));

        if (i > 0) {
          var prevDone = depts[i - 1].status === "Completed";
          var lineColor = prevDone ? "#16A34A" : "rgba(23,27,46,0.14)";
          segs += '<line x1="' + (cx - gap + nodeR + 2) + '" y1="' + cy + '" x2="' + (cx - nodeR - 2) + '" y2="' + cy +
            '" stroke="' + lineColor + '" stroke-width="' + (compact ? 2 : 3) + '" stroke-dasharray="' + (prevDone ? "0" : "1,7") + '" stroke-linecap="round"/>';
        }

        var pulse = (flag === "Red" && !isDone) ? ' pulse-node' : '';
        // Native SVG tooltip: shows the full department name on hover, which
        // matters most in compact mode (no visible label) and whenever the
        // printed label below is truncated with an ellipsis.
        nodes += '<g class="trace-node' + pulse + '"><title>' + esc(dept.name) + ' — ' + esc(status) + '</title>';
        if (isDone) {
          nodes += '<circle cx="' + cx + '" cy="' + cy + '" r="' + nodeR + '" fill="' + color + '"/>';
          nodes += '<path d="M' + (cx - nodeR*0.45) + ' ' + cy + ' l' + (nodeR*0.35) + ' ' + (nodeR*0.35) + ' l' + (nodeR*0.6) + ' -' + (nodeR*0.65) + '" stroke="white" stroke-width="' + (compact?1.6:2) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
        } else if (isActive) {
          nodes += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (nodeR+4) + '" fill="' + color + '" opacity="0.16"/>';
          nodes += '<circle cx="' + cx + '" cy="' + cy + '" r="' + nodeR + '" fill="white" stroke="' + color + '" stroke-width="' + (compact?2:3) + '"/>';
          nodes += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (nodeR*0.4) + '" fill="' + color + '"/>';
        } else {
          nodes += '<circle cx="' + cx + '" cy="' + cy + '" r="' + nodeR + '" fill="white" stroke="' + color + '" stroke-width="' + (compact?1.5:2) + '"/>';
        }
        nodes += '</g>';

        if (!compact) {
          var label = dept.name.length > 16 ? dept.name.slice(0, 15) + "…" : dept.name;
          nodes += '<text x="' + cx + '" y="' + (cy + nodeR + 16) + '" text-anchor="middle" class="trace-label">' + esc(label) + '</text>';
        }
      });

      return '<svg class="pipeline-trace' + (compact ? ' compact' : '') + '" width="' + w + '" height="' + (compact ? h : h + 8) +
        '" viewBox="0 0 ' + w + ' ' + (compact ? h : h + 8) + '" preserveAspectRatio="xMinYMid meet">' + segs + nodes + '</svg>';
    },

    /* Horizontal bar list for department workload */
    barList: function (rows, opts) {
      opts = opts || {};
      var max = Math.max.apply(null, rows.map(function (r) { return r.activeCount; }).concat([1]));
      return rows.map(function (r, i) {
        var pct = max === 0 ? 0 : Math.round((r.activeCount / max) * 100);
        return (
          '<div class="bar-row" style="animation-delay:' + (i * 40) + 'ms">' +
            '<div class="bar-row-head">' +
              '<span class="bar-dot" style="background:' + esc(r.department.color) + '"></span>' +
              '<span class="bar-row-label">' + esc(r.department.name) + '</span>' +
              '<span class="bar-row-count">' + r.activeCount + '</span>' +
            '</div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%; background:' + esc(r.department.color) + '"></div></div>' +
          '</div>'
        );
      }).join("");
    },

    /* Animate all progress rings / donut segments currently in the DOM into view */
    animateIn: function (root) {
      var scope = root || document;
      requestAnimationFrame(function () {
        scope.querySelectorAll(".ring-progress[data-target-offset]").forEach(function (el) {
          var target = el.getAttribute("data-target-offset");
          requestAnimationFrame(function () { el.style.strokeDashoffset = target; });
        });
      });
    }
  };

  App.Charts = Charts;
})(window);
