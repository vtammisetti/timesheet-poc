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

            // enable routing
            // this.getRouter().initialize();
        },

        getCurrentUser() {
            var oData = this.getModel("userData").getData();
            return {
                name: oData.name,
                email: oData.email,
                employeeId: oData.employeeId,
                companyCode: oData.companyCode
            };
        }
    });
});