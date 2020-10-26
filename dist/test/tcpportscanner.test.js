"use strict";
// Author to Blame: haneefdm on github
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const http = require("http");
const tcpportscanner_1 = require("../src/tcpportscanner");
/**
 * Sorry, this is a slow test because we are testing timeouts. Hate anything time related
 * because you never know how well it works on a slow/loaded machine. And we are dealing
 * with tcp ports that can open/close randomly, so there can be false failures but hopefully
 * no false positives. If your computer is quiet enough, we should be able to get through
 * the test fine
 */
suite('TcpPortScanner Tests', () => {
    test('TcpPortScanner finder/waitfor(open/close) tests', () => __awaiter(this, void 0, void 0, function* () {
        let hrStart = process.hrtime();
        function timeit() {
            const hrEnd = process.hrtime(hrStart);
            const ms = (hrEnd[1] / 1e6).toFixed(2);
            const ret = `${hrEnd[0]}s ${ms}ms`;
            hrStart = process.hrtime();
            return ret;
        }
        const doLog = false;
        const args = {
            min: 51000,
            max: 52000,
            retrieve: 4,
            consecutive: false,
            doLog: doLog
        };
        let ports;
        const hostNameOrIp = '0.0.0.0';
        timeit();
        yield tcpportscanner_1.TcpPortScanner.findFreePorts(args, hostNameOrIp).then((ret) => {
            if (doLog) {
                console.log(`Found free ports ${ret}, ${timeit()}`);
            }
            ports = ret;
            assert.strictEqual(ports.length, args.retrieve, `wrong number of ports ${ports}`);
            assert.strictEqual(ports[0] >= args.min, true);
            assert.strictEqual(ports[args.retrieve - 1] <= args.max, true);
            assert.deepStrictEqual(ports, ports.sort(), `ports are not ordered? ${ports}`);
        }).catch((e) => {
            assert.fail(`TcpPortScanner.find failed, ${timeit()} ` + e);
        });
        const port = ports[1];
        timeit();
        yield tcpportscanner_1.TcpPortScanner.waitForPortOpen(port, hostNameOrIp, false, 100, 400).then(() => {
            assert.fail(`0: Timeout expected on port ${port} ${timeit()}`);
        }, (err) => __awaiter(this, void 0, void 0, function* () {
            if (doLog) {
                console.log(`0: Timeout: Success waiting on port ${port} ${timeit()} `, err.message);
            }
            assert.strictEqual(err.message, 'timeout');
            // Lets create a server, but don't start listening for a while. This could have been
            // simpler just using 'net' module
            const server = http.createServer();
            setTimeout(() => {
                server.listen(port, (err) => {
                    if (err) {
                        assert.fail(`Could not start http server on port ${port} ${timeit()}`);
                    }
                });
                if (doLog) {
                    console.log(`Http server is listening on ${port} ${timeit()}`);
                }
            }, 200);
            if (doLog) {
                console.log(`Waiting for http server to start... ${timeit()}`);
            }
            // See if the server started on the requested port
            timeit();
            yield tcpportscanner_1.TcpPortScanner.waitForPortOpen(port, hostNameOrIp, true, 50, 1000).then(() => {
                if (doLog) {
                    console.log(`1. Success server port ${port} is ready ${timeit()}`);
                }
            }, (err) => {
                if (doLog) {
                    console.log(`1. Timeout: Failed waiting on port ${port} to open ${timeit()}`, err);
                }
                assert.fail('unexpected timeout ' + err);
            });
            timeit();
            yield tcpportscanner_1.TcpPortScanner.waitForPortOpenOSUtil(port, 50, 1000, false, doLog).then(() => {
                if (doLog) {
                    console.log(`1.1 Success server port ${port} is ready ${timeit()}`);
                }
            }, (err) => {
                if (doLog) {
                    console.log(`1.1 Timeout: Failed waiting on port ${port} to open ${timeit()}`, err);
                }
                assert.fail('unexpected timeout ' + err);
            });
            // Lets see if consecutive ports request works while server is still running. It should
            // skip the port we are already using
            args.consecutive = true;
            timeit();
            yield tcpportscanner_1.TcpPortScanner.findFreePorts(args, hostNameOrIp).then((ret) => {
                if (doLog) {
                    console.log(`Found free consecutive ports ${ret} ${timeit()}`);
                }
                const newPorts = ret;
                assert.strictEqual(newPorts.length, args.retrieve, `wrong number of ports ${newPorts}`);
                assert.strictEqual(newPorts[0] >= args.min, true);
                assert.strictEqual(newPorts[args.retrieve - 1] <= args.max, true);
                assert.deepStrictEqual(newPorts, newPorts.sort(), `ports are not ordered? ${newPorts}`);
                assert.strictEqual(newPorts.find((p) => p === port), undefined, `used port ${port} found as unused`);
                for (let ix = 1; ix < args.retrieve; ix++) {
                    assert.strictEqual(newPorts[ix - 1] + 1, newPorts[ix], `ports are not consecutive ${newPorts}`);
                }
            }).catch((e) => {
                assert.fail(`TcpPortScanner.find consecutive failed ${timeit()} ` + e);
            });
            // Close the server and try again. Not sure it closes instantly. It should since it should have
            // no one connected?!?
            server.close();
            timeit();
            yield tcpportscanner_1.TcpPortScanner.waitForPortClosed(port, hostNameOrIp, true, 50, 1000).then(() => {
                if (doLog) {
                    console.log(`2. Success Server port ${port} is closed ${timeit()}`);
                }
            }, (err) => {
                if (doLog) {
                    console.log(`2. Timeout: Failed waiting on port ${port} to close ${timeit()}`, err);
                }
                assert.strictEqual(err.message, 'timeout');
                assert.fail('Why is the server still running? ' + err);
            });
        }));
    })).timeout(4000);
});
//# sourceMappingURL=tcpportscanner.test.js.map