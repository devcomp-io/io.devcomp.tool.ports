
const PATH = require("path");
const FS = require("fs");
const EXEC = require("child_process").exec;
const SPAWN = require("child_process").spawn;


var pioConfig = JSON.parse(FS.readFileSync(PATH.join(__dirname, "../../../.pio.json"), "utf8"));


exports.app = function (req, res, next) {

	function getPorts (callback) {

		var ports = {};
		var columns;

		function makeRow (columns, fields) {
			var row = {};
			fields.forEach(function (field, index) {
				if (columns[index]) {
					row[columns[index]] = field;
				} else {
					row[columns[columns.length - 1]] += " " + field;
				}
			});
			return row;
		}


		var proc = SPAWN("bash");
		proc.stderr.on('data', function (data) {
		  console.log('stderr: ' + data);
		});
		var buffer = [];
		proc.stdout.on('data', function (data) {
			buffer.push(data.toString());
		});
		proc.on('close', function (code) {
			if (code !== 0) {
				return callback(new Error("Process exit status != 0"));
			}
			columns = null;
			buffer.join("").split("\n").forEach(function (line) {
				if (!line) return;

				if (/^Proto/.test(line)) {
					line = line
						.replace("Proto", "protocol")
						.replace("Local Address", "localAddress")
						.replace("Foreign Address", "foreignAddress")
						.replace("State", "state")
						.replace("PID/Program name", "programIdentifier");
				}

				var fields = line.replace(/[\t\s]+/g, " ").replace(/(^\s|\s$)/g, "").split(/\s/);

				if (fields[0] === "Active") {
					// ignore
				} else
				if (fields[0] === "protocol") {
					columns = fields;
				} else {

					if (fields[0] === "udp") {
						fields.splice(fields.length - 1, 0, "");
					}

					var port = makeRow(columns, fields);

					var programIdentified = port.programIdentifier.split("/");
					if (
						programIdentified.length === 2 &&
						/^\d+$/.test(programIdentified[0])
					) {
						port.pid = programIdentified[0];
						port.programName = programIdentified[1];
					} else {
						port.pid = "-";
						port.programName = "";
					}
					if (!ports[port.pid]) {
						ports[port.pid] = {};
					}
					ports[port.pid][port.localAddress] = port;
				}
			});

			return callback(null, ports)
		});
		proc.stdin.write("netstat -putan or lsof");
		return proc.stdin.end();
	}

	return getPorts(function (err, ports) {
		if (err) return next(err);

		function respond(body) {
			res.writeHead(200, {
				"Content-Type": "application/json",
				"Content-Length": body.length,
				"Cache-Control": "max-age=5"  // seconds
			});
		    return res.end(body);
		}

		return respond(JSON.stringify(ports, null, 4));
	});
}

