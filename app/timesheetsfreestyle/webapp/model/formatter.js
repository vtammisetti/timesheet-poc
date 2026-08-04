sap.ui.define([], function () {
  "use strict";

  var TSAPP_PATTERN = /\[TSAPP_START:(.+?)\|TSAPP_END:(.+?)\]\s*/;

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