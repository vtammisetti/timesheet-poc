sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "timesheetsfreestyle/model/formatter"
], function (Controller, Fragment, JSONModel, MessageBox, MessageToast, formatter) {
  "use strict";

  return Controller.extend("timesheetsfreestyle.controller.ObjectPage", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({}), "objectPage");
      this.getView().setModel(new JSONModel({ status: [], category: [], workCenter: [] }), "logFacets");
      this.getOwnerComponent().getRouter().getRoute("objectPage").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (oEvent) {
      var sIsoDate = oEvent.getParameter("arguments").date;
      this._loadDate(sIsoDate);
    },

    _loadDate: function (sIsoDate) {
      this._sCurrentIsoDate = sIsoDate;

      var oUser = this.getOwnerComponent().getCurrentUser();
      var aRealEntries = this.getOwnerComponent().getModel("timesheetData").getProperty("/entries") || [];
      var aDrafts = this.getOwnerComponent().getDraftEntries().filter(function (d) {
        return d.employeeId === oUser.employeeId;
      });
      var aAllEntries = aRealEntries.concat(aDrafts);

      var aLogs = aAllEntries.filter(function (e) {
        return (e.entryDate || "").slice(0, 10) === sIsoDate;
      });
      var aSortedLogs = this._sortLogsDesc(aLogs).map(this._toSelectableLog);

      var fTotalHours = aLogs.reduce(function (n, e) { return n + (parseFloat(e.hours) || 0); }, 0);
      var sOverallStatus = formatter.overallStatusCode(aLogs);

      this.getView().getModel("objectPage").setData({
        isoDate: sIsoDate,
        displayDate: formatter.formatDate(sIsoDate),
        employeeId: oUser.employeeId,
        employeeLabel: oUser.name,
        companyCode: oUser.companyCode,
        totalHours: fTotalHours.toFixed(2),
        logCount: aLogs.length,
        overallStatusText: aLogs.length ? formatter.formatStatus(sOverallStatus) : "No Status",
        overallStatusState: aLogs.length ? formatter.statusState(sOverallStatus) : "None",
        logs: aSortedLogs,
        displayLogs: aSortedLogs,
        searchQuery: "",
        editEnabled: false,
        deleteEnabled: false,
        submitEnabled: false
      });

      this._buildLogFacets(aSortedLogs);
    },

    // Drafts float to the top regardless of age — they need the user to act (submit
    // them) so they shouldn't get buried under older real entries. Within each group,
    // TimeSheetRecord IDs are assigned sequentially by S4 (there's no created-timestamp
    // field), so record order is the best available proxy for "most recently logged";
    // draft ids embed a real timestamp so the same comparison works for those too.
    _sortLogsDesc: function (aLogs) {
      return (aLogs || []).slice().sort(function (a, b) {
        if (!!a.isDraft !== !!b.isDraft) return a.isDraft ? -1 : 1;
        return String(b.record || "").localeCompare(String(a.record || ""), undefined, { numeric: true });
      });
    },

    // Only Drafts and "Sent for Approval" (20) logs can be acted on — Approved (30)
    // and Processed (60) are locked once submitted, editable only while still a
    // Draft. Locked rows get a disabled, pre-checked box (a "finalized" marker, not
    // a real selection); actionable rows start unchecked and interactive.
    _toSelectableLog: function (oLog) {
      var bSelectable = !!oLog.isDraft || oLog.status === "20";
      return Object.assign({}, oLog, {
        selectable: bSelectable,
        selected: !bSelectable
      });
    },

    // Derive filter options from the logs actually on this date — no hardcoded lists
    _buildLogFacets: function (aLogs) {
      var mStatus = {}, mCategory = {}, mWorkCenter = {};

      (aLogs || []).forEach(function (e) {
        if (e.status) mStatus[e.status] = true;
        if (e.category) mCategory[e.category] = true;
        if (e.workCenter) mWorkCenter[e.workCenter] = true;
      });

      var toFacetArray = function (mMap, fnLabel) {
        return Object.keys(mMap).map(function (k) {
          return { key: k, text: fnLabel ? fnLabel(k) : k };
        });
      };

      this.getView().getModel("logFacets").setData({
        status: toFacetArray(mStatus, formatter.formatStatus),
        category: toFacetArray(mCategory),
        workCenter: toFacetArray(mWorkCenter)
      });
    },

    onLogFacetFilterConfirm: function () {
      this._applyLogFilters(this._getLogFacetSelections(), this.byId("logsSearchField").getValue());
    },

    onLogFacetFilterReset: function () {
      this._applyLogFilters([], this.byId("logsSearchField").getValue());
    },

    onLogSearch: function (oEvent) {
      this._applyLogFilters(this._getLogFacetSelections(), oEvent.getParameter("newValue"));
    },

    _getLogFacetSelections: function () {
      var oFacetFilter = this.byId("logsFacetFilter");
      var aSelectedKeys = [];

      oFacetFilter.getLists().forEach(function (oList) {
        var sListKey = oList.getKey();
        oList.getSelectedItems().forEach(function (oItem) {
          aSelectedKeys.push({ field: sListKey, value: oItem.getKey() });
        });
      });

      return aSelectedKeys;
    },

    // Filters the raw logs (client-side — objectPage is a JSONModel) using an AND
    // across facet fields, OR within a field's selected values — same semantics as
    // the My Timesheets list's facet filter.
    _applyLogFilters: function (aFacetKeys, sSearchQuery) {
      var oModel = this.getView().getModel("objectPage");
      var aRawLogs = oModel.getProperty("/logs") || [];
      var sQuery = (sSearchQuery || "").toLowerCase();

      var mByField = {};
      (aFacetKeys || []).forEach(function (o) {
        mByField[o.field] = mByField[o.field] || [];
        mByField[o.field].push(o.value);
      });

      var aFiltered = aRawLogs.filter(function (e) {
        var bFieldsMatch = Object.keys(mByField).every(function (sField) {
          return mByField[sField].indexOf(e[sField]) !== -1;
        });
        if (!bFieldsMatch) return false;

        if (sQuery) {
          var bMatch = (e.workCenter || "").toLowerCase().indexOf(sQuery) !== -1 ||
                       (e.category || "").toLowerCase().indexOf(sQuery) !== -1 ||
                       (e.remarks || "").toLowerCase().indexOf(sQuery) !== -1;
          if (!bMatch) return false;
        }
        return true;
      });

      oModel.setProperty("/displayLogs", aFiltered);
    },

    // The row checkbox is a plain CheckBox (not the Table's built-in multi-select) so
    // that Approved/Processed rows can be shown disabled+checked without being part
    // of the real selection — see _toSelectableLog.
    onLogRowCheckChange: function () {
      this._updateActionEnablement();
    },

    _getSelectedLogs: function () {
      var aLogs = this.getView().getModel("objectPage").getProperty("/displayLogs") || [];
      return aLogs.filter(function (o) { return o.selectable && o.selected; });
    },

    _updateActionEnablement: function () {
      var aLogs = this._getSelectedLogs();
      var bAllDrafts = aLogs.length > 0 && aLogs.every(function (o) { return o.isDraft; });

      var oModel = this.getView().getModel("objectPage");
      // Edit is Draft-only, full stop — once a log is real (submitted), it's read-only
      // in this app even if S4 itself would still technically allow changing it.
      oModel.setProperty("/editEnabled", aLogs.length === 1 && aLogs[0].isDraft === true);
      oModel.setProperty("/deleteEnabled", aLogs.length >= 1);
      oModel.setProperty("/submitEnabled", bAllDrafts);
    },

    onEditLogPress: function () {
      var aLogs = this._getSelectedLogs();
      if (aLogs.length !== 1 || !aLogs[0].isDraft) return;
      this._openEditDialog(aLogs[0]);
    },

    _openEditDialog: function (oLog) {
      var oView = this.getView();

      if (!this._pEditDialog) {
        this._pEditDialog = Fragment.load({
          id: oView.getId(),
          name: "timesheetsfreestyle.view.EditEntryDialog",
          controller: this
        }).then(function (oDialog) {
          oView.addDependent(oDialog);
          return oDialog;
        });
      }

      this._pEditDialog.then(function (oDialog) {
        var oObjectPageData = this.getView().getModel("objectPage").getData();
        var oDialogModel = new JSONModel({
          record: oLog.record,
          employeeId: oObjectPageData.employeeId,
          companyCode: oObjectPageData.companyCode,
          entryDate: oObjectPageData.isoDate,
          workCenter: oLog.workCenter,
          category: oLog.category,
          hours: oLog.hours,
          remarks: formatter.cleanRemarks(oLog.remarks),
          startTime: formatter.parseStartTime(oLog.remarks),
          endTime: formatter.parseEndTime(oLog.remarks)
        });
        oDialog.setModel(oDialogModel, "editEntry");
        oDialog.open();
      }.bind(this));
    },

    onCancelEditDialog: function () {
      this._pEditDialog.then(function (oDialog) { oDialog.close(); });
    },

    // Hours are "H.MM" (e.g. "8.30" = 8h 30m), so overflow minutes need to carry
    // into the next hour — e.g. "5.80" -> "6.20". Same rule as the Create dialog.
    onEditHoursChange: function (oEvent) {
      var oBinding = oEvent.getSource().getBinding("value");
      if (!oBinding) return;
      oBinding.setValue(formatter.normalizeHours(oEvent.getSource().getValue()));
    },

    // Edit only ever opens for a Draft (onEditLogPress guards on isDraft) — once a
    // log is real, it's read-only in this app, so there's no backend call here.
    onSubmitEditEntry: function () {
      var that = this;

      this._pEditDialog.then(function (oDialog) {
        var oModel = oDialog.getModel("editEntry");
        var oData = oModel.getData();

        if (!oData.entryDate || !oData.workCenter || !oData.category || !oData.hours) {
          MessageBox.error("Date, Work Center, Task Type, and Hours are required.");
          return;
        }

        // Safety net in case Save is reached without the Hours field ever firing
        // its own change/blur (e.g. Enter submits before carry-over normalizes it).
        oData.hours = formatter.normalizeHours(oData.hours);
        oModel.setProperty("/hours", oData.hours);

        that._saveDraftEdit(oDialog, oData);
      });
    },

    // Drafts are now backend-persisted TimeEntries records — saving an edit is a PATCH,
    // so it can fail (network, validation, etc.) and that has to reach the user instead
    // of silently leaving the dialog closed over an unsaved change.
    _saveDraftEdit: function (oDialog, oData) {
      var that = this;
      var sTimeTag = (oData.startTime && oData.endTime)
        ? "[TSAPP_START:" + oData.startTime + "|TSAPP_END:" + oData.endTime + "] "
        : "";
      var sOriginalDate = this._sCurrentIsoDate;

      this.getOwnerComponent().updateDraftEntry(oData.record, {
        entryDate: oData.entryDate,
        workCenter: oData.workCenter,
        category: oData.category,
        hours: parseFloat(oData.hours).toFixed(2),
        remarks: (sTimeTag + (oData.remarks || "")).trim()
      }).then(function () {
        oDialog.close();
        MessageToast.show("Draft updated");
        that._refreshTimeEntriesList();

        if (oData.entryDate !== sOriginalDate) {
          // Moved to a different date — it no longer belongs on this page, so follow
          // it to where it now lives instead of leaving the user looking at a stale list.
          that.getOwnerComponent().getRouter().navTo("objectPage", { date: oData.entryDate });
        } else {
          that._loadDate(sOriginalDate);
        }
      }).catch(function (oError) {
        MessageBox.error("Failed to save draft: " + oError.message);
        // Dialog stays open so the user's edits aren't lost and they can retry.
      });
    },

    onDeleteLogPress: function () {
      var that = this;
      var aLogs = this._getSelectedLogs();
      if (!aLogs.length) return;

      MessageBox.confirm("Delete " + aLogs.length + " log(s)? This cannot be undone.", {
        title: "Confirm Delete",
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            that._deleteLogs(aLogs);
          }
        }
      });
    },

    _deleteLogs: function (aLogs) {
      var that = this;
      var aDraftLogs = aLogs.filter(function (o) { return o.isDraft; });
      var aRealLogs = aLogs.filter(function (o) { return !o.isDraft; });

      // Drafts are now backend-persisted TimeEntries records — each deletion is a real
      // DELETE that can fail, so the result (which ones actually succeeded) has to be
      // checked rather than assumed.
      var pDraftDelete = aDraftLogs.length
        ? this.getOwnerComponent().removeDraftEntries(aDraftLogs.map(function (o) { return o.record; }))
        : Promise.resolve({ succeeded: [], failed: [] });

      if (!aRealLogs.length) {
        pDraftDelete.then(function (oResult) {
          if (oResult.failed.length) {
            MessageBox.error(oResult.succeeded.length + " draft log(s) deleted, " +
              oResult.failed.length + " failed to delete. Please try again.");
          } else {
            MessageToast.show(oResult.succeeded.length + " draft log(s) deleted");
          }
          that._loadDate(that._sCurrentIsoDate);
          that._refreshTimeEntriesList();
        });
        return;
      }

      var oModel = this.getOwnerComponent().getModel();
      var oObjectPageData = this.getView().getModel("objectPage").getData();

      var aCalls = aRealLogs.map(function (oLog) {
        var oActionBinding = oModel.bindContext("/deleteTimeEntry(...)");
        oActionBinding.setParameter("employeeId", oObjectPageData.employeeId);
        oActionBinding.setParameter("companyCode", oObjectPageData.companyCode);
        oActionBinding.setParameter("record", oLog.record);
        // The action never rejects on an S4-side failure — it resolves with an
        // "ERROR: ..." string instead, so success has to be checked explicitly.
        return oActionBinding.execute().then(function () {
          return oActionBinding.getBoundContext().getProperty("value");
        });
      });

      // Wait on both the (already-fired) draft deletes and the S4 deletes together so
      // one combined message reflects what actually happened on each side, rather than
      // the draft-delete outcome getting lost while this branch was running.
      Promise.all([pDraftDelete, Promise.all(aCalls)]).then(function (aOutcome) {
        var oDraftResult = aOutcome[0];
        var aResults = aOutcome[1];
        var aErrors = aResults.filter(function (s) { return s && s.indexOf("ERROR:") === 0; });
        if (aErrors.length) {
          throw new Error(aErrors.map(function (s) { return s.replace(/^ERROR:\s*/, ""); }).join("; "));
        }

        var iDeleted = oDraftResult.succeeded.length + aRealLogs.length;
        if (oDraftResult.failed.length) {
          MessageBox.error(iDeleted + " log(s) deleted, but " + oDraftResult.failed.length +
            " draft log(s) failed to delete. Please try again.");
        } else {
          MessageToast.show(iDeleted + " log(s) deleted");
        }
        that._removeSharedEntries(aRealLogs);
        that._loadDate(that._sCurrentIsoDate);
        that._refreshTimeEntriesList();
      }).catch(function (oError) {
        MessageBox.error("Delete failed: " + oError.message);
        // Some of the deletes may have gone through even though others failed —
        // reload so the table reflects whatever actually happened on the backend.
        that._loadDate(that._sCurrentIsoDate);
        that._refreshTimeEntriesList();
      });
    },

    onSubmitDraftPress: function () {
      var aDrafts = this._getSelectedLogs().filter(function (o) { return o.isDraft; });
      if (!aDrafts.length) return;
      this._submitDrafts(aDrafts);
    },

    // Pushes each selected draft to S4 via createTimeEntry — the one point where a
    // draft actually touches the backend. Drafts that succeed are promoted into the
    // real-entries model (using whatever record id/status S4 handed back); drafts
    // that fail stay put so the user can retry instead of silently losing the row.
    _submitDrafts: function (aDrafts) {
      var that = this;
      var oModel = this.getOwnerComponent().getModel();

      var aCalls = aDrafts.map(function (oDraft) {
        var oActionBinding = oModel.bindContext("/createTimeEntry(...)");
        oActionBinding.setParameter("employeeId", oDraft.employeeId);
        oActionBinding.setParameter("companyCode", oDraft.companyCode);
        oActionBinding.setParameter("entryDate", oDraft.entryDate);
        oActionBinding.setParameter("workCenter", oDraft.workCenter);
        oActionBinding.setParameter("category", oDraft.category);
        oActionBinding.setParameter("startTime", formatter.parseStartTime(oDraft.remarks));
        oActionBinding.setParameter("endTime", formatter.parseEndTime(oDraft.remarks));
        oActionBinding.setParameter("hours", parseFloat(oDraft.hours));
        oActionBinding.setParameter("remarks", formatter.cleanRemarks(oDraft.remarks));
        return oActionBinding.execute().then(function () {
          var sResult = oActionBinding.getBoundContext().getProperty("value");
          return { draft: oDraft, result: sResult };
        });
      });

      Promise.all(aCalls).then(function (aOutcomes) {
        var aFailed = aOutcomes.filter(function (o) { return o.result && o.result.indexOf("ERROR:") === 0; });
        var aSucceeded = aOutcomes.filter(function (o) { return aFailed.indexOf(o) === -1; });

        // Promotion now includes an async backend DELETE of the just-submitted drafts,
        // so the UI refresh has to wait for it to settle. Refreshing first would have
        // _loadDate re-read the "drafts" model before the removal lands, re-rendering
        // the submitted entry as a Draft right next to its promoted real row.
        var pPromoted = aSucceeded.length
          ? that._promoteDraftsToReal(aSucceeded)
          : Promise.resolve();

        if (aFailed.length) {
          MessageBox.error(aFailed.length + " of " + aDrafts.length + " draft(s) failed to submit: " +
            aFailed.map(function (o) { return o.result.replace(/^ERROR:\s*/, ""); }).join("; "));
        } else {
          MessageToast.show(aSucceeded.length + " draft(s) submitted");
        }

        return pPromoted.then(function () {
          that._loadDate(that._sCurrentIsoDate);
          that._refreshTimeEntriesList();
        });
      }).catch(function (oError) {
        MessageBox.error("Submit failed: " + oError.message);
        that._loadDate(that._sCurrentIsoDate);
        that._refreshTimeEntriesList();
      });
    },

    // S4's write API is asynchronous (see the edit/delete flows above), so rather than
    // waiting on a re-fetch, add the newly-created record straight into the shared
    // real-entries model using the id/status createTimeEntry actually returned, and
    // drop the now-redundant draft.
    _promoteDraftsToReal: function (aSucceeded) {
      var oSharedModel = this.getOwnerComponent().getModel("timesheetData");
      var aRealEntries = oSharedModel.getProperty("/entries") || [];

      aSucceeded.forEach(function (o) {
        var oRaw = null;
        try { oRaw = JSON.parse(o.result).d; } catch (e) { /* fall back to draft values below */ }

        aRealEntries.push({
          employeeId: o.draft.employeeId,
          companyCode: o.draft.companyCode,
          entryDate: o.draft.entryDate,
          status: (oRaw && oRaw.TimeSheetStatus) || "20",
          workCenter: o.draft.workCenter,
          category: o.draft.category,
          hours: o.draft.hours,
          remarks: o.draft.remarks,
          record: (oRaw && oRaw.TimeSheetRecord) || o.draft.record
        });
      });

      oSharedModel.setProperty("/entries", aRealEntries);

      // Returns a promise so the caller can hold the UI refresh until the drafts are
      // actually gone — otherwise the submitted entry renders twice, once as its new
      // real row and once as the not-yet-removed draft.
      //
      // The S4 submit already succeeded by this point — a failed local-draft-delete
      // here is a cleanup problem, not a submit failure, so it must never be presented
      // to the user as if the submit itself failed (that would be misleading and could
      // prompt a duplicate resubmit). Log it and move on; the stale draft can be
      // deleted manually, and _loadDraftsFromBackend will keep showing it until then.
      // Deliberately never rejects, for the same reason.
      return this.getOwnerComponent().removeDraftEntries(aSucceeded.map(function (o) { return o.draft.record; }))
        .then(function (oResult) {
          if (oResult.failed.length) {
            // eslint-disable-next-line no-console
            console.warn(oResult.failed.length + " submitted draft(s) failed to clean up locally " +
              "after a successful S4 submit — they'll still show as drafts until deleted manually.",
              oResult.failed);
          }
        })
        .catch(function (oError) {
          // eslint-disable-next-line no-console
          console.warn("Draft cleanup after a successful S4 submit failed:", oError);
        });
    },

    _removeSharedEntries: function (aDeletedLogs) {
      var aDeletedRecords = aDeletedLogs.map(function (o) { return o.record; });
      var oSharedModel = this.getOwnerComponent().getModel("timesheetData");
      var aEntries = oSharedModel.getProperty("/entries") || [];
      var aRemaining = aEntries.filter(function (e) { return aDeletedRecords.indexOf(e.record) === -1; });
      oSharedModel.setProperty("/entries", aRemaining);
    },

    // The My Timesheets list view stays cached in the NavContainer while this page is
    // open, so its own model needs an explicit sync — it won't pick up edits/deletes
    // to the shared model on its own. Uses syncFromSharedEntries (not refresh) so it
    // reflects the optimistic patch immediately rather than racing S4's async writes.
    _refreshTimeEntriesList: function () {
      var oNavContainer = this.getOwnerComponent().getRootControl().byId("appNavContainer");
      var oPage = oNavContainer && oNavContainer.getPage(this.getOwnerComponent().createId("timeEntries"));
      var oController = oPage && oPage.getController();
      if (oController && oController.syncFromSharedEntries) {
        oController.syncFromSharedEntries();
      }
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("timeEntries");
    }
  });
});
