module.exports = function (RED) {
    const nodes7 = require("nodes7");
    let conn = new nodes7();  // Keep connection persistent

    function nodes7_dynamic(config) {
        var node = this;
        RED.nodes.createNode(this, config);
        var intervalID = null;
        var isConnected = false;  // Track connection state

        node.on("input", function (msg) {
            const plc_config = msg.payload.ACS.config;
            const variables = msg.payload.ACS.variables;

            const plcConnectionParams = {
                port: parseInt(plc_config.port),
                host: plc_config.host,
                rack: parseInt(plc_config.rack),
                slot: parseInt(plc_config.slot),
                timeout: parseInt(plc_config.timeout),
            };

            const cycletime = parseInt(plc_config.cycletime);

            if (isConnected) {
                node.log("Already connected to PLC. Updating variables only.");
                updateVariablesAndRead();
                return;  // Skip reconnection
            }

            node.status({
                fill: "yellow",
                shape: "ring",
                text: "Connecting to " + plcConnectionParams.host + "...",
            });

            conn.initiateConnection(plcConnectionParams, function (err) {
                if (err) {
                    node.error("Error connecting to PLC: " + err);
                    node.status({
                        fill: "red",
                        shape: "ring",
                        text: "Failed to connect to " + plcConnectionParams.host,
                    });
                    return;
                }

                node.log("Connected to PLC: " + plcConnectionParams.host);
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: "Connected to " + plcConnectionParams.host,
                });

                isConnected = true;  // Mark as connected

                updateVariablesAndRead();  // Call function to set variables and read
            });

            function updateVariablesAndRead() {
                const plcVariables = {};
                variables.forEach((variable) => {
                    plcVariables[variable.name] = variable.value;
                });

                conn.setTranslationCB((tag) => plcVariables[tag]);
                conn.addItems(Object.keys(plcVariables));

                if (intervalID) clearInterval(intervalID); // Clear existing loop
                intervalID = setInterval(() => {
                    conn.readAllItems((anythingBad, values) => {
                        if (anythingBad) {
                            node.error("Error reading PLC values");
                        } else {
                            node.log("Read values: " + JSON.stringify(values));
                            node.log("Cycle time: " + cycletime + "ms");

                            msg.payload = {
                                variables: variables.map((variable) => ({
                                    name: variable.name,
                                    value: values[variable.name], // Get actual value
                                    unit: variable.unit,
                                })),
                            };
                            node.send(msg);
                        }
                    });
                }, cycletime);
            }
        });

        node.on("close", function (done) {
            node.log("Disconnecting from PLC...");
            if (intervalID) {
                clearInterval(intervalID);
                node.log("Cyclic read loop stopped.");
            }
            conn.dropConnection(function () {
                node.log("PLC Disconnected.");
                node.status({ fill: "red", shape: "ring", text: "Offline" });
                isConnected = false; // Reset connection status
                done();
            });
        });
    }

    RED.nodes.registerType("s7 dynamic", nodes7_dynamic);
};
