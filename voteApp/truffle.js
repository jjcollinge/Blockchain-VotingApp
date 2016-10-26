module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "javascripts/app.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/"
  },
  rpc: {
    host: "localhost",
    port: 8545
  },
  networks: {
    "bletchley": {
      network_id: 26092009,
      host: "meoi2gvlg.westeurope.cloudapp.azure.com"
    }
  }
};
