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

      // Hours are "H.MM", so they can't be added as decimals — see formatter.sumHours.
      var sTotalHours = formatter.sumHours(aLogs.map(function (e) { return e.hours; }));
      var sOverallStatus = formatter.overallStatusCode(aLogs);

      this.getView().getModel("objectPage").setData({
        isoDate: sIsoDate,
        displayDate: formatter.formatDate(sIsoDate),
        employeeId: oUser.employeeId,
        employeeLabel: oUser.name,
        companyCode: oUser.companyCode,
        totalHours: sTotalHours,
        logCount: aLogs.length,
        overallStatusText: aLogs.length ? formatter.formatStatus(sOverallStatus) : "No Status",
        overallStatusState: aLogs.length ? formatter.statusState(sOverallStatus) : "None",
        logs: aSortedLogs,
        displayLogs: aSortedLogs,
        searchQuery: "",
        editEnabled: false,
        deleteEnabled: false,
        submitEnabled: false,
        resubmitEnabled: false
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
    // An APPROVED local row is finalized in exactly the same sense as an S4 Approved
    // (30) or Processed (60) row: it has been written to the timesheet system and
    // nothing further can be done to it here, so it gets the same disabled+checked
    // "finalized" marker rather than being selectable.
    _toSelectableLog: function (oLog) {
      var bSelectable = (!!oLog.isDraft && oLog.status !== "APPROVED") || oLog.status === "20";
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

    // isDraft means "this row lives in the local TimeEntries table", not "this row is
    // editable" — a local row can now be DRAFT, SUBMITTED, APPROVED or REJECTED. So
    // every action gates on the status as well, not just on isDraft:
    //   DRAFT     — edit, delete, submit
    //   SUBMITTED — nothing (it is with the manager; deleting it would strand the
    //               approval, and editing it would change what is being approved)
    //   REJECTED  — delete or resubmit, but not edit: it goes back to DRAFT first
    //   APPROVED  — nothing at all, it has been written to S4 and is audit history
    _updateActionEnablement: function () {
      var aLogs = this._getSelectedLogs();
      var bIsLocal = function (o) { return o.isDraft === true; };
      var bAllDraftStatus = aLogs.length > 0 && aLogs.every(function (o) {
        return bIsLocal(o) && o.status === "DRAFT";
      });

      var oModel = this.getView().getModel("objectPage");
      // Edit is Draft-only, full stop — once a log is real (submitted), it's read-only
      // in this app even if S4 itself would still technically allow changing it.
      oModel.setProperty("/editEnabled",
        aLogs.length === 1 && bIsLocal(aLogs[0]) && aLogs[0].status === "DRAFT");
      oModel.setProperty("/deleteEnabled", aLogs.length >= 1 && aLogs.every(function (o) {
        return !bIsLocal(o) || (o.status !== "APPROVED" && o.status !== "SUBMITTED");
      }));
      oModel.setProperty("/submitEnabled", bAllDraftStatus);
      oModel.setProperty("/resubmitEnabled",
        aLogs.length === 1 && bIsLocal(aLogs[0]) && aLogs[0].status === "REJECTED");
    },

    onEditLogPress: function () {
      var aLogs = this._getSelectedLogs();
      // Guard mirrors editEnabled: only a local row still in DRAFT opens the dialog.
      // A REJECTED row is read-only until Resubmit puts it back into DRAFT.
      if (aLogs.length !== 1 || !aLogs[0].isDraft || aLogs[0].status !== "DRAFT") return;
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
          MessageToast.show("Date, Work Center, Task Type, and Hours are required.", { duration: 6000 });
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
        // updateDraftEntry already unwraps the server's validation message, so
        // oError.message is the specific reason, not a generic failure.
        MessageToast.show("Failed to save draft: " + oError.message, { duration: 6000 });
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
            MessageToast.show(oResult.succeeded.length + " draft log(s) deleted, " +
              oResult.failed.length + " failed to delete. Please try again.", { duration: 6000 });
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
          MessageToast.show(iDeleted + " log(s) deleted, but " + oDraftResult.failed.length +
            " draft log(s) failed to delete. Please try again.", { duration: 6000 });
        } else {
          MessageToast.show(iDeleted + " log(s) deleted");
        }
        that._removeSharedEntries(aRealLogs);
        that._loadDate(that._sCurrentIsoDate);
        that._refreshTimeEntriesList();
      }).catch(function (oError) {
        MessageToast.show("Delete failed: " + oError.message, { duration: 6000 });
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

    // Hands each selected draft to the approval workflow via submitEntry. This no
    // longer touches S4: submitting only moves the local TimeEntries row from DRAFT to
    // SUBMITTED, and the real S4 write happens later, once (and only if) a manager
    // approves it from the Approvals screen. That is why there is no promote-to-real
    // step here any more — the row stays exactly where it is with a new status. The old
    // _promoteDraftsToReal helper went with it: promoting on submit would show the entry
    // as though it had already reached the timesheet system, which is now untrue until
    // approval, and nothing else called it.
    //
    // Each call is independent: submitEntry re-runs the same field validation the
    // entity's own CREATE/UPDATE hooks apply, so one invalid draft is reported without
    // stopping the rest, matching how the delete and copyWeek paths already behave.
    _submitDrafts: function (aDrafts) {
      var that = this;
      var oComponent = this.getOwnerComponent();
      var oModel = oComponent.getModel();

      var aCalls = aDrafts.map(function (oDraft) {
        var oActionBinding = oModel.bindContext("/submitEntry(...)");
        // The local row's own key. _toDraftModelEntry renames ID -> record, so this is
        // the TimeEntries UUID, not an S4 TimeSheetRecord.
        oActionBinding.setParameter("ID", oDraft.record);
        return oActionBinding.execute().then(function () {
          return { draft: oDraft, ok: true };
        }).catch(function (oError) {
          return { draft: oDraft, ok: false, message: oComponent.extractODataErrorMessage(oError) };
        });
      });

      Promise.all(aCalls).then(function (aOutcomes) {
        var aFailed = aOutcomes.filter(function (o) { return !o.ok; });
        var aSucceeded = aOutcomes.filter(function (o) { return o.ok; });

        if (aFailed.length) {
          MessageToast.show(aFailed.length + " of " + aDrafts.length + " draft(s) failed to submit: " +
            aFailed.map(function (o) { return o.message; }).join("; "), { duration: 6000 });
        } else {
          MessageToast.show(aSucceeded.length + " draft(s) submitted for approval");
        }

        // Re-read the local entries so the rows pick up their new SUBMITTED status.
        // Unlike the S4 write path this is a plain local read with no async-visibility
        // lag, so the refreshed values are already correct.
        return oComponent._loadDraftsFromBackend().then(function () {
          that._loadDate(that._sCurrentIsoDate);
          that._refreshTimeEntriesList();
        });
      }).catch(function (oError) {
        MessageToast.show("Submit failed: " + oComponent.extractODataErrorMessage(oError), { duration: 6000 });
        that._loadDate(that._sCurrentIsoDate);
        that._refreshTimeEntriesList();
      });
    },

    // Resubmit puts a REJECTED entry back into the employee's hands as a plain DRAFT.
    // No new backend action is needed: it is an ordinary PATCH of status on the
    // TimeEntries entity, which re-runs the existing validateEntryFields UPDATE hook in
    // partial mode — that only validates fields actually present in the payload, so a
    // status-only patch passes without needing to resend the whole entry.
    //
    // rejectionReason is cleared in the same patch: leaving the old reason behind would
    // keep showing a stale rejection against a row that is now an ordinary draft.
    onResubmitPress: function () {
      var that = this;
      var aLogs = this._getSelectedLogs().filter(function (o) {
        return o.isDraft && o.status === "REJECTED";
      });
      if (aLogs.length !== 1) return;

      var oComponent = this.getOwnerComponent();
      oComponent.updateDraftEntry(aLogs[0].record, { status: "DRAFT", rejectionReason: "" })
        .then(function () {
          MessageToast.show("Entry moved back to Draft — edit it and submit again.");
          return oComponent._loadDraftsFromBackend();
        })
        .then(function () {
          that._loadDate(that._sCurrentIsoDate);
          that._refreshTimeEntriesList();
        })
        .catch(function (oError) {
          MessageToast.show("Could not resubmit: " + oError.message, { duration: 6000 });
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
