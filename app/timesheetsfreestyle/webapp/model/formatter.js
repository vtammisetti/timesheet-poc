sap.ui.define([], function () {
  "use strict";

  var TSAPP_PATTERN = /\[TSAPP_START:(.+?)\|TSAPP_END:(.+?)\]\s*/;

  // Declared at module level, not as members below, so they never depend on what
  // "this" happens to be — these are used both as plain calls from controllers and
  // as XML binding formatters, where the invocation context is not the formatter object.
  function hoursToMinutes(vValue) {
    if (vValue === undefined || vValue === null || vValue === "") return 0;
    var aParts = String(vValue).split(".");
    var iHours = parseInt(aParts[0], 10);
    var iMinutes = aParts.length > 1 ? parseInt(aParts[1], 10) : 0;
    if (isNaN(iHours)) iHours = 0;
    if (isNaN(iMinutes)) iMinutes = 0;
    return iHours * 60 + iMinutes;
  }

  function minutesToHours(iTotalMinutes) {
    var iHours = Math.floor(iTotalMinutes / 60);
    var iMinutes = iTotalMinutes % 60;
    return iHours + "." + (iMinutes < 10 ? "0" + iMinutes : iMinutes);
  }

  return {
    formatDate: function (sIsoDate) {
      if (!sIsoDate) return "";
      var oDate = new Date(sIsoDate);
      return oDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    },

    formatStatus: function (sStatusCode) {
      var mStatusMap = {
        "DRAFT": "Draft",
        "20": "Sent for Approval",
        "30": "Approved",
        "60": "Processed"
      };
      return mStatusMap[sStatusCode] || ("Status " + sStatusCode);
    },

    statusState: function (sStatusCode) {
      var mStateMap = {
        "DRAFT": "Information",
        "20": "Warning",
        "30": "Success",
        "60": "Warning"
      };
      return mStateMap[sStatusCode] || "None";
    },

    // Extract start time from the "[TSAPP_START:hh:mm AM|TSAPP_END:hh:mm AM]" convention
    parseStartTime: function (sRemarks) {
      if (!sRemarks) return "";
      var oMatch = TSAPP_PATTERN.exec(sRemarks);
      return oMatch ? oMatch[1] : "";
    },

    parseEndTime: function (sRemarks) {
      if (!sRemarks) return "";
      var oMatch = TSAPP_PATTERN.exec(sRemarks);
      return oMatch ? oMatch[2] : "";
    },

    // Remarks with the TSAPP tag stripped out, leaving only free-text notes
    cleanRemarks: function (sRemarks) {
      if (!sRemarks) return "";
      return sRemarks.replace(TSAPP_PATTERN, "").trim();
    },

    // Hours are entered as "H.MM" (e.g. "8.30" = 8h 30m), matching the timesheet's
    // hh:mm convention — not a decimal fraction. So "4.80" means 4h + 80m, which
    // carries into 5h 20m, not a literal 4.8 hours. Shared by the Create and Edit
    // entry dialogs so both carry minutes the same way.
    hoursToMinutes: hoursToMinutes,
    minutesToHours: minutesToHours,

    // Re-writes a raw "H.MM" value through the carry-over rule: "4.80" -> "5.20",
    // "4.60" -> "5.00". Used on input, and as a display formatter for stored values
    // that predate normalization or come straight from S4 unnormalized.
    normalizeHours: function (vValue) {
      return minutesToHours(hoursToMinutes(vValue));
    },

    // Sums a list of "H.MM" values and returns the total in the same notation.
    // Adding them as plain decimals is wrong — 4.60 + 4.30 is 9.30 (9h 30m),
    // not 8.90 — so the arithmetic has to happen in minutes.
    sumHours: function (aValues) {
      var iTotalMinutes = (aValues || []).reduce(function (iSum, vValue) {
        return iSum + hoursToMinutes(vValue);
      }, 0);
      return minutesToHours(iTotalMinutes);
    },

    // Given a list of logs (each with a .status code), returns the "overall" status
    // code for the group (e.g. all logs recorded on the same date), in priority order:
    // 1. Any Draft means the day still needs the user's attention, so it wins outright.
    // 2. Any Processed log next — once payroll has processed one log for the day,
    //    that's the most significant state to surface.
    // 3. "Approved" only if EVERY remaining log is Approved — not "at least one".
    // 4. Otherwise (a mix that includes a still-pending "Sent for Approval" log),
    //    report "Sent for Approval" since the day isn't fully approved yet.
    overallStatusCode: function (aLogs) {
      if (!aLogs || !aLogs.length) return "";

      if (aLogs.some(function (e) { return e.status === "DRAFT"; })) {
        return "DRAFT";
      }
      if (aLogs.some(function (e) { return e.status === "60"; })) {
        return "60";
      }
      if (aLogs.every(function (e) { return e.status === "30"; })) {
        return "30";
      }
      return "20";
    }
  };
});