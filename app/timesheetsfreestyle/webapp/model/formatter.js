sap.ui.define([], function () {
  "use strict";

  var TSAPP_PATTERN = /\[TSAPP_START:(.+?)\|TSAPP_END:(.+?)\]\s*/;

  // Workflow progression used to pick the "furthest along" status when several
  // logs (e.g. all logs on one date) have different statuses. DRAFT is pre-workflow
  // (nothing's been sent to S4 yet) so it ranks below everything real — a mixed day
  // shows the real status; an all-draft day correctly falls back to "Draft".
  var STATUS_RANK = { "DRAFT": 0, "20": 1, "30": 2, "60": 3 };

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

    // Given a list of logs (each with a .status code), returns the status code of the
    // one furthest along the approval workflow — used as the "overall" status for a
    // group of logs (e.g. all logs recorded on the same date).
    overallStatusCode: function (aLogs) {
      var oBest = null;
      (aLogs || []).forEach(function (e) {
        if (!oBest || (STATUS_RANK[e.status] || 0) > (STATUS_RANK[oBest.status] || 0)) {
          oBest = e;
        }
      });
      return oBest ? oBest.status : "";
    }
  };
});