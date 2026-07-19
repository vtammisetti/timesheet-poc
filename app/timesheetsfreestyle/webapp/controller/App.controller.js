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
      var oMainContent = this.byId("app").getMainContents()[0];
      return oMainContent && oMainContent.getController ? oMainContent.getController() : null;
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

    onNavItemSelect: function () {
      // Only one nav item exists right now
    }
  });
});