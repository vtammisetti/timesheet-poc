sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "timesheetsfreestyle/model/formatter"
], function (Controller,Fragment, JSONModel, Filter, FilterOperator, MessageToast, formatter) {
  "use strict";

  return Controller.extend("timesheetsfreestyle.controller.TimeEntries", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({
        entries: [],
        periodMode: "1W",
        periodLabel: "",
        emptyIllustrationType: "NoActivities",
        emptyTitle: "No Records Recorded",
        emptyDescription: "You haven't logged any time for this period yet.",
        showCreateLogInEmptyState: true
      }), "myModel");
      this.getView().setModel(new JSONModel({ status: [], category: [], workCenter: [] }), "facets");

      // Default landing view: current week, loaded automatically.
      this._periodMode = "1W";
      this._periodAnchor = new Date();
      this._loadCurrentPeriod();
    },

    // Public — called by the App shell's refresh button and after entry submission
    refresh: function () {
      if (this._periodMode === "CUSTOM") {
        this.onGoPress();
      } else {
        this._loadCurrentPeriod();
      }
    },

    onPeriodModeChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      this._periodMode = sKey;
      this._periodAnchor = new Date();

      if (sKey === "CUSTOM") {
        var oDateRange = this.byId("dateRangePicker");
        if (!oDateRange.getDateValue()) {
          var oFrom = new Date();
          oFrom.setDate(oFrom.getDate() - 6);
          oDateRange.setDateValue(oFrom);
          oDateRange.setSecondDateValue(new Date());
        }
        return;
      }

      this._loadCurrentPeriod();
    },

    onPeriodPrev: function () {
      this._shiftPeriod(-1);
    },

    onPeriodNext: function () {
      this._shiftPeriod(1);
    },

    onPeriodToday: function () {
      this._periodAnchor = new Date();
      this._loadCurrentPeriod();
    },

    _shiftPeriod: function (iDirection) {
      if (this._periodMode === "1D") {
        this._periodAnchor.setDate(this._periodAnchor.getDate() + iDirection);
      } else if (this._periodMode === "1M") {
        this._periodAnchor.setMonth(this._periodAnchor.getMonth() + iDirection);
      } else {
        this._periodAnchor.setDate(this._periodAnchor.getDate() + (iDirection * 7));
      }
      this._loadCurrentPeriod();
    },

    _loadCurrentPeriod: function () {
      var oRange = this._computePeriodRange(this._periodMode, this._periodAnchor);
      this.getView().getModel("myModel").setProperty("/periodLabel", oRange.label);

      var oUser = this.getOwnerComponent().getCurrentUser();
      this._loadEntries(oUser.employeeId, this._formatForBackend(oRange.from), this._formatForBackend(oRange.to));
    },

    // Translate the active period mode + anchor date into a from/to range and a display label
    _computePeriodRange: function (sMode, oAnchor) {
      var oToday = new Date();

      if (sMode === "1D") {
        var sIsToday = this._formatForBackend(oAnchor) === this._formatForBackend(oToday);
        var sDayLabel = sIsToday
          ? "Today"
          : oAnchor.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
        return { from: oAnchor, to: oAnchor, label: sDayLabel };
      }

      if (sMode === "1M") {
        var oMonthFrom = new Date(oAnchor.getFullYear(), oAnchor.getMonth(), 1);
        var oMonthTo = new Date(oAnchor.getFullYear(), oAnchor.getMonth() + 1, 0);
        return { from: oMonthFrom, to: oMonthTo, label: oAnchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
      }

      // 1W (default)
      var oWeekStart = this._getWeekStart(oAnchor);
      var oWeekEnd = new Date(oWeekStart);
      oWeekEnd.setDate(oWeekEnd.getDate() + 6);
      var bIsCurrentWeek = this._formatForBackend(this._getWeekStart(oToday)) === this._formatForBackend(oWeekStart);
      var sWeekLabel = (bIsCurrentWeek ? "This Week: " : "") +
        oWeekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " - " +
        oWeekEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      return { from: oWeekStart, to: oWeekEnd, label: sWeekLabel };
    },

    onGoPress: function () {
      var oDateRange = this.byId("dateRangePicker");
      var oFrom = oDateRange.getDateValue();
      var oTo = oDateRange.getSecondDateValue();

      if (!oFrom || !oTo) {
        MessageToast.show("Please select a date range first");
        return;
      }

      var sFromDate = this._formatForBackend(oFrom);
      var sToDate = this._formatForBackend(oTo);
      var sLabel = oFrom.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
        " - " + oTo.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      this.getView().getModel("myModel").setProperty("/periodLabel", sLabel);

      var oUser = this.getOwnerComponent().getCurrentUser();
      this._loadEntries(oUser.employeeId, sFromDate, sToDate);
    },

    _formatForBackend: function (oDate) {
      var y = oDate.getFullYear();
      var m = String(oDate.getMonth() + 1).padStart(2, "0");
      var d = String(oDate.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + d;
    },

    _loadEntries: function (sEmployeeId, sFromDate, sToDate) {
      var oModel = this.getOwnerComponent().getModel();
      var sUrl = "/getMyTimeEntries(employeeId='" + sEmployeeId +
                 "',fromDate='" + sFromDate + "',toDate='" + sToDate + "')";

      var oContextBinding = oModel.bindContext(sUrl);

      oContextBinding.requestObject().then(function (oResult) {
        var aEntries = oResult.value || oResult;
        this.getView().getModel("myModel").setProperty("/entries", aEntries);
        this._buildFacets(aEntries);
        this._setEmptyState(aEntries.length > 0, false);
      }.bind(this)).catch(function (oError) {
        MessageToast.show("Failed to load entries: " + oError.message);
      });
    },

    // Switch the table's empty-state illustration/copy between "nothing logged yet"
    // (show Create Log) and "filters matched nothing" (no Create Log)
    _setEmptyState: function (bHasEntries, bFilteredEmpty) {
      var oModel = this.getView().getModel("myModel");
      if (bFilteredEmpty) {
        oModel.setProperty("/emptyIllustrationType", "NoFilterResults");
        oModel.setProperty("/emptyTitle", "No Matching Entries");
        oModel.setProperty("/emptyDescription", "Try adjusting your search or filters.");
        oModel.setProperty("/showCreateLogInEmptyState", false);
      } else if (!bHasEntries) {
        oModel.setProperty("/emptyIllustrationType", "NoActivities");
        oModel.setProperty("/emptyTitle", "No Records Recorded");
        oModel.setProperty("/emptyDescription",
          "You haven't logged any time for " + oModel.getProperty("/periodLabel") + ". Click \"Create Log\" to add an entry.");
        oModel.setProperty("/showCreateLogInEmptyState", true);
      }
    },

    // Derive facet filter options from the actual data returned — no hardcoded lists
    _buildFacets: function (aEntries) {
      var mStatus = {}, mCategory = {}, mWorkCenter = {};

      aEntries.forEach(function (e) {
        if (e.status) mStatus[e.status] = true;
        if (e.category) mCategory[e.category] = true;
        if (e.workCenter) mWorkCenter[e.workCenter] = true;
      });

      var toFacetArray = function (mMap, fnLabel) {
        return Object.keys(mMap).map(function (k) {
          return { key: k, text: fnLabel ? fnLabel(k) : k };
        });
      };

      this.getView().getModel("facets").setData({
        status: toFacetArray(mStatus, formatter.formatStatus),
        category: toFacetArray(mCategory),
        workCenter: toFacetArray(mWorkCenter)
      });
    },

    onFacetFilterConfirm: function (oEvent) {
      var oFacetFilter = this.byId("idFacetFilter");
      var aSelectedKeys = [];

      oFacetFilter.getLists().forEach(function (oList) {
        var sListKey = oList.getKey();
        oList.getSelectedItems().forEach(function (oItem) {
          aSelectedKeys.push({ field: sListKey, value: oItem.getKey() });
        });
      });

      this._applyFilters(aSelectedKeys, this.byId("searchField").getValue());
    },

    onFacetFilterReset: function () {
      this._applyFilters([], this.byId("searchField").getValue());
    },

    onSearch: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue");
      var oFacetFilter = this.byId("idFacetFilter");
      var aSelectedKeys = [];

      oFacetFilter.getLists().forEach(function (oList) {
        var sListKey = oList.getKey();
        oList.getSelectedItems().forEach(function (oItem) {
          aSelectedKeys.push({ field: sListKey, value: oItem.getKey() });
        });
      });

      this._applyFilters(aSelectedKeys, sQuery);
    },

    _applyFilters: function (aFacetKeys, sSearchQuery) {
      var oTable = this.byId("entriesTable");
      var oBinding = oTable.getBinding("items");
      var aFilters = [];

      // Group facet selections by field, OR within a field, AND across fields
      var mByField = {};
      aFacetKeys.forEach(function (o) {
        mByField[o.field] = mByField[o.field] || [];
        mByField[o.field].push(new Filter(o.field, FilterOperator.EQ, o.value));
      });
      Object.keys(mByField).forEach(function (sField) {
        aFilters.push(new Filter({ filters: mByField[sField], and: false }));
      });

      if (sSearchQuery) {
        aFilters.push(new Filter({
          filters: [
            new Filter("workCenter", FilterOperator.Contains, sSearchQuery),
            new Filter("category", FilterOperator.Contains, sSearchQuery),
            new Filter("remarks", FilterOperator.Contains, sSearchQuery)
          ],
          and: false
        }));
      }

      oBinding.filter(new Filter({ filters: aFilters, and: true }));

      var aRawEntries = this.getView().getModel("myModel").getProperty("/entries");
      var bHasEntries = aRawEntries.length > 0;
      var bFilteredEmpty = bHasEntries && oBinding.getLength() === 0;
      this._setEmptyState(bHasEntries, bFilteredEmpty);
    },

    onSortPress: function () {
      MessageToast.show("Sort dialog — coming soon");
    },

    onCreateEntryPress: function () {
  var oView = this.getView();

  if (!this._pDialog) {
    this._pDialog = Fragment.load({
      id: oView.getId(),
      name: "timesheetsfreestyle.view.CreateEntryDialog",
      controller: this
    }).then(function (oDialog) {
      oView.addDependent(oDialog);
      return oDialog;
    });
  }

  this._pDialog.then(function (oDialog) {
    var oUser = this.getOwnerComponent().getCurrentUser();

    this._selectedDate = new Date(); // today, for Day view
    this._weekStart = this._getWeekStart(new Date()); // Monday of current week, for Week view

    var oDialogModel = new JSONModel({
      employeeId: oUser.employeeId,
      companyCode: oUser.companyCode,
      viewMode: "day",
      periodLabel: "",
      dayRows: this._buildDefaultDayRows(),
      weekRows: this._buildDefaultWeekRows(),
      weekDates: [],
      weekTotal: "0.00"
    });

    oDialog.setModel(oDialogModel, "entryDialog");
    this._refreshPeriodLabel(oDialog);
    this._refreshWeekDates(oDialog);
    oDialog.open();
  }.bind(this));
},

_buildDefaultDayRows: function () {
  var aRows = [];
  for (var i = 1; i <= 5; i++) {
    aRows.push({ sNo: i, category: "TRAI", workCenter: "OD11101901", remarks: "", hours: "" });
  }
  return aRows;
},

_buildDefaultWeekRows: function () {
  var aRows = [];
  for (var i = 0; i < 5; i++) {
    aRows.push({
      category: "TRAI",
      workCenter: "OD11101901",
      remarks: "",
      hoursByDay: { day0: "", day1: "", day2: "", day3: "", day4: "", day5: "", day6: "" }
    });
  }
  return aRows;
},

_getWeekStart: function (oDate) {
  var oResult = new Date(oDate);
  var iDay = oResult.getDay(); // 0=Sun
  var iDiff = iDay === 0 ? -6 : 1 - iDay; // shift to Monday
  oResult.setDate(oResult.getDate() + iDiff);
  return oResult;
},

_formatForBackendDate: function (oDate) {
  var y = oDate.getFullYear();
  var m = String(oDate.getMonth() + 1).padStart(2, "0");
  var d = String(oDate.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
},

_refreshPeriodLabel: function (oDialog) {
  var oModel = oDialog.getModel("entryDialog");
  var sMode = oModel.getProperty("/viewMode");

  if (sMode === "day") {
    var sLabel = this._selectedDate.toDateString() === new Date().toDateString()
      ? "Today"
      : this._selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    oModel.setProperty("/periodLabel", sLabel);
  } else {
    var oEnd = new Date(this._weekStart);
    oEnd.setDate(oEnd.getDate() + 6);
    var sStartLabel = this._weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    var sEndLabel = oEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    oModel.setProperty("/periodLabel", sStartLabel + " - " + sEndLabel);
  }
},

_refreshWeekDates: function (oDialog) {
  var oModel = oDialog.getModel("entryDialog");
  var aDates = [];
  for (var i = 0; i < 7; i++) {
    var oDay = new Date(this._weekStart);
    oDay.setDate(oDay.getDate() + i);
    aDates.push({
      isoDate: this._formatForBackendDate(oDay),
      label: oDay.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
             "\n" + oDay.toLocaleDateString("en-US", { weekday: "short" })
    });
  }
  oModel.setProperty("/weekDates", aDates);
},

onViewModeChange: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    this._refreshPeriodLabel(oDialog);
  }.bind(this));
},

onPrevPeriod: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var sMode = oModel.getProperty("/viewMode");

    if (sMode === "day") {
      this._selectedDate.setDate(this._selectedDate.getDate() - 1);
    } else {
      this._weekStart.setDate(this._weekStart.getDate() - 7);
      this._refreshWeekDates(oDialog);
    }
    this._refreshPeriodLabel(oDialog);
  }.bind(this));
},

onNextPeriod: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var sMode = oModel.getProperty("/viewMode");

    if (sMode === "day") {
      this._selectedDate.setDate(this._selectedDate.getDate() + 1);
    } else {
      this._weekStart.setDate(this._weekStart.getDate() + 7);
      this._refreshWeekDates(oDialog);
    }
    this._refreshPeriodLabel(oDialog);
  }.bind(this));
},

onAddDayRow: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var aRows = oModel.getProperty("/dayRows");
    aRows.push({ sNo: aRows.length + 1, category: "TRAI", workCenter: "OD11101901", remarks: "", hours: "" });
    oModel.setProperty("/dayRows", aRows);
  });
},

onDeleteDayRow: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    var oItem = oEvent.getSource().getParent();
    var oTable = this.byId("dayRowsTable");
    var oModel = oDialog.getModel("entryDialog");
    var iIndex = oTable.getItems().indexOf(oItem);
    var aRows = oModel.getProperty("/dayRows");
    aRows.splice(iIndex, 1);
    oModel.setProperty("/dayRows", aRows);
  }.bind(this));
},

onAddWeekRow: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var aRows = oModel.getProperty("/weekRows");
    aRows.push({
      category: "TRAI", workCenter: "OD11101901", remarks: "",
      hoursByDay: { day0: "", day1: "", day2: "", day3: "", day4: "", day5: "", day6: "" }
    });
    oModel.setProperty("/weekRows", aRows);
  });
},

onDeleteWeekRow: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    var oItem = oEvent.getSource().getParent();
    var oTable = this.byId("weekRowsTable");
    var oModel = oDialog.getModel("entryDialog");
    var iIndex = oTable.getItems().indexOf(oItem);
    var aRows = oModel.getProperty("/weekRows");
    aRows.splice(iIndex, 1);
    oModel.setProperty("/weekRows", aRows);
  }.bind(this));
},

onCancelDialog: function () {
  this._pDialog.then(function (oDialog) { oDialog.close(); });
},

onSubmitEntries: function () {
  var that = this;

  this._pDialog.then(function (oDialog) {
    var oData = oDialog.getModel("entryDialog").getData();
    var oModel = that.getOwnerComponent().getModel();
    var aCalls = [];

    if (oData.viewMode === "day") {
      var sDate = that._formatForBackendDate(that._selectedDate);
      oData.dayRows.forEach(function (oRow) {
        if (oRow.workCenter && oRow.category && oRow.hours) {
          aCalls.push(that._createOneEntry(oModel, oData.employeeId, oData.companyCode, {
            date: sDate, category: oRow.category, workCenter: oRow.workCenter,
            hours: oRow.hours, remarks: oRow.remarks
          }));
        }
      });
    } else {
      oData.weekRows.forEach(function (oRow) {
        oData.weekDates.forEach(function (oDay, i) {
          var sKey = "day" + i;
          var sHours = oRow.hoursByDay[sKey];
          if (sHours && parseFloat(sHours) > 0 && oRow.workCenter && oRow.category) {
            aCalls.push(that._createOneEntry(oModel, oData.employeeId, oData.companyCode, {
              date: oDay.isoDate, category: oRow.category, workCenter: oRow.workCenter,
              hours: sHours, remarks: oRow.remarks
            }));
          }
        });
      });
    }

    if (!aCalls.length) {
      MessageBox.error("Enter at least one valid row with Work Center, Task Type, and Hours.");
      return;
    }

    oDialog.setBusy(true);
    Promise.all(aCalls).then(function () {
      oDialog.setBusy(false);
      oDialog.close();
      MessageToast.show(aCalls.length + " entries submitted (test-run mode)");
      that.refresh();
    }).catch(function (oError) {
      oDialog.setBusy(false);
      MessageBox.error("One or more entries failed: " + oError.message);
    });
  });
},

_createOneEntry: function (oModel, sEmployeeId, sCompanyCode, oRow) {
  var oActionBinding = oModel.bindContext("/createTimeEntry(...)");
  oActionBinding.setParameter("employeeId", sEmployeeId);
  oActionBinding.setParameter("companyCode", sCompanyCode);
  oActionBinding.setParameter("entryDate", oRow.date);
  oActionBinding.setParameter("workCenter", oRow.workCenter);
  oActionBinding.setParameter("category", oRow.category);
  oActionBinding.setParameter("startTime", "");
  oActionBinding.setParameter("endTime", "");
  oActionBinding.setParameter("hours", parseFloat(oRow.hours));
  oActionBinding.setParameter("remarks", oRow.remarks || "");
  return oActionBinding.execute().then(function () {
    return oActionBinding.getBoundContext().getObject();
  });
}
  });
});