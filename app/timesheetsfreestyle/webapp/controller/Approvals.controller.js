sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "timesheetsfreestyle/model/formatter"
], function (Controller, Fragment, JSONModel, MessageToast, formatter) {
  "use strict";

  return Controller.extend("timesheetsfreestyle.controller.Approvals", {

    formatter: formatter,

    onInit: function () {
      var oManager = this.getOwnerComponent().getCurrentManager();

      this.getView().setModel(new JSONModel({
        entries: [],
        count: 0,
        busy: false,
        // Cosmetic only — see Component#getCurrentManager. Nothing here is sent to the
        // backend: approveEntry/rejectEntry/getEntriesForApproval take no manager.
        managerName: oManager.name,
        managerRole: oManager.role
      }), "approvals");

      // Re-fetch on every navigation to this view, not just the first: entries are
      // submitted from the other half of the app, so a cached list goes stale as soon
      // as the user switches back and forth.
      this.getOwnerComponent().getRouter().getRoute("approvals")
        .attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function () {
      this._loadApprovals();
    },

    onRefreshApprovals: function () {
      this._loadApprovals();
    },

    // getEntriesForApproval returns every SUBMITTED entry across all employees — the
    // backend applies no manager filter by design, so neither does this.
    _loadApprovals: function () {
      var oViewModel = this.getView().getModel("approvals");
      var oModel = this.getOwnerComponent().getModel();
      oViewModel.setProperty("/busy", true);

      return oModel.bindContext("/getEntriesForApproval()").requestObject()
        .then(function (oResult) {
          var aEntries = (oResult && oResult.value) || oResult || [];
          // hours arrives as OData's raw Decimal (3.5), but every hours display in this
          // app reads the "H.MM" convention where the fraction is minutes — so 3.5 would
          // render as "3.05" (3h 5m) instead of "3.50" (3h 30m). Component's
          // _toDraftModelEntry pads the same way for entries that come through there;
          // these rows bypass it, so they are padded here.
          var aRows = aEntries.map(function (oEntry) {
            return Object.assign({}, oEntry, { hours: Number(oEntry.hours).toFixed(2) });
          });
          oViewModel.setProperty("/entries", aRows);
          oViewModel.setProperty("/count", aRows.length);
          oViewModel.setProperty("/busy", false);
        })
        .catch(function (oError) {
          oViewModel.setProperty("/busy", false);
          MessageToast.show("Failed to load approvals: " +
            this.getOwnerComponent().extractODataErrorMessage(oError), { duration: 6000 });
        }.bind(this));
    },

    onApprovePress: function (oEvent) {
      var oRow = oEvent.getSource().getBindingContext("approvals").getObject();
      // Approval triggers a real, non-instant S4 write server-side, so the list is put
      // in busy state for the whole round trip rather than letting the manager click
      // Approve on a second row while the first is still in flight.
      this._runDecision("approveEntry", { ID: oRow.ID },
        "Entry approved and written to your timesheet system.");
    },

    // Reject asks for the reason in a dialog. The row's ID is held on the controller
    // rather than read back from a binding when the dialog is confirmed: the list is
    // re-fetched after every decision, so by confirm time the original binding context
    // may point at a different row (or none at all).
    onRejectPress: function (oEvent) {
      var oRow = oEvent.getSource().getBindingContext("approvals").getObject();
      this._sRejectId = oRow.ID;

      var oView = this.getView();
      if (!this._pRejectDialog) {
        this._pRejectDialog = Fragment.load({
          id: oView.getId(),
          name: "timesheetsfreestyle.view.RejectReasonDialog",
          controller: this
        }).then(function (oDialog) {
          oView.addDependent(oDialog);
          return oDialog;
        });
      }

      this._pRejectDialog.then(function (oDialog) {
        // Fresh model per open, so a reason typed for one entry is never carried over
        // to the next one rejected.
        oDialog.setModel(new JSONModel({
          reason: "",
          busy: false,
          entrySummary: oRow.employeeId + " \u2014 " + formatter.formatDate(oRow.entryDate) +
            " \u2014 " + formatter.normalizeHours(oRow.hours) + "h \u2014 " +
            (oRow.workCenter || "") + " / " + (oRow.category || "")
        }), "rejectDialog");
        oDialog.open();
      });
    },

    // The TextArea's two-way binding only writes back on focus loss, so without this
    // the confirm button would stay disabled while the manager is still looking at the
    // text they just typed.
    onRejectReasonChange: function (oEvent) {
      var oDialogModel = oEvent.getSource().getModel("rejectDialog");
      if (oDialogModel) {
        oDialogModel.setProperty("/reason", oEvent.getParameter("value"));
      }
    },

    onCancelRejectDialog: function () {
      this._sRejectId = null;
      this._pRejectDialog.then(function (oDialog) { oDialog.close(); });
    },

    onConfirmReject: function () {
      var that = this;
      this._pRejectDialog.then(function (oDialog) {
        var sReason = (oDialog.getModel("rejectDialog").getProperty("/reason") || "").trim();
        if (!sReason) {
          // The confirm button is bound disabled in this state, so this only guards
          // against the action being reached some other way — never the normal path.
          MessageToast.show("Enter a rejection reason first.", { duration: 6000 });
          return;
        }
        oDialog.close();
        that._runDecision("rejectEntry", { ID: that._sRejectId, reason: sReason },
          "Entry rejected and sent back to the employee.");
        that._sRejectId = null;
      });
    },

    // Both decisions share one shape: call the action for this row's ID, then re-fetch.
    // The row is not removed locally — _loadApprovals re-reads getEntriesForApproval,
    // which no longer returns the entry once it has left SUBMITTED. That way the list
    // reflects what the server actually did rather than an optimistic guess, and a
    // second manager's concurrent decision shows up in the same refresh.
    _runDecision: function (sAction, mParameters, sSuccessMessage) {
      var that = this;
      var oViewModel = this.getView().getModel("approvals");
      var oModel = this.getOwnerComponent().getModel();

      var oActionBinding = oModel.bindContext("/" + sAction + "(...)");
      Object.keys(mParameters).forEach(function (sKey) {
        oActionBinding.setParameter(sKey, mParameters[sKey]);
      });

      oViewModel.setProperty("/busy", true);

      return oActionBinding.execute().then(function () {
        MessageToast.show(sSuccessMessage);
        // The decision changed the employee's own copy of this entry too, so refresh
        // their side as well — not just this list. Without it the entry keeps showing
        // as "Submitted for Approval" in My Timesheets until a full page reload.
        return that._refreshEmployeeViews().then(function () {
          // Refreshing clears /busy itself.
          return that._loadApprovals();
        });
      }).catch(function (oError) {
        oViewModel.setProperty("/busy", false);
        // A failed approval leaves the entry SUBMITTED server-side, so re-reading keeps
        // the row visible and the manager can retry once the cause is dealt with.
        MessageToast.show(that.getOwnerComponent().extractODataErrorMessage(oError),
          { duration: 6000 });
        return that._loadApprovals();
      });
    },

    // Re-reads the employee's local entries and re-syncs the My Timesheets list, which
    // is kept alive in the NavContainer and so does not rebuild itself when the user
    // navigates back to it. The Object Page needs no nudge: it reloads on its own route
    // match, and by then the refreshed entries are already in the shared model.
    //
    // Mirrors ObjectPage#_refreshTimeEntriesList — the same lookup, from the other
    // direction. Never rejects: a decision that succeeded server-side must not be
    // reported as failed just because a view could not be refreshed.
    _refreshEmployeeViews: function () {
      var oComponent = this.getOwnerComponent();
      return oComponent._loadDraftsFromBackend().then(function () {
        var oNavContainer = oComponent.getRootControl().byId("appNavContainer");
        var oPage = oNavContainer && oNavContainer.getPage(oComponent.createId("timeEntries"));
        var oController = oPage && oPage.getController();
        if (oController && oController.syncFromSharedEntries) {
          oController.syncFromSharedEntries();
        }
      }).catch(function (oError) {
        // eslint-disable-next-line no-console
        console.warn("Could not refresh the employee views after an approval decision:", oError);
      });
    }
  });
});
