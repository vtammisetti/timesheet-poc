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
        "20": "Sent for Approval",
        "30": "Approved",
        "60": "Processed"
      };
      return mStatusMap[sStatusCode] || ("Status " + sStatusCode);
    },

    statusState: function (sStatusCode) {
      var mStateMap = {
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
    }
  };
});