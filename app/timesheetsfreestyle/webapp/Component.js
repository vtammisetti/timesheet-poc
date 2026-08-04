sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "timesheetsfreestyle/model/models"
], (UIComponent, JSONModel, models) => {
    "use strict";

    return UIComponent.extend("timesheetsfreestyle.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // Set the signed-in user identity here (rather than in a view controller) so it
            // is guaranteed to exist before any view/controller onInit runs.
            // Placeholder identity — replace once Chaitanya confirms the real
            // PersonWorkAgreementExternalID / CompanyCode for this user
            this.setModel(new JSONModel({
                FirstName: "Venkatesh",
                SecondName: "Tammisetti",
                Role: "Employee",
                name: "Venkatesh Tammisetti",
                email: "vtammisetti@ondevicesolutions.com",
                employeeId: "P000023",   // PLACEHOLDER //P000136
                companyCode: "ODUK"      // PLACEHOLDER
            }), "userData");

            // Raw time entries currently loaded in "My Timesheets", shared here so the
            // Object Page can look up a date's logs without a second backend round-trip.
            this.setModel(new JSONModel({ entries: [] }), "timesheetData");

            // Draft entries never touch S4 until the user submits them — kept in their
            // own model (not mixed into timesheetData) and mirrored to localStorage so
            // they survive a page reload, since nothing backs them on the server.
            this.setModel(new JSONModel({ entries: [] }), "drafts");
            this._loadDraftsFromStorage();

            // enable routing
            this.getRouter().initialize();
        },

        getCurrentUser() {
            var oData = this.getModel("userData").getData();
            return {
                name: oData.name,
                email: oData.email,
                employeeId: oData.employeeId,
                companyCode: oData.companyCode
            };
        },

        _draftsStorageKey() {
            return "timesheet-drafts-" + this.getCurrentUser().employeeId;
        },

        _loadDraftsFromStorage() {
            var aDrafts = [];
            try {
                var sRaw = window.localStorage.getItem(this._draftsStorageKey());
                aDrafts = sRaw ? JSON.parse(sRaw) : [];
            } catch (e) {
                aDrafts = [];
            }
            this.getModel("drafts").setProperty("/entries", aDrafts);
        },

        _persistDrafts() {
            try {
                var aDrafts = this.getModel("drafts").getProperty("/entries") || [];
                window.localStorage.setItem(this._draftsStorageKey(), JSON.stringify(aDrafts));
            } catch (e) {
                // localStorage unavailable (private browsing, quota, etc.) — drafts still
                // work for this session, they just won't survive a reload.
            }
        },

        getDraftEntries() {
            return this.getModel("drafts").getProperty("/entries") || [];
        },

        addDraftEntry(oEntry) {
            var aDrafts = this.getDraftEntries();
            aDrafts.push(oEntry);
            this.getModel("drafts").setProperty("/entries", aDrafts);
            this._persistDrafts();
        },

        updateDraftEntry(sRecord, oPatch) {
            var aDrafts = this.getDraftEntries().map(function (o) {
                return o.record === sRecord ? Object.assign({}, o, oPatch) : o;
            });
            this.getModel("drafts").setProperty("/entries", aDrafts);
            this._persistDrafts();
        },

        removeDraftEntries(aRecords) {
            var aDrafts = this.getDraftEntries().filter(function (o) {
                return aRecords.indexOf(o.record) === -1;
            });
            this.getModel("drafts").setProperty("/entries", aDrafts);
            this._persistDrafts();
        }
    });
});