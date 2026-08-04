sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/Menu",
  "sap/m/MenuItem",
  "sap/m/MessageToast"
], function (Controller, Menu, MenuItem, MessageToast) {
  "use strict";

  return Controller.extend("timesheetsfreestyle.controller.App", {

    onInit: function () {
      // User identity now lives on the Component (see Component.js) so it is
      // available before this or any nested view's onInit runs.
    },

    onAfterRendering: function () {
      this._hideSplashScreen();
    },

    _hideSplashScreen: function () {
      if (this._bSplashHidden) {
        return;
      }
      this._bSplashHidden = true;

      var oSplash = document.getElementById("appSplashScreen");
      if (!oSplash) {
        return;
      }
      oSplash.classList.add("tsSplashHidden");
      oSplash.addEventListener("transitionend", function () {
        if (oSplash.parentNode) {
          oSplash.parentNode.removeChild(oSplash);
        }
      }, { once: true });
    },

    onSideNavButtonPress: function () {
      var oSideNav = this.byId("sideNav");
      oSideNav.setExpanded(!oSideNav.getExpanded());
    },

    onRefreshApp: function () {
      var oTimeEntriesController = this._getTimeEntriesController();
      if (oTimeEntriesController && oTimeEntriesController.refresh) {
        oTimeEntriesController.refresh();
        MessageToast.show("Refreshed");
      }
    },

    _getTimeEntriesController: function () {
      var oNavContainer = this.byId("appNavContainer");
      var oCurrentPage = oNavContainer && oNavContainer.getCurrentPage();
      if (!oCurrentPage || oCurrentPage.getId() !== this.getOwnerComponent().createId("timeEntries")) {
        return null;
      }
      return oCurrentPage.getController();
    },

    onUserNamePress: function (oEvent) {
      if (!this._oMenu) {
        this._oMenu = new Menu({
          items: [
            new MenuItem({ text: "Personalization" }),
            new MenuItem({ text: "Settings" }),
            new MenuItem({ text: "Logout" })
          ]
        });
      }
      this._oMenu.openBy(oEvent.getSource());
    },

    onNavItemSelect: function (oEvent) {
      if (oEvent.getParameter("item").getKey() === "myTimesheets") {
        this.getOwnerComponent().getRouter().navTo("timeEntries");
      }
    }
  });
});